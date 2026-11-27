export type SimulationScenarioId =
  | 'crashloop_backoff'
  | 'probe_misconfiguration'
  | 'resource_pressure';

export type SimulationHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'critical'
  | 'recovering'
  | 'resolved';

export type SimulationPodPhase =
  | 'Running'
  | 'Starting'
  | 'CrashLoopBackOff'
  | 'NotReady'
  | 'OOMKilled';

export type RemediationActionType =
  | 'restore_required_env_config'
  | 'fix_readiness_probe_path'
  | 'adjust_resource_limits_and_hpa';

export interface SimulationCluster {
  name: string;
  environment: 'hackathon-simulation';
  region: string;
  simulated: true;
  status: SimulationHealthStatus;
}

export interface SimulationDeploymentConfig {
  image: string;
  revision: number;
  requiredEnvConfigured: boolean;
  envSecretRef: string | null;
  readinessProbePath: string;
  livenessProbePath: string;
  expectedHealthPath: string;
  cpuRequest: string;
  cpuLimit: string;
  memoryRequest: string;
  memoryLimit: string;
}

export interface SimulationDeployment {
  name: string;
  namespace: string;
  desiredReplicas: number;
  readyReplicas: number;
  unhealthyReplicas: number;
  status: SimulationHealthStatus;
  readinessProbePassing: boolean;
  livenessProbePassing: boolean;
  config: SimulationDeploymentConfig;
}

export interface SimulationPod {
  name: string;
  namespace: string;
  phase: SimulationPodPhase;
  ready: boolean;
  restarts: number;
  cpuPercent: number;
  memoryPercent: number;
  lastReason: string;
  startedAt: string;
}

export interface SimulationService {
  name: string;
  namespace: string;
  endpoint: string;
  health: SimulationHealthStatus;
  availableEndpoints: number;
  expectedEndpoints: number;
  availabilityPercent: number;
  p99LatencyMs: number;
  errorRatePercent: number;
}

export interface SimulationMetrics {
  cpuUtilizationPercent: number;
  memoryUtilizationPercent: number;
  p99LatencyMs: number;
  requestsPerSecond: number;
  errorRatePercent: number;
}

export interface SimulationEvent {
  id: string;
  timestamp: string;
  displayTime: string;
  type: 'info' | 'warning' | 'error' | 'action' | 'recovery' | 'verification';
  source: string;
  title: string;
  detail: string;
}

export interface SimulationLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  pod: string;
  message: string;
}

export interface RemediationActionProposal {
  actionId: RemediationActionType;
  title: string;
  explanation: string;
  affectedResources: string[];
  riskLevel: 'low' | 'medium';
  expectedChanges: string[];
  potentialImpact: string;
  expectedResult: string;
  verificationRequirement: string;
  beforeStateSummary: string;
  expectedAfterStateSummary: string;
  steps: string[];
}

export interface SimulationInvestigationReport {
  incidentSummary: string;
  mostLikelyRootCause: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  supportingEvidence: string[];
  affectedResources: string[];
  severityImpact: string;
  immediateRemediationSummary: string;
  proposedSteps: string[];
  verificationSteps: string[];
  preventionSuggestions: string[];
  recommendedActionId: RemediationActionType;
  model: string;
  investigatedAt: string;
}

export interface VerificationCheckResult {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface RecoveryVerificationReport {
  passed: boolean;
  verifiedAt: string;
  summary: string;
  checks: VerificationCheckResult[];
}

export interface SimulationActionRecord {
  id: string;
  incidentId: string;
  actionId: RemediationActionType;
  title: string;
  status: 'approved_applying' | 'completed' | 'verification_failed';
  approvedAt: string;
  completedAt: string | null;
  approvedBy: string;
  summary: string;
}

export interface SimulationIncident {
  id: string;
  scenarioId: SimulationScenarioId;
  title: string;
  severity: 'critical' | 'high' | 'medium';
  status: 'open' | 'investigating' | 'recovering' | 'resolved';
  triggeredAt: string;
  resolvedAt: string | null;
  summary: string;
  affectedResource: string;
  investigation: SimulationInvestigationReport | null;
  proposedRemediation: RemediationActionProposal | null;
  verification: RecoveryVerificationReport | null;
}

export interface ScenarioDescriptor {
  id: SimulationScenarioId;
  code: string;
  title: string;
  severity: 'critical' | 'high' | 'medium';
  shortDescription: string;
  whatWillBeSimulated: string[];
  expectedSignals: string[];
  remediationActionId: RemediationActionType;
}

export interface SimulationStateSnapshot {
  simulated: true;
  environmentBanner: 'SIMULATED ENVIRONMENT — Isolated hackathon simulation. No real cloud or Kubernetes cluster is connected.';
  recoveryStage: 'idle' | 'applying_config' | 'restarting_pods' | 'verifying' | 'completed' | 'failed';
  cluster: SimulationCluster;
  deployment: SimulationDeployment;
  pods: SimulationPod[];
  service: SimulationService;
  metrics: SimulationMetrics;
  activeIncident: SimulationIncident | null;
  events: SimulationEvent[];
  logs: SimulationLog[];
  actionHistory: SimulationActionRecord[];
  lastUpdatedAt: string;
  scenarios: ScenarioDescriptor[];
}
