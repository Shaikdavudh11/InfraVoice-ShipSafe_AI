import {
  BASELINE_CONFIG,
  getScenarioProfile,
  SCENARIO_CATALOG,
} from './scenarios.ts';
import {
  validateRemediationApproval,
  type RemediationValidationOutcome,
} from './remediation-validator.ts';
import { verifySimulationRecovery } from './verification-service.ts';
import type {
  RemediationActionProposal,
  RemediationActionType,
  SimulationActionRecord,
  SimulationEvent,
  SimulationIncident,
  SimulationInvestigationReport,
  SimulationLog,
  SimulationPod,
  SimulationScenarioId,
  SimulationStateSnapshot,
} from './types.ts';

const MAX_EVENTS = 80;
const MAX_LOGS = 80;
const MAX_ACTIONS = 30;

function formatDisplayTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function createBaselinePods(nowIso: string): SimulationPod[] {
  return [
    {
      name: 'payments-api-7f9b4c-x8k2p',
      namespace: 'payments',
      phase: 'Running',
      ready: true,
      restarts: 0,
      cpuPercent: 31,
      memoryPercent: 42,
      lastReason: 'Ready',
      startedAt: nowIso,
    },
    {
      name: 'payments-api-7f9b4c-m4v9q',
      namespace: 'payments',
      phase: 'Running',
      ready: true,
      restarts: 0,
      cpuPercent: 34,
      memoryPercent: 40,
      lastReason: 'Ready',
      startedAt: nowIso,
    },
    {
      name: 'payments-api-7f9b4c-p2n7w',
      namespace: 'payments',
      phase: 'Running',
      ready: true,
      restarts: 0,
      cpuPercent: 29,
      memoryPercent: 43,
      lastReason: 'Ready',
      startedAt: nowIso,
    },
  ];
}

function createBaselineState(): SimulationStateSnapshot {
  const now = new Date();
  const nowIso = now.toISOString();
  const displayTime = formatDisplayTime(now);

  return {
    simulated: true,
    environmentBanner:
      'SIMULATED ENVIRONMENT — Isolated hackathon simulation. No real cloud or Kubernetes cluster is connected.',
    recoveryStage: 'idle',
    cluster: {
      name: 'demo-payments-cluster',
      environment: 'hackathon-simulation',
      region: 'ap-south-1 (simulated)',
      simulated: true,
      status: 'healthy',
    },
    deployment: {
      name: 'payments-api',
      namespace: 'payments',
      desiredReplicas: 3,
      readyReplicas: 3,
      unhealthyReplicas: 0,
      status: 'healthy',
      readinessProbePassing: true,
      livenessProbePassing: true,
      config: { ...BASELINE_CONFIG },
    },
    pods: createBaselinePods(nowIso),
    service: {
      name: 'payments-service',
      namespace: 'payments',
      endpoint: 'https://payments.demo-cluster.internal/v1',
      health: 'healthy',
      availableEndpoints: 3,
      expectedEndpoints: 3,
      availabilityPercent: 99.98,
      p99LatencyMs: 42,
      errorRatePercent: 0.02,
    },
    metrics: {
      cpuUtilizationPercent: 32,
      memoryUtilizationPercent: 42,
      p99LatencyMs: 42,
      requestsPerSecond: 310,
      errorRatePercent: 0.02,
    },
    activeIncident: null,
    events: [
      {
        id: 'sim-ev-init',
        timestamp: nowIso,
        displayTime,
        type: 'info',
        source: 'simulation-engine',
        title: 'Simulation started — baseline healthy',
        detail:
          'Isolated cluster demo-payments-cluster initialized with 3/3 ready pods on deployment/payments-api.',
      },
    ],
    logs: [
      {
        id: 'sim-log-init-1',
        timestamp: displayTime,
        level: 'INFO',
        pod: 'payments-api-7f9b4c-x8k2p',
        message: 'payments-api v2.14.0 listening on :8080; secretRef payments-signing-config loaded.',
      },
      {
        id: 'sim-log-init-2',
        timestamp: displayTime,
        level: 'INFO',
        pod: 'payments-api-7f9b4c-m4v9q',
        message: 'GET /healthz 200 OK (2ms) — readiness & liveness probes healthy.',
      },
      {
        id: 'sim-log-init-3',
        timestamp: displayTime,
        level: 'INFO',
        pod: 'payments-api-7f9b4c-p2n7w',
        message: 'Settlement worker steady: 310 req/s, p99=42ms, mem=215Mi/512Mi.',
      },
    ],
    actionHistory: [],
    lastUpdatedAt: nowIso,
    scenarios: SCENARIO_CATALOG,
  };
}

