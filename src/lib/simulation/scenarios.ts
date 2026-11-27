import type {
  RemediationActionProposal,
  RemediationActionType,
  ScenarioDescriptor,
  SimulationDeploymentConfig,
  SimulationLog,
  SimulationMetrics,
  SimulationPod,
  SimulationScenarioId,
  SimulationService,
} from './types.ts';

export const BASELINE_CONFIG: SimulationDeploymentConfig = {
  image: 'gcr.io/demo-payments/payments-api:v2.14.0',
  revision: 13,
  requiredEnvConfigured: true,
  envSecretRef: 'payments-signing-config',
  readinessProbePath: '/healthz',
  livenessProbePath: '/livez',
  expectedHealthPath: '/healthz',
  cpuRequest: '200m',
  cpuLimit: '500m',
  memoryRequest: '256Mi',
  memoryLimit: '512Mi',
};

export const SCENARIO_CATALOG: ScenarioDescriptor[] = [
  {
    id: 'crashloop_backoff',
    code: 'SCENARIO A',
    title: 'Payments API Crash Loop',
    severity: 'critical',
    shortDescription:
      'A broken deployment rollout removes the required signing config secret reference, causing all payments-api containers to crash on startup.',
    whatWillBeSimulated: [
      'Rollout rev 14 removes envFrom secretRef "payments-signing-config" in deployment/payments-api.',
      'All 3 pods fail initialization with ExitCode=1 and enter CrashLoopBackOff.',
      'Ready replicas drop from 3/3 to 0/3; restart counts increase across all pods.',
      'payments-service loses all ready endpoints and degrades to critical (HTTP 503).',
    ],
    expectedSignals: [
      'CrashLoopBackOff on 3/3 pods',
      'FATAL: Missing required env PAYMENTS_SIGNING_CONFIG',
      'Readiness probe failed: connection refused',
    ],
    remediationActionId: 'restore_required_env_config',
  },
  {
    id: 'probe_misconfiguration',
    code: 'SCENARIO B',
    title: 'Failed Readiness Probe',
    severity: 'high',
    shortDescription:
      'Deployment readiness probe points to a nonexistent endpoint (/internal/healthz-v2), leaving running pods excluded from service traffic.',
    whatWillBeSimulated: [
      'Rollout rev 14 updates readinessProbe.httpGet.path to /internal/healthz-v2 while app serves /healthz.',
      'Containers stay Running (0 restarts), but Kubernetes marks 0/3 pods Ready.',
      'EndpointSlice drains all backends from payments-service.',
      'Application logs show repeated HTTP 404 responses on /internal/healthz-v2.',
    ],
    expectedSignals: [
      'Pods Running but 0/3 Ready (NotReady)',
      'HTTP readiness probe returned 404 on /internal/healthz-v2',
      '0/3 active endpoints on payments-service',
    ],
    remediationActionId: 'fix_readiness_probe_path',
  },
  {
    id: 'resource_pressure',
    code: 'SCENARIO C',
    title: 'CPU/Memory Resource Pressure',
    severity: 'critical',
    shortDescription:
      'Tightened CPU/memory limits (150m / 128Mi) trigger OOMKilled terminations on 2 pods and severe latency spikes on the sole surviving replica.',
    whatWillBeSimulated: [
      'Rollout rev 14 lowers limits to cpu=150m, memory=128Mi during peak payment settlement load.',
      '2 of 3 pods terminate with OOMKilled (ExitCode=137) and elevated restart counts.',
      'Surviving pod runs at 96% CPU throttling with p99 latency surging to 1,840 ms.',
      'payments-service degrades to 1/3 capacity with 28% HTTP 502/504 error rate.',
    ],
    expectedSignals: [
      '2/3 pods OOMKilled (ExitCode=137)',
      'Memory utilization at 98% of 128Mi limit',
      'p99 latency 1840ms with CPU throttling warnings',
    ],
    remediationActionId: 'adjust_resource_limits_and_hpa',
  },
];

