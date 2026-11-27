export type ShipSafeSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type ShipSafeFileType =
  | 'dockerfile'
  | 'dockerignore'
  | 'kubernetes'
  | 'docker-compose'
  | 'terraform'
  | 'github-actions';

export type ShipSafeCategory =
  | 'container'
  | 'kubernetes'
  | 'compose'
  | 'terraform'
  | 'cicd'
  | 'secrets';

export type FindingConfidence = 'high' | 'medium' | 'low';

export type RiskLabel = 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Critical';

export interface RawUploadFile {
  fileName: string;
  content: string;
  sizeBytes: number;
}

export interface ClassifiedFile {
  fileName: string;
  fileType: ShipSafeFileType;
  content: string;
  lines: string[];
  sizeBytes: number;
  parsedYamlDocs?: unknown[];
}

export interface ShipSafeFinding {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  severity: ShipSafeSeverity;
  category: ShipSafeCategory;
  fileName: string;
  lineNumber: number | null;
  evidence: string;
  impact: string;
  recommendation: string;
  fixExample?: string;
  confidence: FindingConfidence;
  source: 'deterministic-rule';
  references?: string[];
}

export interface FileScanSummary {
  fileName: string;
  fileType: ShipSafeFileType;
  sizeBytes: number;
  lineCount: number;
  findingCount: number;
  highestSeverity: ShipSafeSeverity | null;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ShipSafeScanResult {
  scanId: string;
  timestamp: string;
  fileSummaries: FileScanSummary[];
  totalFindings: number;
  severityCounts: SeverityCounts;
  riskScore: number;
  riskLabel: RiskLabel;
  riskFormula: string;
  scanDurationMs: number;
  findings: ShipSafeFinding[];
  overallSummary: string;
}

export interface FileRejectionError {
  fileName: string;
  reason: string;
}