let state: SimulationStateSnapshot = createBaselineState();
let incidentCounter = 400;
let eventCounter = 1;
let logCounter = 10;
let activeRecoveryTimers: Array<ReturnType<typeof setTimeout>> = [];
let pendingRecoveryContext: {
  actionId: RemediationActionType;
  actionRecordId: string;
  forceVerificationFailure?: boolean;
} | null = null;

function clearRecoveryTimers(): void {
  for (const timer of activeRecoveryTimers) {
    clearTimeout(timer);
  }
  activeRecoveryTimers = [];
}

function appendEvent(
  type: SimulationEvent['type'],
  source: string,
  title: string,
  detail: string
): SimulationEvent {
  const now = new Date();
  const ev: SimulationEvent = {
    id: `sim-ev-${++eventCounter}`,
    timestamp: now.toISOString(),
    displayTime: formatDisplayTime(now),
    type,
    source,
    title,
    detail,
  };
  state.events = [...state.events, ev].slice(-MAX_EVENTS);
  state.lastUpdatedAt = ev.timestamp;
  return ev;
}

function appendLog(
  level: SimulationLog['level'],
  pod: string,
  message: string
): SimulationLog {
  const now = new Date();
  const entry: SimulationLog = {
    id: `sim-log-${++logCounter}`,
    timestamp: formatDisplayTime(now),
    level,
    pod,
    message,
  };
  state.logs = [...state.logs, entry].slice(-MAX_LOGS);
  state.lastUpdatedAt = now.toISOString();
  return entry;
}

function syncPodCountsFromPods(): void {
  const readyCount = state.pods.filter((p) => p.ready && p.phase === 'Running').length;
  const unhealthyCount = state.pods.filter((p) => !p.ready || p.phase !== 'Running').length;
  state.deployment.readyReplicas = readyCount;
  state.deployment.unhealthyReplicas = unhealthyCount;
  state.service.availableEndpoints = readyCount;
}

export function getSimulationState(): SimulationStateSnapshot {
  return structuredClone(state);
}

export function getSimulationEvents(): SimulationEvent[] {
  return structuredClone(state.events);
}

/**
 * IncidentTriggerService:
 * Deterministically transitions the simulated cluster into the selected failure scenario.
 * Guards against accidental double-clicks creating duplicate incidents for the same active scenario.
 */
export function triggerIncidentScenario(scenarioId: SimulationScenarioId): SimulationStateSnapshot {
  const existing = state.activeIncident;
  if (
    existing &&
    existing.scenarioId === scenarioId &&
    (existing.status === 'open' ||
      existing.status === 'investigating' ||
      existing.status === 'recovering')
  ) {
    // Idempotent return — prevents duplicate SIM-INC IDs and duplicate logs on accidental double-click
    return getSimulationState();
  }

  clearRecoveryTimers();
  pendingRecoveryContext = null;

  const profile = getScenarioProfile(scenarioId);
  const now = new Date();
  const nowIso = now.toISOString();
  const displayTime = formatDisplayTime(now);
  const incidentId = `SIM-INC-${++incidentCounter}`;

  state.recoveryStage = 'idle';
  state.cluster.status = profile.deploymentStatus;
  state.deployment.status = profile.deploymentStatus;
  state.deployment.readinessProbePassing = profile.readinessProbePassing;
  state.deployment.livenessProbePassing = profile.livenessProbePassing;
  state.deployment.config = {
    ...BASELINE_CONFIG,
    ...profile.configPatch,
  };

  state.pods = profile.pods(nowIso);
  syncPodCountsFromPods();

  state.service = {
    ...state.service,
    ...profile.servicePatch,
    availableEndpoints: state.deployment.readyReplicas,
  };
  state.metrics = { ...profile.metrics };

  state.activeIncident = {
    id: incidentId,
    scenarioId,
    title: profile.descriptor.title,
    severity: profile.descriptor.severity,
    status: 'open',
    triggeredAt: nowIso,
    resolvedAt: null,
    summary: profile.incidentSummary,
    affectedResource: `deployment/${state.deployment.name} (${state.deployment.namespace})`,
    investigation: null,
    proposedRemediation: null,
    verification: null,
  };

  appendEvent(
    'error',
    'incident-trigger',
    `Incident ${incidentId} triggered — ${profile.descriptor.title}`,
    profile.incidentSummary
  );

  for (const ev of profile.events) {
    appendEvent(ev.type, ev.source, ev.title, ev.detail);
  }

  for (const log of profile.logs(displayTime)) {
    appendLog(log.level, log.pod, log.message);
  }

  state.lastUpdatedAt = nowIso;
  return getSimulationState();
}

