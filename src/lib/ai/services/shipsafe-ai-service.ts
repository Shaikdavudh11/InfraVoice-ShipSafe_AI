import { ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import { getAiConfig } from '../ai-config.ts';
import { sanitizeUntrustedText, wrapUntrustedContext } from '../context-sanitizer.ts';
import { AiServiceError, generateWithRetry } from '../gemini-client.ts';
import { SHIPSAFE_ANALYSIS_SYSTEM_PROMPT } from '../prompts/shipsafe-analysis.ts';
import {
  SHIPSAFE_ANALYSIS_RESPONSE_SCHEMA,
  ShipSafeAiAnalysisSchema,
  type ShipSafeAiAnalysis,
} from '../schemas/ai-response.ts';

const ShipSafeAnalyzeRequestSchema = z.object({
  scanResult: z.object({
    scanId: z.string().min(1).max(120),
    timestamp: z.string().max(120).optional(),
    scannedAt: z.string().max(120).optional(),
    riskScore: z.number().min(0).max(100),
    riskLabel: z.string().max(60),
    riskFormula: z.string().max(400).optional(),
    overallSummary: z.string().max(1000).optional(),
    totalFindings: z.number().min(0),
    severityCounts: z.object({
      critical: z.number(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
      info: z.number(),
    }),
    fileSummaries: z
      .array(
        z.object({
          fileName: z.string().max(240),
          fileType: z.string().max(80),
          lineCount: z.number(),
          findingCount: z.number(),
        })
      )
      .min(1)
      .max(25),
    findings: z
      .array(
        z.object({
          id: z.string().max(120),
          ruleId: z.string().max(40),
          title: z.string().max(240),
          description: z.string().max(1000),
          severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
          category: z.string().max(60),
          fileName: z.string().max(240),
          lineNumber: z.number().nullable(),
          evidence: z.string().max(1200),
          impact: z.string().max(1000),
          recommendation: z.string().max(1000),
          fixExample: z.string().max(1500).optional(),
        })
      )
      .max(80),
  }),
});

export interface ShipSafeAnalyzeResponse {
  scanId: string;
  deterministicRiskScore: number;
  model: string;
  analyzedAt: string;
  analysis: ShipSafeAiAnalysis;
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseAndValidateAnalysis(rawText: string): { ok: true; data: ShipSafeAiAnalysis } | { ok: false; reason: string } {
  if (!rawText || !rawText.trim()) {
    return { ok: false, reason: 'Empty JSON response from Gemini.' };
  }
  try {
    const parsedJson = JSON.parse(stripJsonFence(rawText));
    const validated = ShipSafeAiAnalysisSchema.safeParse(parsedJson);
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

export async function analyzeShipSafeScan(rawInput: unknown): Promise<ShipSafeAnalyzeResponse> {
  const parsedReq = ShipSafeAnalyzeRequestSchema.safeParse(rawInput);
  if (!parsedReq.success) {
    throw new AiServiceError(
      parsedReq.error.issues[0]?.message || 'Valid deterministic ShipSafe scanResult is required.',
      400,
      'INVALID_RESPONSE',
      false
    );
  }

  const { scanResult } = parsedReq.data;
  const cfg = getAiConfig();

  const sanitizedPayload = {
    scanId: scanResult.scanId,
    deterministicRiskScore: scanResult.riskScore,
    riskLabel: scanResult.riskLabel,
    totalFindings: scanResult.totalFindings,
    severityCounts: scanResult.severityCounts,
    filesScanned: scanResult.fileSummaries.map((f) => ({
      fileName: sanitizeUntrustedText(f.fileName, 180),
      fileType: f.fileType,
      lineCount: f.lineCount,
      findingCount: f.findingCount,
    })),
    findings: scanResult.findings.slice(0, 40).map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      category: f.category,
      fileName: sanitizeUntrustedText(f.fileName, 180),
      lineNumber: f.lineNumber,
      title: f.title,
      description: f.description,
      evidence: sanitizeUntrustedText(f.evidence, 220),
      impact: f.impact,
      recommendation: f.recommendation,
    })),
  };

  const userPrompt = [
    'Analyze the following deterministic ShipSafe scan result and provide prioritized DevSecOps guidance.',
    'Remember: Do NOT alter the deterministicRiskScore or invent rule IDs.',
    wrapUntrustedContext('deterministic_shipsafe_scan', JSON.stringify(sanitizedPayload, null, 2), 11000),
  ].join('\n\n');

  const firstResponse = await generateWithRetry({
    contents: userPrompt,
    systemInstruction: SHIPSAFE_ANALYSIS_SYSTEM_PROMPT,
    responseMimeType: 'application/json',
    responseSchema: SHIPSAFE_ANALYSIS_RESPONSE_SCHEMA,
    thinkingLevel: ThinkingLevel.MEDIUM,
  });

  let check = parseAndValidateAnalysis(firstResponse.text || '');

  // One structured repair attempt if malformed JSON or schema mismatch
  if (!check.ok) {
    const repairPrompt = [
      userPrompt,
      `PREVIOUS OUTPUT FAILED SCHEMA VALIDATION (${check.reason}). Return ONLY strictly valid JSON matching the schema.`,
    ].join('\n\n');

    const repairResponse = await generateWithRetry({
      contents: repairPrompt,
      systemInstruction: SHIPSAFE_ANALYSIS_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: SHIPSAFE_ANALYSIS_RESPONSE_SCHEMA,
      thinkingLevel: ThinkingLevel.LOW,
    });

    check = parseAndValidateAnalysis(repairResponse.text || '');
  }

  if (!check.ok) {
    throw new AiServiceError(
      'Gemini returned an invalid structured ShipSafe analysis payload. Please retry.',
      502,
      'INVALID_RESPONSE',
      true
    );
  }

  const validRuleIds = new Set(scanResult.findings.map((f) => f.ruleId));
  const analysis: ShipSafeAiAnalysis = { ...check.data };

  // Enforce grounding invariant against deterministic findings
  if (scanResult.totalFindings === 0) {
    analysis.deploymentReadiness = 'Ready to Ship';
    analysis.findingInsights = [];
    analysis.findingRelationships = [];
    analysis.prioritizedPlan = analysis.prioritizedPlan.map((item) => ({
      ...item,
      ruleIds: [],
    }));
  } else {
    analysis.findingInsights = analysis.findingInsights.filter((ins) =>
      validRuleIds.has(ins.ruleId)
    );
    analysis.prioritizedPlan = analysis.prioritizedPlan.map((item) => ({
      ...item,
      ruleIds: item.ruleIds.filter((id) => validRuleIds.has(id)),
    }));
  }

  return {
    scanId: scanResult.scanId,
    deterministicRiskScore: scanResult.riskScore,
    model: cfg.model,
    analyzedAt: new Date().toISOString(),
    analysis,
  };
}
