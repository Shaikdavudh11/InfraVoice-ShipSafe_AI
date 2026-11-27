import { ThinkingLevel, Type } from '@google/genai';
import { z } from 'zod';
import { getAiConfig } from '../ai/ai-config.ts';
import { wrapUntrustedContext } from '../ai/context-sanitizer.ts';
import { AiServiceError, generateWithRetry } from '../ai/gemini-client.ts';
import {
  getValidatedRemediationProposal,
  RemediationActionIdSchema,
} from './remediation-validator.ts';
import { getScenarioProfile } from './scenarios.ts';
import {
  getSimulationState,
  recordSimulationInvestigation,
} from './state-manager.ts';
import type {
  RemediationActionProposal,
  SimulationInvestigationReport,
  SimulationStateSnapshot,
} from './types.ts';

const SIMULATION_INVESTIGATION_SYSTEM_PROMPT = `You are InfraVoice, an expert Site Reliability Engineer investigating an isolated SIMULATED Kubernetes incident.

CRITICAL RULES:
1. Analyze ONLY the actual simulated cluster state, pod statuses, restart counts, logs, events, resource metrics, and deployment configuration supplied inside <untrusted_data>.
2. Never fabricate metrics, pod names, logs, or causes not supported by the supplied evidence.
3. Explicitly map the root cause to one of the server-side allowlisted remediation actions:
   - "restore_required_env_config" (use when required env/secretRef is missing and pods are in CrashLoopBackOff with startup config errors)
   - "fix_readiness_probe_path" (use when containers are running with 0 restarts but readinessProbe path returns HTTP 404 / NotReady)
   - "adjust_resource_limits_and_hpa" (use when CPU/memory limits are too low causing OOMKilled ExitCode=137 and CPU throttling)
4. You ONLY propose a remediation plan. You NEVER execute commands or claim recovery has already happened.
5. Keep explanations clear, concise, and grounded in evidence.

Return strictly valid JSON matching the requested schema.`;

export const SimulationInvestigationSchema = z.object({
  incidentSummary: z.string().min(1),
  mostLikelyRootCause: z.string().min(1),
  confidenceLevel: z.enum(['high', 'medium', 'low']),
  supportingEvidence: z.array(z.string().min(1)).min(1),
  affectedResources: z.array(z.string().min(1)).min(1),
  severityImpact: z.string().min(1),
  immediateRemediationSummary: z.string().min(1),
  proposedSteps: z.array(z.string().min(1)).min(1),
  verificationSteps: z.array(z.string().min(1)).min(1),
  preventionSuggestions: z.array(z.string().min(1)).min(1),
  recommendedActionId: RemediationActionIdSchema,
});

const SIMULATION_INVESTIGATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    incidentSummary: { type: Type.STRING },
    mostLikelyRootCause: { type: Type.STRING },
    confidenceLevel: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
    supportingEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
    affectedResources: { type: Type.ARRAY, items: { type: Type.STRING } },
    severityImpact: { type: Type.STRING },
    immediateRemediationSummary: { type: Type.STRING },
    proposedSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
    verificationSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
    preventionSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendedActionId: {
      type: Type.STRING,
      enum: [
        'restore_required_env_config',
        'fix_readiness_probe_path',
        'adjust_resource_limits_and_hpa',
      ],
    },
  },
  required: [
    'incidentSummary',
    'mostLikelyRootCause',
    'confidenceLevel',
    'supportingEvidence',
    'affectedResources',
    'severityImpact',
    'immediateRemediationSummary',
    'proposedSteps',
    'verificationSteps',
    'preventionSuggestions',
    'recommendedActionId',
  ],
};

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseReport(
  rawText: string
): { ok: true; data: z.infer<typeof SimulationInvestigationSchema> } | { ok: false; reason: string } {
  if (!rawText.trim()) {
    return { ok: false, reason: 'Empty JSON response from Gemini.' };
  }
  try {
    const parsed = JSON.parse(stripJsonFence(rawText));
    const validated = SimulationInvestigationSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        reason: validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
    }
    return { ok: true, data: validated.data };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Malformed JSON.' };
  }
}

/**
 * Builds the complete server-authoritative context payload sent to Gemini
 * for an active simulated incident. Exported for automated unit testing.
 */