/**
 * Attaches a validated Gemini investigation report and allowlisted remediation plan
 * to the currently open simulated incident.
 */
export function recordSimulationInvestigation(
  report: SimulationInvestigationReport,
  validatedProposal: RemediationActionProposal
): SimulationStateSnapshot {
  if (!state.activeIncident) {
    return getSimulationState();
  }

  state.activeIncident.status = 'investigating';
  state.activeIncident.investigation = report;
  state.activeIncident.proposedRemediation = validatedProposal;

  appendEvent(
    'info',
    'infravoice-gemini',
    'InfraVoice investigation completed',
    `Gemini (${report.model}) diagnosed "${report.mostLikelyRootCause}" with ${report.confidenceLevel} confidence.`
  );

  appendEvent(
    'action',
    'remediation-validator',
    `Remediation plan proposed: ${validatedProposal.title}`,
    `Validated allowlisted action "${validatedProposal.actionId}". Waiting for explicit engineer approval.`
  );

  return getSimulationState();
}

function applyConfigCorrectionStep(actionId: RemediationActionType): void {
  const nowIso = new Date().toISOString();
  state.recoveryStage = 'applying_config';
  state.cluster.status = 'recovering';
  state.deployment.status = 'recovering';
  state.service.health = 'recovering';

  if (state.activeIncident) {
    state.activeIncident.status = 'recovering';
  }

  // Apply only the allowlisted simulated config patch
  if (actionId === 'restore_required_env_config') {
    state.deployment.config = {
      ...state.deployment.config,
      revision: state.deployment.config.revision + 1,
      requiredEnvConfigured: true,
      envSecretRef: 'payments-signing-config',
    };
    appendEvent(
      'recovery',
      'simulation-recovery-engine',
      'Configuration corrected (rev 15)',
      'Restored envFrom.secretRef "payments-signing-config" in simulated deployment/payments-api.'
    );
    appendLog(
      'INFO',
      'payments-api-7f9b4c-x8k2p',
      'Applying simulated Deployment rev 15: secretRef payments-signing-config attached.'
    );
  } else if (actionId === 'fix_readiness_probe_path') {
    state.deployment.config = {
      ...state.deployment.config,
      revision: state.deployment.config.revision + 1,
      readinessProbePath: '/healthz',
    };
    appendEvent(
      'recovery',
      'simulation-recovery-engine',
      'Readiness probe path corrected (rev 15)',
      'Updated simulated readinessProbe.httpGet.path from /internal/healthz-v2 back to /healthz.'
    );
    appendLog(
      'INFO',
      'payments-api-7f9b4c-x8k2p',
      'Applying simulated Deployment rev 15: readinessProbe path updated to /healthz.'
    );
  } else if (actionId === 'adjust_resource_limits_and_hpa') {
    state.deployment.config = {
      ...state.deployment.config,
      revision: state.deployment.config.revision + 1,
      cpuRequest: '200m',
      cpuLimit: '500m',
      memoryRequest: '256Mi',
      memoryLimit: '512Mi',
    };
    appendEvent(
      'recovery',
      'simulation-recovery-engine',
      'Resource limits restored (rev 15)',
      'Updated simulated deployment/payments-api limits to cpu=500m, memory=512Mi.'
    );
    appendLog(
      'INFO',
      'payments-api-7f9b4c-x8k2p',
      'Applying simulated Deployment rev 15: resource limits restored to 500m CPU / 512Mi memory.'
    );
  }

  // Transition unhealthy pods into Starting phase (CrashLoopBackOff/OOMKilled/NotReady -> Starting)
  state.pods = state.pods.map((pod) => ({
    ...pod,
    phase: 'Starting',
    ready: false,
    cpuPercent: 22,
    memoryPercent: 28,
    lastReason: 'Container starting with rev 15 configuration',
    startedAt: nowIso,
  }));
  syncPodCountsFromPods();
  state.service.availabilityPercent = 0;
  state.service.errorRatePercent = 100;
}

