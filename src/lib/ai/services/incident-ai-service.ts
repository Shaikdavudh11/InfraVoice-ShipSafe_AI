import { ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import { getAiConfig } from '../ai-config.ts';
import { sanitizeUntrustedText, wrapUntrustedContext } from '../context-sanitizer.ts';
import { AiServiceError, generateWithRetry } from '../gemini-client.ts';
import { INCIDENT_INVESTIGATION_SYSTEM_PROMPT } from '../prompts/incident-investigation.ts';
import {
  INCIDENT_INVESTIGATION_RESPONSE_SCHEMA,
  IncidentInvestigationSchema,
  type IncidentInvestigationReport,
} from '../schemas/ai-response.ts';

const IncidentInvestigateRequestSchema = z.object({
  incident: z.object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(240),
    severity: z.string().min(1).max(40),
    status: z.string().min(1).max(40),
    affectedService: z.string().min(1).max(160),
    namespace: z.string().max(120).optional(),
    timestamp: z.string().max(120).optional(),
    summary: z.string().min(1).max(2500),
    timeline: z
      .array(
        z.object({
          timestamp: z.string().max(80),
          source: z.string().max(120),
          title: z.string().max(240),
          detail: z.string().max(800),
        })
      )
      .max(30)
      .default([]),
    logs: z
      .array(
        z.object({
          timestamp: z.string().max(80),
          level: z.string().max(20),
          pod: z.string().max(160).optional(),
          message: z.string().max(1200),
        })
      )
      .max(80)
      .default([]),
    rawEvidenceText: z.string().max(12000).optional(),
  }),
});

export interface IncidentInvestigateResponse {
  incidentId: string;
  model: string;
  investigatedAt: string;
  report: IncidentInvestigationReport;
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseAndValidateReport(
  rawText: string
): { ok: true; data: IncidentInvestigationReport } | { ok: false; reason: string } {
  if (!rawText || !rawText.trim()) {
    return { ok: false, reason: 'Empty JSON response from Gemini.' };
  }
  try {
    const parsedJson = JSON.parse(stripJsonFence(rawText));
    const validated = IncidentInvestigationSchema.safeParse(parsedJson);
    if (!validated.success) {
      return {
        ok: false,
        reason: validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
    }
    return { ok: true, data: validated.data };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Invalid JSON syntax.',
    };
  }
}

export async function investigateIncident(rawInput: unknown): Promise<IncidentInvestigateResponse> {
  const parsedReq = IncidentInvestigateRequestSchema.safeParse(rawInput);
  if (!parsedReq.success) {
    throw new AiServiceError(
      parsedReq.error.issues[0]?.message || 'Valid incident context payload is required.',
      400,
      'INVALID_RESPONSE',
      false
    );
  }

  const { incident } = parsedReq.data;
  const cfg = getAiConfig();

  const sanitizedIncident = {
    id: incident.id,
    title: sanitizeUntrustedText(incident.title, 240),
    severity: incident.severity,
    status: incident.status,
    affectedService: sanitizeUntrustedText(incident.affectedService, 160),
    namespace: incident.namespace ? sanitizeUntrustedText(incident.namespace, 120) : 'unknown',
    timestamp: incident.timestamp || 'unknown',
    summary: sanitizeUntrustedText(incident.summary, 1500),
    timeline: incident.timeline.slice(0, 20).map((ev) => ({
      timestamp: ev.timestamp,
      source: sanitizeUntrustedText(ev.source, 100),
      title: sanitizeUntrustedText(ev.title, 200),
      detail: sanitizeUntrustedText(ev.detail, 400),
    })),
    logs: incident.logs.slice(0, 40).map((l) => ({
      timestamp: l.timestamp,
      level: l.level,
      pod: l.pod ? sanitizeUntrustedText(l.pod, 120) : undefined,
      message: sanitizeUntrustedText(l.message, 400),
    })),
    additionalPastedEvidence: incident.rawEvidenceText
      ? sanitizeUntrustedText(incident.rawEvidenceText, 5000)
      : undefined,
  };

  const userPrompt = [
    'Investigate the following incident strictly based on the supplied evidence.',
    'Separate confirmedEvidence from inferredCauses and unverifiedHypotheses. Do not fabricate logs, pods, or metrics.',
    wrapUntrustedContext('incident_payload', JSON.stringify(sanitizedIncident, null, 2), 11500),
  ].join('\n\n');

  const firstResponse = await generateWithRetry({
    contents: userPrompt,
    systemInstruction: INCIDENT_INVESTIGATION_SYSTEM_PROMPT,
    responseMimeType: 'application/json',
    responseSchema: INCIDENT_INVESTIGATION_RESPONSE_SCHEMA,
    thinkingLevel: ThinkingLevel.MEDIUM,
  });

  let check = parseAndValidateReport(firstResponse.text || '');

  if (!check.ok) {
    const repairPrompt = [
      userPrompt,
      `PREVIOUS OUTPUT FAILED SCHEMA VALIDATION (${check.reason}). Return ONLY strictly valid JSON matching the schema.`,
    ].join('\n\n');

    const repairResponse = await generateWithRetry({
      contents: repairPrompt,
      systemInstruction: INCIDENT_INVESTIGATION_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: INCIDENT_INVESTIGATION_RESPONSE_SCHEMA,
      thinkingLevel: ThinkingLevel.LOW,
    });

    check = parseAndValidateReport(repairResponse.text || '');
  }

  if (!check.ok) {
    throw new AiServiceError(
      'Gemini returned an invalid structured incident report. Please retry.',
      502,
      'INVALID_RESPONSE',
      true
    );
  }

  return {
    incidentId: incident.id,
    model: cfg.model,
    investigatedAt: new Date().toISOString(),
    report: check.data,
  };
}