export interface ScenarioFaultProfile {
  descriptor: ScenarioDescriptor;
  incidentSummary: string;
  configPatch: Partial<SimulationDeploymentConfig>;
  readinessProbePassing: boolean;
  livenessProbePassing: boolean;
  deploymentStatus: 'degraded' | 'critical';
  servicePatch: Partial<SimulationService>;
  metrics: SimulationMetrics;
  pods: (nowIso: string) => SimulationPod[];
  logs: (timeLabel: string) => Omit<SimulationLog, 'id'>[];
  events: Array<{
    type: 'warning' | 'error';
    source: string;
    title: string;
    detail: string;
  }>;
  remediationProposal: RemediationActionProposal;
}

export const REMEDIATION_PROPOSALS: Record<RemediationActionType, RemediationActionProposal> = {
  restore_required_env_config: {
    actionId: 'restore_required_env_config',
    title: 'Restore Required Secret Environment Reference & Rolling Restart',
    explanation:
      'The payments-api containers crash immediately on boot because the deployment manifest omitted envFrom.secretRef ("payments-signing-config"). Restoring the secret reference and performing a simulated rolling pod recreation restores startup integrity.',
    affectedResources: [
      'deployment/payments-api (namespace: payments)',
      'pods/payments-api-* (3 simulated replicas)',
      'service/payments-service',
    ],
    riskLevel: 'low',
    expectedChanges: [
      'Re-attach envFrom.secretRef: payments-signing-config in simulated deployment/payments-api (rev 15).',
      'Transition simulated pods through Starting → Running → Ready.',
      'Re-register 3/3 ready endpoints on simulated payments-service.',
    ],
    potentialImpact:
      'Simulated rolling restart only; zero production impact. In a real cluster, rolling replacement temporarily recycles failing pods.',
    expectedResult:
      'All 3 payments-api pods pass readiness checks, restarts stabilize, and payments-service returns to 100% availability.',
    verificationRequirement:
      'Deterministic check confirms 3/3 ready pods, 0 CrashLoopBackOff pods, readiness probe passing, and service health restored.',
    beforeStateSummary:
      'Rev 14 · envSecretRef: missing · 0/3 pods Ready (CrashLoopBackOff) · Service Critical (0% availability)',
    expectedAfterStateSummary:
      'Rev 15 · envSecretRef: payments-signing-config · 3/3 pods Ready (Running) · Service Healthy (99.98% availability)',
    steps: [
      'Verify failing container logs confirm missing PAYMENTS_SIGNING_CONFIG variable.',
      'Patch simulated deployment/payments-api to restore secretRef "payments-signing-config".',
      'Recreate simulated pods in controlled phases (Starting → Running → Ready).',
      'Run deterministic readiness and service endpoint verification.',
    ],
  },
  fix_readiness_probe_path: {
    actionId: 'fix_readiness_probe_path',
    title: 'Restore Readiness Probe Path (/healthz) & Refresh Endpoints',
    explanation:
      'The payments-api application is running normally on port 8080, but the readiness probe queries /internal/healthz-v2 and receives HTTP 404. Restoring readinessProbe.httpGet.path to /healthz allows Kubernetes to mark pods Ready and restore service endpoints.',
    affectedResources: [
      'deployment/payments-api (readinessProbe.httpGet.path)',
      'service/payments-service (EndpointSlice)',
    ],
    riskLevel: 'low',
    expectedChanges: [
      'Update simulated readinessProbe.httpGet.path from /internal/healthz-v2 to /healthz (rev 15).',
      'Trigger simulated readiness re-evaluation across all 3 pods.',
      'Re-attach all 3 pod IPs to simulated payments-service endpoints.',
    ],
    potentialImpact:
      'Low-risk simulated probe configuration update. No container data loss or schema changes.',
    expectedResult:
      'HTTP readiness probes return 200 OK on /healthz, ready replicas return to 3/3, and service traffic resumes.',
    verificationRequirement:
      'Deterministic check confirms readiness probe passing, 3/3 ready replicas, 0 NotReady pods, and 3/3 service endpoints active.',
    beforeStateSummary:
      'Rev 14 · readinessProbe: /internal/healthz-v2 (404) · 0/3 pods Ready · Service Degraded (0/3 endpoints)',
    expectedAfterStateSummary:
      'Rev 15 · readinessProbe: /healthz (200 OK) · 3/3 pods Ready · Service Healthy (3/3 endpoints)',
    steps: [
      'Confirm app serves HTTP 200 on /healthz while probe targets /internal/healthz-v2.',
      'Update simulated readinessProbe.httpGet.path to /healthz in deployment/payments-api.',
      'Roll simulated pods through Starting → Running → Ready states.',
      'Verify 3/3 endpoints register cleanly on payments-service.',
    ],
  },
  adjust_resource_limits_and_hpa: {
    actionId: 'adjust_resource_limits_and_hpa',
    title: 'Restore Safe CPU/Memory Limits (500m / 512Mi) & Recycle OOM Pods',
    explanation:
      'Deployment limits were tightened to 150m CPU and 128Mi memory, below the ~210Mi working set of payments-api, triggering kernel OOMKills (ExitCode=137) and heavy CPU throttling. Restoring safe limits (500m CPU, 512Mi memory) stabilizes all 3 replicas.',
    affectedResources: [
      'deployment/payments-api (resources.limits & resources.requests)',
      'pods/payments-api-* (2 OOMKilled pods + 1 throttled pod)',
      'service/payments-service',
    ],
    riskLevel: 'medium',
    expectedChanges: [
      'Restore simulated limits to cpu=500m, memory=512Mi (requests 200m / 256Mi) in rev 15.',
      'Recycle OOMKilled and throttled simulated pods smoothly.',
      'Normalize CPU/memory utilization and p99 latency under 60ms.',
    ],
    potentialImpact:
      'Increases simulated cluster memory reservation from 384Mi to 1.5Gi across 3 replicas; safe within simulated node capacity.',
    expectedResult:
      'OOMKilled events stop, all 3 pods become Ready with healthy utilization (~34% CPU, ~42% Mem), and error rate returns near 0%.',
    verificationRequirement:
      'Deterministic check confirms 3/3 ready pods, 0 OOMKilled pods, memory pressure cleared, and service latency/health restored.',
    beforeStateSummary:
      'Rev 14 · limits: 150m CPU / 128Mi Mem · 1/3 Ready (2 OOMKilled) · p99 1840ms · Service Degraded',
    expectedAfterStateSummary:
      'Rev 15 · limits: 500m CPU / 512Mi Mem · 3/3 Ready (Running) · p99 42ms · Service Healthy',
    steps: [
      'Confirm ExitCode=137 (OOMKilled) and 98% memory usage against 128Mi cap.',
      'Patch simulated deployment/payments-api limits back to 500m CPU and 512Mi memory.',
      'Recreate simulated pods (Starting → Running → Ready) and rebalance load.',
      'Verify zero OOM events, 3/3 ready pods, and restored service SLOs.',
    ],
  },
};