function advancePodsToRunningStep(forceVerificationFailure = false): void {
  const nowIso = new Date().toISOString();
  state.recoveryStage = 'restarting_pods';

  if (forceVerificationFailure) {
    // Keep one pod intentionally NotReady to exercise failed verification path
    state.pods = state.pods.map((pod, idx) =>
      idx === 0
        ? {
            ...pod,
            phase: 'NotReady',
            ready: false,
            cpuPercent: 30,
            memoryPercent: 45,
            lastReason: 'Simulated probe timeout during verification check',
            startedAt: nowIso,
          }
        : {
            ...pod,
            phase: 'Running',
            ready: true,
            cpuPercent: 32,
            memoryPercent: 41,
            lastReason: 'Ready',
            startedAt: nowIso,
          }
    );
    syncPodCountsFromPods();
    state.deployment.readinessProbePassing = false;
    state.service.health = 'degraded';
    state.service.availabilityPercent = 66.7;
    state.service.errorRatePercent = 12.5;
    state.metrics = {
      cpuUtilizationPercent: 48,
      memoryUtilizationPercent: 52,
      p99LatencyMs: 240,
      requestsPerSecond: 210,
      errorRatePercent: 12.5,
    };
    appendEvent(
      'warning',
      'kubelet',
      'Simulated rollout partial — 2/3 pods Running, 1 pod NotReady',
      'One replica failed post-rollout readiness probe during simulated restart.'
    );
    return;
  }

  // Transition pods from Starting -> Running -> Ready
  state.pods = state.pods.map((pod, idx) => ({
    ...pod,
    phase: 'Running',
    ready: true,
    cpuPercent: 30 + idx * 2,
    memoryPercent: 41 + idx,
    lastReason: 'Ready (rev 15)',
    startedAt: nowIso,
  }));
  syncPodCountsFromPods();
  state.deployment.readinessProbePassing = true;
  state.deployment.livenessProbePassing = true;
  state.service.health = 'healthy';
  state.service.availabilityPercent = 99.98;
  state.service.p99LatencyMs = 42;
  state.service.errorRatePercent = 0.02;
  state.metrics = {
    cpuUtilizationPercent: 32,
    memoryUtilizationPercent: 42,
    p99LatencyMs: 42,
    requestsPerSecond: 310,
    errorRatePercent: 0.02,
  };

  appendEvent(
    'recovery',
    'kubelet',
    'Pods restarted and reached Running / Ready (3/3)',
    'All 3 simulated payments-api replicas transitioned Starting → Running → Ready.'
  );
  appendLog(
    'INFO',
    'payments-api-7f9b4c-x8k2p',
    'Startup complete (rev 15). GET /healthz returned 200 OK; pod marked Ready.'
  );
  appendLog(
    'INFO',
    'payments-api-7f9b4c-m4v9q',
    'EndpointSlice updated: 3/3 endpoints registered on payments-service.'
  );
}

function runVerificationAndFinalizeStep(actionRecordId: string): void {
  state.recoveryStage = 'verifying';
  const verification = verifySimulationRecovery(state);
  const nowIso = verification.verifiedAt;

  if (state.activeIncident) {
    state.activeIncident.verification = verification;
  }

  const record = state.actionHistory.find((a) => a.id === actionRecordId);

  if (verification.passed) {
    state.recoveryStage = 'completed';
    state.cluster.status = 'healthy';
    state.deployment.status = 'healthy';
    state.service.health = 'healthy';

    if (state.activeIncident) {
      state.activeIncident.status = 'resolved';
      state.activeIncident.resolvedAt = nowIso;
    }

    if (record) {
      record.status = 'completed';
      record.completedAt = nowIso;
      record.summary = verification.summary;
    }

    appendEvent(
      'verification',
      'recovery-verification-service',
      'Readiness verification passed (5/5 deterministic checks)',
      verification.summary
    );
    appendEvent(
      'recovery',
      'endpoint-controller',
      'Service restored — payments-service healthy (3/3 endpoints)',
      'Simulated traffic availability restored to 99.98% with p99 latency 42ms.'
    );
    appendEvent(
      'verification',
      'incident-manager',
      `Incident ${state.activeIncident?.id ?? ''} resolved`,
      'Incident marked resolved only after deterministic verification passed.'
    );
  } else {
    state.recoveryStage = 'failed';
    state.cluster.status = 'degraded';
    state.deployment.status = 'degraded';
    state.service.health = 'degraded';

    if (state.activeIncident) {
      state.activeIncident.status = 'open';
      state.activeIncident.resolvedAt = null;
    }

    if (record) {
      record.status = 'verification_failed';
      record.completedAt = nowIso;
      record.summary = verification.summary;
    }

    appendEvent(
      'error',
      'recovery-verification-service',
      'Recovery verification failed — incident remains open',
      verification.summary
    );
  }

  pendingRecoveryContext = null;
}

