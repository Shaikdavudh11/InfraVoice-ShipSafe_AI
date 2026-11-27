export type AppRoute =
  | '/'
  | '/shipsafe'
  | '/infravoice'
  | '/incidents'
  | '/simulation'
  | '/history'
  | '/settings';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type RiskCategory =
  | 'container'
  | 'kubernetes'
  | 'iam'
  | 'cicd';

export type IncidentStatus = 'investigating' | 'mitigated' | 'resolved';

export type ScanStatus = 'passed' | 'needs_review' | 'blocked';

export interface Workspace {
  id: string;
  name: string;
  region: string;
  cluster: string;
  environment: 'production' | 'staging';
  riskScore: number;
  riskLabel: 'Low' | 'Moderate' | 'Elevated';
  openFindings: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  activeIncidents: number;
  investigatingIncidents: number;
  healthPercent: string;
  podsReady: string;
  lastScanSummary: {
    repository: string;
    commitSha: string;
    scannedAt: string;
    duration: string;
    verdict: ScanStatus;
  };
  riskTrend: number[];
}

export interface UploadedConfigFile {
  id: string;
  name: string;
  format: 'Dockerfile' | 'YAML' | 'Terraform' | 'GitHub Actions';
  sizeBytes: number;
  content: string;
}

export interface ScanFinding {
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  category: RiskCategory;
  fileName: string;
  lineRange: string;
  explanation: string;
  impact: string;
  snippet: string;
  remediation: string;
}

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  type: 'deployment' | 'scan' | 'incident';
  title: string;
  target: string;
  actor: string;
  timestamp: string;
  outcome: 'success' | 'warning' | 'critical' | 'neutral';
  route: AppRoute;
}

export interface IncidentEvent {
  id: string;
  timestamp: string;
  source: string;
  title: string;
  detail: string;
  level: 'info' | 'warn' | 'error' | 'resolved';
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  pod: string;
  message: string;
}

export interface RecoveryAction {
  id: string;
  title: string;
  rationale: string;
  riskLevel: 'safe' | 'verify';
  command: string;
}

export interface Incident {
  id: string;
  workspaceId: string;
  title: string;
  severity: Severity;
  affectedService: string;
  namespace: string;
  timestamp: string;
  duration: string;
  status: IncidentStatus;
  summary: string;
  rootCause: {
    summary: string;
    commitRef: string;
    confidence: string;
    evidencePoints: string[];
  };
  timeline: IncidentEvent[];
  logs: LogEntry[];
  recoveryActions: RecoveryAction[];
}

export interface EvidenceItem {
  id: string;
  type: 'k8s_event' | 'scan_finding' | 'metric' | 'log_excerpt';
  title: string;
  source: string;
  timestamp: string;
  detail: string;
  severity?: Severity;
}

export interface ChatMessageToolTrace {
  tool: string;
  label: string;
  status: 'completed' | 'rejected';
  summary: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  timestamp: string;
  content: string;
  model?: string;
  toolActivity?: ChatMessageToolTrace[];
  contextSummary?: string[];
  isError?: boolean;
  retryPrompt?: string;
  structured?: {
    summary: string;
    causes: string[];
    remediationSteps: {
      step: string;
      command?: string;
    }[];
    safetyNote: string;
  };
  evidenceIds?: string[];
}

export interface ScanHistoryRecord {
  id: string;
  workspaceId: string;
  repository: string;
  branch: string;
  commitSha: string;
  fileTypes: string[];
  scannedAt: string;
  duration: string;
  riskScore: number;
  findings: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  status: ScanStatus;
  triggeredBy: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  severity: Severity | 'info';
  route: AppRoute;
}
