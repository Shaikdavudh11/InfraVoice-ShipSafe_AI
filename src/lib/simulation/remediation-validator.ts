import { z } from 'zod';
import { REMEDIATION_PROPOSALS } from './scenarios.ts';
import type {
  RemediationActionProposal,
  RemediationActionType,
  SimulationStateSnapshot,
} from './types.ts';

export const ALLOWED_REMEDIATION_ACTION_IDS: readonly RemediationActionType[] = [
  'restore_required_env_config',
  'fix_readiness_probe_path',
  'adjust_resource_limits_and_hpa',
] as const;

export const RemediationActionIdSchema = z.enum([
  'restore_required_env_config',
  'fix_readiness_probe_path',
  'adjust_resource_limits_and_hpa',
]);

export const ApproveRemediationRequestSchema = z.object({
  incidentId: z.string().trim().min(1, 'incidentId is required.').max(80),
  actionId: z.string().trim().min(1, 'actionId is required.').max(80),
  approved: z.boolean(),
});

export type ApproveRemediationInput = z.infer<typeof ApproveRemediationRequestSchema>;

export function isAllowedRemediationAction(actionId: string): actionId is RemediationActionType {
  return (ALLOWED_REMEDIATION_ACTION_IDS as readonly string[]).includes(actionId);
}

export function getValidatedRemediationProposal(
  actionId: string
): RemediationActionProposal | null {
  if (!isAllowedRemediationAction(actionId)) {
    return null;
  }
  return REMEDIATION_PROPOSALS[actionId];
}

export interface RemediationValidationOutcome {
  ok: boolean;
  statusCode: number;
  error?: string;
  actionId?: RemediationActionType;
  proposal?: RemediationActionProposal;
}

/**
 * Server-side RemediationPlanValidator:
 * - Enforces explicit human approval (approved === true).
 * - Validates actionId against the strict predefined allowlist (never arbitrary commands).
 * - Confirms an active, unresolved incident exists and matches incidentId.
 * - Ensures the action matches the active scenario's validated remediation plan.
 */
export function validateRemediationApproval(
  rawInput: unknown,
  state: SimulationStateSnapshot
): RemediationValidationOutcome {
  const parsed = ApproveRemediationRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      statusCode: 400,
      error: parsed.error.issues[0]?.message || 'Invalid remediation approval payload.',
    };
  }

  const { incidentId, actionId, approved } = parsed.data;

  if (!approved) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Explicit user approval (approved: true) is required before applying any simulated remediation.',
    };
  }

  if (!isAllowedRemediationAction(actionId)) {
    return {
      ok: false,
      statusCode: 400,
      error: `Remediation action "${actionId}" is not on the server-side simulation allowlist.`,
    };
  }

  if (!state.activeIncident) {
    return {
      ok: false,
      statusCode: 409,
      error: 'No active simulated incident exists to remediate.',
    };
  }

  if (state.activeIncident.id !== incidentId) {
    return {
      ok: false,
      statusCode: 409,
      error: `Incident ID mismatch. Active incident is ${state.activeIncident.id}.`,
    };
  }

  if (state.activeIncident.status === 'resolved') {
    return {
      ok: false,
      statusCode: 409,
      error: `Incident ${incidentId} is already resolved.`,
    };
  }

  if (state.activeIncident.status === 'recovering') {
    return {
      ok: false,
      statusCode: 409,
      error: `Simulated recovery is already in progress for ${incidentId}.`,
    };
  }

  if (!state.activeIncident.proposedRemediation) {
    return {
      ok: false,
      statusCode: 409,
      error: 'Run InfraVoice investigation first so a validated remediation plan is proposed before approval.',
    };
  }

  if (state.activeIncident.proposedRemediation.actionId !== actionId) {
    return {
      ok: false,
      statusCode: 400,
      error: `Action "${actionId}" does not match the proposed remediation (${state.activeIncident.proposedRemediation.actionId}) for scenario ${state.activeIncident.scenarioId}.`,
    };
  }

  return {
    ok: true,
    statusCode: 200,
    actionId,
    proposal: state.activeIncident.proposedRemediation,
  };
}