/**
 * SimulationRecoveryEngine:
 * Applies an explicitly approved, server-validated allowlisted action.
 * Supports stepped transitions (Starting -> Running -> Ready -> Verified).
 */
export function approveAndStartRecovery(
  rawInput: unknown,
  options?: {
    fastForward?: boolean;
    stepDelayMs?: number;
    forceVerificationFailure?: boolean;
  }
): {
  ok: boolean;
  statusCode: number;
  error?: string;
  state?: SimulationStateSnapshot;
  actionRecord?: SimulationActionRecord;
} {
  const validation: RemediationValidationOutcome = validateRemediationApproval(rawInput, state);
  if (!validation.ok || !validation.actionId || !validation.proposal || !state.activeIncident) {
    return {
      ok: false,
      statusCode: validation.statusCode,
      error: validation.error || 'Remediation validation failed.',
    };
  }

  clearRecoveryTimers();

  const nowIso = new Date().toISOString();
  const actionRecord: SimulationActionRecord = {
    id: `sim-act-${Date.now()}-${eventCounter}`,
    incidentId: state.activeIncident.id,
    actionId: validation.actionId,
    title: validation.proposal.title,
    status: 'approved_applying',
    approvedAt: nowIso,
    completedAt: null,
    approvedBy: 'Engineer (Explicit Approval)',
    summary: 'Approved by user; applying simulated recovery steps.',
  };

  state.actionHistory = [actionRecord, ...state.actionHistory].slice(0, MAX_ACTIONS);

  appendEvent(
    'action',
    'human-approval-gate',
    'User approved simulated recovery',
    `Approved allowlisted action "${validation.actionId}" for incident ${state.activeIncident.id}.`
  );

  // Step 1 immediately: apply config & transition pods to Starting
  applyConfigCorrectionStep(validation.actionId);

  pendingRecoveryContext = {
    actionId: validation.actionId,
    actionRecordId: actionRecord.id,
    forceVerificationFailure: options?.forceVerificationFailure,
  };

  if (options?.fastForward) {
    advancePodsToRunningStep(Boolean(options.forceVerificationFailure));
    runVerificationAndFinalizeStep(actionRecord.id);
    return {
      ok: true,
      statusCode: 200,
      state: getSimulationState(),
      actionRecord: structuredClone(
        state.actionHistory.find((a) => a.id === actionRecord.id) || actionRecord
      ),
    };
  }

  // Stepped async progression for live UI visibility (Starting -> Running/Ready -> Verified)
  const delay = options?.stepDelayMs ?? 700;
  const t1 = setTimeout(() => {
    if (!pendingRecoveryContext || pendingRecoveryContext.actionRecordId !== actionRecord.id) return;
    advancePodsToRunningStep(Boolean(pendingRecoveryContext.forceVerificationFailure));
  }, delay);

  const t2 = setTimeout(() => {
    if (!pendingRecoveryContext || pendingRecoveryContext.actionRecordId !== actionRecord.id) return;
    runVerificationAndFinalizeStep(actionRecord.id);
  }, delay * 2);

  activeRecoveryTimers.push(t1, t2);

  return {
    ok: true,
    statusCode: 200,
    state: getSimulationState(),
    actionRecord: structuredClone(actionRecord),
  };
}

/**
 * Deterministic manual stepping helper for automated tests to inspect
 * intermediate pod states (Starting -> Running -> Ready -> Verified) without timers.
 */
export function stepPendingRecoveryForTests(): SimulationStateSnapshot {
  if (!pendingRecoveryContext) {
    return getSimulationState();
  }
  clearRecoveryTimers();

  if (state.recoveryStage === 'applying_config') {
    advancePodsToRunningStep(Boolean(pendingRecoveryContext.forceVerificationFailure));
    return getSimulationState();
  }

  if (state.recoveryStage === 'restarting_pods') {
    runVerificationAndFinalizeStep(pendingRecoveryContext.actionRecordId);
    return getSimulationState();
  }

  return getSimulationState();
}

/**
 * SimulationResetService:
 * Restores the simulated cluster back to clean healthy baseline without touching real infrastructure.
 */
export function resetSimulationEnvironment(): SimulationStateSnapshot {
  clearRecoveryTimers();
  pendingRecoveryContext = null;

  const archivedCount = state.actionHistory.length;
  state = createBaselineState();
  if (archivedCount > 0) {
    appendEvent(
      'info',
      'simulation-reset-service',
      'Simulation reset to healthy baseline',
      `Cleared active scenario and archived ${archivedCount} simulated action record(s). Cluster restored to 3/3 ready pods.`
    );
  }
  return getSimulationState();
}