export const SCENARIO_PROFILES: Record<SimulationScenarioId, ScenarioFaultProfile> = {
  crashloop_backoff: {
    descriptor: SCENARIO_CATALOG[0],
    incidentSummary:
      'payments-api pods entered CrashLoopBackOff immediately after rollout revision 14 removed the required signing configuration secret reference.',
    configPatch: {
      revision: 14,
      requiredEnvConfigured: false,
      envSecretRef: null,
    },
    readinessProbePassing: false,
    livenessProbePassing: false,
    deploymentStatus: 'critical',
    servicePatch: {
      health: 'critical',
      availableEndpoints: 0,
      availabilityPercent: 0,
      p99LatencyMs: 0,
      errorRatePercent: 100,
    },
    metrics: {
      cpuUtilizationPercent: 6,
      memoryUtilizationPercent: 12,
      p99LatencyMs: 0,
      requestsPerSecond: 0,
      errorRatePercent: 100,
    },
    pods: (nowIso) => [
      {
        name: 'payments-api-7f9b4c-x8k2p',
        namespace: 'payments',
        phase: 'CrashLoopBackOff',
        ready: false,
        restarts: 5,
        cpuPercent: 5,
        memoryPercent: 11,
        lastReason: 'Error (ExitCode=1): Missing PAYMENTS_SIGNING_CONFIG',
        startedAt: nowIso,
      },
      {
        name: 'payments-api-7f9b4c-m4v9q',
        namespace: 'payments',
        phase: 'CrashLoopBackOff',
        ready: false,
        restarts: 4,
        cpuPercent: 7,
        memoryPercent: 13,
        lastReason: 'Back-off restarting failed container payments-api',
        startedAt: nowIso,
      },
      {
        name: 'payments-api-7f9b4c-p2n7w',
        namespace: 'payments',
        phase: 'CrashLoopBackOff',
        ready: false,
        restarts: 4,
        cpuPercent: 6,
        memoryPercent: 12,
        lastReason: 'Error (ExitCode=1): Missing PAYMENTS_SIGNING_CONFIG',
        startedAt: nowIso,
      },
    ],
    logs: (t) => [
      {
        timestamp: t,
        level: 'INFO',
        pod: 'payments-api-7f9b4c-x8k2p',
        message: 'Booting payments-api v2.14.0 (revision 14) in namespace payments...',
      },
      {
        timestamp: t,
        level: 'ERROR',
        pod: 'payments-api-7f9b4c-x8k2p',
        message:
          'FATAL: Configuration validation failed — required environment variable PAYMENTS_SIGNING_CONFIG is undefined (secretRef missing).',
      },
      {
        timestamp: t,
        level: 'ERROR',
        pod: 'payments-api-7f9b4c-x8k2p',
        message: 'Process terminated during startup initialization with non-zero status (ExitCode=1).',
      },
      {
        timestamp: t,
        level: 'WARN',
        pod: 'payments-api-7f9b4c-m4v9q',
        message: 'kubelet: Back-off 40s restarting failed container payments-api in pod payments-api-7f9b4c-m4v9q',
      },
      {
        timestamp: t,
        level: 'ERROR',
        pod: 'payments-api-7f9b4c-p2n7w',
        message: 'Readiness probe failed: Get "http://10.42.0.18:8080/healthz": dial tcp 10.42.0.18:8080: connect: connection refused',
      },
    ],
    events: [
      {
        type: 'warning',
        source: 'deployment-controller',
        title: 'Rollout revision 14 applied to deployment/payments-api',
        detail: 'Simulated manifest revision 14 deployed without envFrom secretRef "payments-signing-config".',
      },
      {
        type: 'error',
        source: 'kubelet',
        title: 'Pods entered CrashLoopBackOff (3/3 replicas failing)',
        detail: 'Containers exited with ExitCode=1 (missing PAYMENTS_SIGNING_CONFIG); restart backoff active.',
      },
      {
        type: 'error',
        source: 'endpoint-controller',
        title: 'Service health critical — 0/3 ready endpoints on payments-service',
        detail: 'All endpoints removed from payments-service; simulated API requests returning HTTP 503.',
      },
    ],
    remediationProposal: REMEDIATION_PROPOSALS.restore_required_env_config,
  },

  probe_misconfiguration: {
    descriptor: SCENARIO_CATALOG[1],
    incidentSummary:
      'payments-api containers are running without restarts, but a misconfigured readiness probe path (/internal/healthz-v2) returns 404 and prevents all 3 pods from receiving traffic.',
    configPatch: {
      revision: 14,
      readinessProbePath: '/internal/healthz-v2',
    },
    readinessProbePassing: false,
    livenessProbePassing: true,
    deploymentStatus: 'degraded',
    servicePatch: {
      health: 'degraded',
      availableEndpoints: 0,
      availabilityPercent: 0,
      p99LatencyMs: 0,
      errorRatePercent: 100,
    },
    metrics: {
      cpuUtilizationPercent: 14,
      memoryUtilizationPercent: 36,
      p99LatencyMs: 0,
      requestsPerSecond: 0,
      errorRatePercent: 100,
    },
    pods: (nowIso) => [
      {
        name: 'payments-api-7f9b4c-x8k2p',
        namespace: 'payments',
        phase: 'NotReady',
        ready: false,
        restarts: 0,
        cpuPercent: 15,
        memoryPercent: 37,
        lastReason: 'Readiness probe failed: HTTP 404 on /internal/healthz-v2',
        startedAt: nowIso,
      },
      {
        name: 'payments-api-7f9b4c-m4v9q',
        namespace: 'payments',
        phase: 'NotReady',
        ready: false,
        restarts: 0,
        cpuPercent: 14,
        memoryPercent: 35,
        lastReason: 'Readiness probe failed: HTTP 404 on /internal/healthz-v2',
        startedAt: nowIso,
      },
      {
        name: 'payments-api-7f9b4c-p2n7w',
        namespace: 'payments',
        phase: 'NotReady',
        ready: false,
        restarts: 0,
        cpuPercent: 13,
        memoryPercent: 36,
        lastReason: 'Readiness probe failed: HTTP 404 on /internal/healthz-v2',
        startedAt: nowIso,
      },
    ],
    logs: (t) => [
      {
        timestamp: t,
        level: 'INFO',
        pod: 'payments-api-7f9b4c-x8k2p',
        message: 'HTTP server listening on :8080 (registered health endpoint: GET /healthz).',
      },
      {
        timestamp: t,
        level: 'WARN',
        pod: 'payments-api-7f9b4c-x8k2p',
        message: 'HTTP 404 Not Found: GET /internal/healthz-v2 user-agent=kube-probe/1.30',
      },
      {
        timestamp: t,
        level: 'ERROR',
        pod: 'payments-api-7f9b4c-m4v9q',
        message: 'kubelet: Readiness probe failed: HTTP probe failed with statuscode: 404 on /internal/healthz-v2',
      },
      {
        timestamp: t,
        level: 'WARN',
        pod: 'payments-api-7f9b4c-p2n7w',
        message: 'Pod marked Ready=False after 3 consecutive readiness probe failures; liveness probe /livez still passing.',
      },
    ],
    events: [
      {
        type: 'warning',
        source: 'deployment-controller',
        title: 'Rollout revision 14 modified readinessProbe.httpGet.path',
        detail: 'Readiness probe updated from /healthz to /internal/healthz-v2 in deployment/payments-api.',
      },
      {
        type: 'error',
        source: 'kubelet',
        title: 'Readiness probe failing with HTTP 404 across 3/3 pods',
        detail: 'Containers remain Running (0 restarts), but pods transitioned to NotReady.',
      },
      {
        type: 'error',
        source: 'endpoint-controller',
        title: 'Service health degraded — payments-service has 0 active endpoints',
        detail: 'Traffic cannot be routed until pods pass readiness checks.',
      },
    ],
    remediationProposal: REMEDIATION_PROPOSALS.fix_readiness_probe_path,
  },

  resource_pressure: {
    descriptor: SCENARIO_CATALOG[2],
    incidentSummary:
      'Tightened resource limits (150m CPU / 128Mi memory) caused OOMKilled (ExitCode=137) terminations on 2 pods and severe CPU throttling & latency on the remaining replica.',
    configPatch: {
      revision: 14,
      cpuRequest: '100m',
      cpuLimit: '150m',
      memoryRequest: '96Mi',
      memoryLimit: '128Mi',
    },
    readinessProbePassing: false,
    livenessProbePassing: false,
    deploymentStatus: 'critical',
    servicePatch: {
      health: 'degraded',
      availableEndpoints: 1,
      availabilityPercent: 71.4,
      p99LatencyMs: 1840,
      errorRatePercent: 28.6,
    },
    metrics: {
      cpuUtilizationPercent: 96,
      memoryUtilizationPercent: 98,
      p99LatencyMs: 1840,
      requestsPerSecond: 142,
      errorRatePercent: 28.6,
    },
    pods: (nowIso) => [
      {
        name: 'payments-api-7f9b4c-x8k2p',
        namespace: 'payments',
        phase: 'OOMKilled',
        ready: false,
        restarts: 3,
        cpuPercent: 94,
        memoryPercent: 100,
        lastReason: 'OOMKilled (ExitCode=137): memory limit 128Mi exceeded',
        startedAt: nowIso,
      },
      {
        name: 'payments-api-7f9b4c-m4v9q',
        namespace: 'payments',
        phase: 'OOMKilled',
        ready: false,
        restarts: 2,
        cpuPercent: 91,
        memoryPercent: 99,
        lastReason: 'OOMKilled (ExitCode=137): memory limit 128Mi exceeded',
        startedAt: nowIso,
      },
      {
        name: 'payments-api-7f9b4c-p2n7w',
        namespace: 'payments',
        phase: 'Running',
        ready: true,
        restarts: 0,
        cpuPercent: 98,
        memoryPercent: 94,
        lastReason: 'Running under severe CPU throttling (150m cap)',
        startedAt: nowIso,
      },
    ],
    logs: (t) => [
      {
        timestamp: t,
        level: 'WARN',
        pod: 'payments-api-7f9b4c-x8k2p',
        message: 'Heap usage reached 124Mi / 128Mi container limit during settlement batch processing.',
      },
      {
        timestamp: t,
        level: 'ERROR',
        pod: 'payments-api-7f9b4c-x8k2p',
        message: 'kernel: Memory cgroup out of memory: Killed process payments-api (OOMKilled, ExitCode=137).',
      },
      {
        timestamp: t,
        level: 'ERROR',
        pod: 'payments-api-7f9b4c-m4v9q',
        message: 'Container payments-api terminated: Reason=OOMKilled ExitCode=137 (limit 128Mi).',
      },
      {
        timestamp: t,
        level: 'WARN',
        pod: 'payments-api-7f9b4c-p2n7w',
        message: 'Request latency p99=1840ms; CFS CPU quota throttling at 98% of 150m limit (upstream 504 timeouts rising).',
      },
    ],
    events: [
      {
        type: 'warning',
        source: 'deployment-controller',
        title: 'Rollout revision 14 reduced CPU/Memory limits to 150m / 128Mi',
        detail: 'Simulated resource limits set below payments-api runtime memory baseline (~210Mi).',
      },
      {
        type: 'error',
        source: 'kubelet',
        title: 'OOMKilled (ExitCode=137) on 2 of 3 payments-api pods',
        detail: 'Ready replicas dropped to 1/3; surviving pod experiencing 98% CPU throttling.',
      },
      {
        type: 'warning',
        source: 'metrics-server',
        title: 'Service latency and error rate degraded on payments-service',
        detail: 'p99 latency spiked to 1,840ms with 28.6% 5xx error rate across remaining replica.',
      },
    ],
    remediationProposal: REMEDIATION_PROPOSALS.adjust_resource_limits_and_hpa,
  },
};

export function getScenarioProfile(id: SimulationScenarioId): ScenarioFaultProfile {
  return SCENARIO_PROFILES[id];
}
