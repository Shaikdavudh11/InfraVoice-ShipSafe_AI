import crypto from 'node:crypto';
import {
  classifyAndValidateFile,
  MAX_FILE_COUNT,
  MAX_TOTAL_SIZE_BYTES,
} from './file-detector.ts';
import {
  calculateRiskScore,
  computeSeverityCounts,
  RISK_FORMULA_DESCRIPTION,
} from './risk-score.ts';
import { scanCompose } from './rules/compose-rules.ts';
import { scanDockerignore, scanDockerfile } from './rules/dockerfile-rules.ts';
import { scanGitHubActions } from './rules/github-actions-rules.ts';
import { scanKubernetes } from './rules/kubernetes-rules.ts';
import { scanTerraform } from './rules/terraform-rules.ts';
import type {
  ClassifiedFile,
  FileRejectionError,
  FileScanSummary,
  RawUploadFile,
  ShipSafeFinding,
  ShipSafeScanResult,
  ShipSafeSeverity,
} from './types.ts';

const SEVERITY_RANK: Record<ShipSafeSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export type ScanExecutionOutcome =
  | { ok: true; result: ShipSafeScanResult }
  | { ok: false; statusCode: number; error: string; rejections?: FileRejectionError[] };

function runRulesForFile(file: ClassifiedFile): ShipSafeFinding[] {
  switch (file.fileType) {
    case 'dockerfile':
      return scanDockerfile(file);
    case 'dockerignore':
      return scanDockerignore(file);
    case 'kubernetes':
      return scanKubernetes(file);
    case 'docker-compose':
      return scanCompose(file);
    case 'terraform':
      return scanTerraform(file);
    case 'github-actions':
      return scanGitHubActions(file);
  }
}

function highestSeverity(findings: ShipSafeFinding[]): ShipSafeSeverity | null {
  if (findings.length === 0) return null;
  let top = findings[0].severity;
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[top]) {
      top = f.severity;
    }
  }
  return top;
}

export function scanUploadedFiles(rawFiles: RawUploadFile[]): ScanExecutionOutcome {
  const startedAt = performance.now();

  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      error: 'No files were uploaded. Please provide at least one supported configuration file.',
    };
  }

  if (rawFiles.length > MAX_FILE_COUNT) {
    return {
      ok: false,
      statusCode: 400,
      error: `Too many files uploaded (${rawFiles.length}). Maximum allowed per scan is ${MAX_FILE_COUNT} files.`,
    };
  }

  const totalBytes = rawFiles.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
  if (totalBytes > MAX_TOTAL_SIZE_BYTES) {
    return {
      ok: false,
      statusCode: 413,
      error: 'Total upload size exceeds the 5 MB limit per scan.',
    };
  }

  const classified: ClassifiedFile[] = [];
  const rejections: FileRejectionError[] = [];

  for (const raw of rawFiles) {
    const check = classifyAndValidateFile(raw);
    if (check.ok) {
      classified.push(check.file);
    } else {
      rejections.push({ fileName: check.fileName, reason: check.reason });
    }
  }

  if (rejections.length > 0) {
    return {
      ok: false,
      statusCode: 400,
      error: `${rejections[0].fileName}: ${rejections[0].reason}`,
      rejections,
    };
  }

  const allFindings: ShipSafeFinding[] = [];
  const fileSummaries: FileScanSummary[] = [];

  for (const file of classified) {
    const fileFindings = runRulesForFile(file);
    allFindings.push(...fileFindings);
    fileSummaries.push({
      fileName: file.fileName,
      fileType: file.fileType,
      sizeBytes: file.sizeBytes,
      lineCount: file.lines.length,
      findingCount: fileFindings.length,
      highestSeverity: highestSeverity(fileFindings),
    });
  }

  // Sort by severity (critical -> info), then filename, then line number
  allFindings.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sevDiff !== 0) return sevDiff;
    const fileDiff = a.fileName.localeCompare(b.fileName);
    if (fileDiff !== 0) return fileDiff;
    return (a.lineNumber ?? 0) - (b.lineNumber ?? 0);
  });

  // Assign globally unique deterministic IDs after sorting
  const normalizedFindings = allFindings.map((f, idx) => ({
    ...f,
    id: `${f.ruleId}-${idx + 1}`,
  }));

  const severityCounts = computeSeverityCounts(normalizedFindings);
  const { score, label } = calculateRiskScore(normalizedFindings, classified.length);
  const durationMs = Math.max(1, Math.round(performance.now() - startedAt));

  const overallSummary =
    normalizedFindings.length === 0
      ? `Scanned ${classified.length} configuration file${classified.length === 1 ? '' : 's'} with zero security or reliability findings.`
      : `Scanned ${classified.length} file${classified.length === 1 ? '' : 's'} and detected ${normalizedFindings.length} finding${normalizedFindings.length === 1 ? '' : 's'} (${severityCounts.critical} critical, ${severityCounts.high} high, ${severityCounts.medium} medium, ${severityCounts.low} low, ${severityCounts.info} info). ShipSafe Risk Score is ${score}/100 (${label}).`;

  return {
    ok: true,
    result: {
      scanId: `scan-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      fileSummaries,
      totalFindings: normalizedFindings.length,
      severityCounts,
      riskScore: score,
      riskLabel: label,
      riskFormula: RISK_FORMULA_DESCRIPTION,
      scanDurationMs: durationMs,
      findings: normalizedFindings,
      overallSummary,
    },
  };
}