export function buildSimulationGeminiContext(snapshot: SimulationStateSnapshot) {
  if (!snapshot.activeIncident) {
    throw new AiServiceError(
      'No active simulated incident to investigate. Trigger a scenario first.',
      400,
      'INVALID_RESPONSE',
      false
    );
  }

  return {
    simulatedEnvironment: true,
    incidentId: snapshot.activeIncident.id,
    scenario: snapshot.activeIncident.scenarioId,
    scenarioTitle: snapshot.activeIncident.title,
    incidentSeverity: snapshot.activeIncident.severity,
    incidentStatus: snapshot.activeIncident.status,
    incidentTimestamp: snapshot.activeIncident.triggeredAt,
    clusterName: snapshot.cluster.name,
    environment: snapshot.cluster.environment,
    namespace: snapshot.deployment.namespace,
    deployment: {
      name: snapshot.deployment.name,
      status: snapshot.deployment.status,
      desiredReplicas: snapshot.deployment.desiredReplicas,
      readyReplicas: snapshot.deployment.readyReplicas,
      unhealthyReplicas: snapshot.deployment.unhealthyReplicas,
      readinessProbePassing: snapshot.deployment.readinessProbePassing,
      livenessProbePassing: snapshot.deployment.livenessProbePassing,
      config: snapshot.deployment.config,
    },
    pods: snapshot.pods.map((p) => ({
      name: p.name,
      phase: p.phase,
      ready: p.ready,
      restarts: p.restarts,
      cpuPercent: p.cpuPercent,
      memoryPercent: p.memoryPercent,
      lastReason: p.lastReason,
    })),
    service: snapshot.service,
    metrics: snapshot.metrics,
    recentEvents: snapshot.events.slice(-12).map((e) => ({
      time: e.displayTime,
      type: e.type,
      source: e.source,
      title: e.title,
      detail: e.detail,
    })),
    recentLogs: snapshot.logs.slice(-15).map((l) => ({
      time: l.timestamp,
      level: l.level,
      pod: l.pod,
      message: l.message,
    })),
  };
}

export async function investigateActiveSimulationIncident(): Promise<{
  state: SimulationStateSnapshot;
  investigation: SimulationInvestigationReport;
  proposedRemediation: RemediationActionProposal;
}> {
  const snapshot = getSimulationState();
  if (!snapshot.activeIncident) {
    throw new AiServiceError(
      'No active simulated incident. Trigger a scenario before investigating with InfraVoice.',
      400,
      'INVALID_RESPONSE',
      false
    );
  }

  const contextObj = buildSimulationGeminiContext(snapshot);
  const cfg = getAiConfig();

  const prompt = [
    'Investigate this SIMULATED Kubernetes incident using the live simulated telemetry below.',
    'Produce a structured SRE investigation report and recommend the single matching allowlisted remediation actionId.',
    wrapUntrustedContext('simulation_incident_context', JSON.stringify(contextObj, null, 2), 11500),
  ].join('\n\n');

  const firstResp = await generateWithRetry({
    contents: prompt,
    systemInstruction: SIMULATION_INVESTIGATION_SYSTEM_PROMPT,
    responseMimeType: 'application/json',
    responseSchema: SIMULATION_INVESTIGATION_RESPONSE_SCHEMA,
    thinkingLevel: ThinkingLevel.MEDIUM,
  });

  let check = parseReport(firstResp.text || '');

  if (!check.ok) {
    const repairResp = await generateWithRetry({
      contents: [
        prompt,
        `PREVIOUS OUTPUT FAILED VALIDATION (${check.reason}). Return ONLY strictly valid JSON matching the schema.`,
      ].join('\n\n'),
      systemInstruction: SIMULATION_INVESTIGATION_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: SIMULATION_INVESTIGATION_RESPONSE_SCHEMA,
      thinkingLevel: ThinkingLevel.LOW,
    });
    check = parseReport(repairResp.text || '');
  }

  if (!check.ok) {
    throw new AiServiceError(
      'Gemini returned an invalid simulation investigation structure. Please retry.',
      502,
      'INVALID_RESPONSE',
      true
    );
  }

  // Validate Gemini's recommended action against the allowlist and scenario safety contract
  const scenarioExpectedAction = getScenarioProfile(snapshot.activeIncident.scenarioId)
    .remediationProposal.actionId;
  const validatedProposal =
    getValidatedRemediationProposal(check.data.recommendedActionId) ||
    getValidatedRemediationProposal(scenarioExpectedAction)!;

  // Guardrail: ensure proposal steps remain aligned with the validated allowlisted action
  const proposalForScenario: RemediationActionProposal =
    validatedProposal.actionId === scenarioExpectedAction
      ? {
          ...validatedProposal,
          steps: check.data.proposedSteps.length > 0 ? check.data.proposedSteps : validatedProposal.steps,
        }
      : getValidatedRemediationProposal(scenarioExpectedAction)!;

  const report: SimulationInvestigationReport = {
    ...check.data,
    recommendedActionId: proposalForScenario.actionId,
    model: cfg.model,
    investigatedAt: new Date().toISOString(),
  };

  const updatedState = recordSimulationInvestigation(report, proposalForScenario);
  return {
    state: updatedState,
    investigation: report,
    proposedRemediation: proposalForScenario,
  };
}
