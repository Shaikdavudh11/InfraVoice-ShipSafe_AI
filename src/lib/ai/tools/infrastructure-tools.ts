import { z } from 'zod';
import { scanUploadedFiles } from '../../shipsafe/scan-engine.ts';
import type { ShipSafeScanResult } from '../../shipsafe/types.ts';
import { sanitizeUntrustedText } from '../context-sanitizer.ts';

export interface IncidentContextPayload {
  id: string;
  title: string;
  severity: string;
  status: string;
  affectedService: string;
  namespace?: string;
  timestamp?: string;
  summary: string;
  timeline?: Array<{ timestamp: string; source: string; title: string; detail: string }>;
  logs?: Array<{ timestamp: string; level: string; pod?: string; message: string }>;
  rawEvidenceText?: string;
}

export interface ToolExecutionContext {
  scanResult?: ShipSafeScanResult | null;
  incident?: IncidentContextPayload | null;
  artifactText?: string | null;
  workspaceName?: string;
}

export interface ToolCallTrace {
  tool: string;
  label: string;
  status: 'completed' | 'rejected';
  summary: string;
}

export const AnalyzeLogsArgsSchema = z.object({
  logContent: z.string().min(1).max(16000),
});

export function runAnalyzeLogs(args: z.infer<typeof AnalyzeLogsArgsSchema>) {
  const safeLogs = sanitizeUntrustedText(args.logContent, 8000);
  const lines = safeLogs.split('\n').filter((l) => l.trim().length > 0);
  const errors = lines.filter((l) => /\b(error|fatal|exception|panic|oomkilled|exitcode=137|crashloop)\b/i.test(l));
  const warnings = lines.filter((l) => /\b(warn|warning|retry|backoff|throttle|pressure)\b/i.test(l));
  const timestamps = lines
    .map((l) => l.match(/\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/)?.[0])
    .filter((t): t is string => Boolean(t));

  const patterns: string[] = [];
  if (/oomkilled|exitcode=137|out of memory|heap limit/i.test(safeLogs)) {
    patterns.push('Memory exhaustion / OOMKilled (Exit Code 137)');
  }
  if (/crashloopbackoff/i.test(safeLogs)) {
    patterns.push('Kubernetes CrashLoopBackOff');
  }
  if (/econnrefused|connection refused|timeout|timed out/i.test(safeLogs)) {
    patterns.push('Upstream network connection refusal or timeout');
  }
  if (/permission denied|unauthorized|403|401/i.test(safeLogs)) {
    patterns.push('Authentication or authorization failure');
  }

  return {
    totalLines: lines.length,
    errorLineCount: errors.length,
    warningLineCount: warnings.length,
    detectedPatterns: patterns,
    timeRange:
      timestamps.length > 0
        ? { first: timestamps[0], last: timestamps[timestamps.length - 1] }
        : null,
    sampleErrors: errors.slice(0, 6),
  };
}

export const ExplainK8sArgsSchema = z.object({
  yamlContent: z.string().min(1).max(20000),
  fileName: z.string().min(1).max(120).default('manifest.yaml'),
});

export function runExplainKubernetesResource(args: z.infer<typeof ExplainK8sArgsSchema>) {
  const outcome = scanUploadedFiles([
    {
      fileName: args.fileName.endsWith('.yaml') || args.fileName.endsWith('.yml')
        ? args.fileName
        : 'manifest.yaml',
      content: args.yamlContent,
      sizeBytes: Buffer.byteLength(args.yamlContent, 'utf8'),
    },
  ]);

  if (!outcome.ok) {
    return { valid: false, error: outcome.error };
  }

  return {
    valid: true,
    riskScore: outcome.result.riskScore,
    riskLabel: outcome.result.riskLabel,
    fileSummaries: outcome.result.fileSummaries,
    findings: outcome.result.findings.slice(0, 15).map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      lineNumber: f.lineNumber,
      recommendation: f.recommendation,
    })),
  };
}

export const InspectScanFindingsArgsSchema = z.object({
  severity: z.enum(['all', 'critical', 'high', 'medium', 'low', 'info']).default('all'),
  ruleId: z.string().max(32).optional(),
});

export function runInspectScanFindings(
  args: z.infer<typeof InspectScanFindingsArgsSchema>,
  ctx: ToolExecutionContext
) {
  if (!ctx.scanResult) {
    return {
      available: false,
      message: 'No active ShipSafe scan result was provided in this conversation context.',
    };
  }

  const filtered = ctx.scanResult.findings.filter((f) => {
    const sevOk = args.severity === 'all' || f.severity === args.severity;
    const ruleOk = !args.ruleId || f.ruleId.toLowerCase() === args.ruleId.toLowerCase();
    return sevOk && ruleOk;
  });

  return {
    available: true,
    scanId: ctx.scanResult.scanId,
    riskScore: ctx.scanResult.riskScore,
    riskLabel: ctx.scanResult.riskLabel,
    severityCounts: ctx.scanResult.severityCounts,
    matchedCount: filtered.length,
    findings: filtered.slice(0, 20).map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      fileName: f.fileName,
      lineNumber: f.lineNumber,
      evidence: sanitizeUntrustedText(f.evidence, 220),
      recommendation: f.recommendation,
    })),
  };
}

export const SummarizeIncidentArgsSchema = z.object({
  includeLogs: z.boolean().default(true),
});

export function runSummarizeIncidentEvidence(
  args: z.infer<typeof SummarizeIncidentArgsSchema>,
  ctx: ToolExecutionContext
) {
  if (!ctx.incident) {
    return {
      available: false,
      message: 'No active incident was attached to this conversation context.',
    };
  }

  return {
    available: true,
    id: ctx.incident.id,
    title: sanitizeUntrustedText(ctx.incident.title, 200),
    severity: ctx.incident.severity,
    status: ctx.incident.status,
    affectedService: ctx.incident.affectedService,
    namespace: ctx.incident.namespace || 'unknown',
    summary: sanitizeUntrustedText(ctx.incident.summary, 600),
    timelineCount: ctx.incident.timeline?.length ?? 0,
    timeline: (ctx.incident.timeline || []).slice(0, 10).map((ev) => ({
      timestamp: ev.timestamp,
      source: ev.source,
      title: sanitizeUntrustedText(ev.title, 160),
      detail: sanitizeUntrustedText(ev.detail, 240),
    })),
    logs: args.includeLogs
      ? (ctx.incident.logs || []).slice(0, 15).map((l) => ({
          timestamp: l.timestamp,
          level: l.level,
          message: sanitizeUntrustedText(l.message, 240),
        }))
      : [],
  };
}

export const AnalyzeDockerfileArgsSchema = z.object({
  dockerfileContent: z.string().min(1).max(20000),
});

export function runAnalyzeDockerfile(args: z.infer<typeof AnalyzeDockerfileArgsSchema>) {
  const outcome = scanUploadedFiles([
    {
      fileName: 'Dockerfile',
      content: args.dockerfileContent,
      sizeBytes: Buffer.byteLength(args.dockerfileContent, 'utf8'),
    },
  ]);

  if (!outcome.ok) {
    return { valid: false, error: outcome.error };
  }

  return {
    valid: true,
    riskScore: outcome.result.riskScore,
    riskLabel: outcome.result.riskLabel,
    findings: outcome.result.findings.map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      lineNumber: f.lineNumber,
      recommendation: f.recommendation,
    })),
  };
}

export const AnalyzeTerraformArgsSchema = z.object({
  terraformContent: z.string().min(1).max(20000),
  fileName: z.string().min(1).max(120).default('main.tf'),
});

export function runAnalyzeTerraform(args: z.infer<typeof AnalyzeTerraformArgsSchema>) {
  const safeName = args.fileName.endsWith('.tf') ? args.fileName : 'main.tf';
  const outcome = scanUploadedFiles([
    {
      fileName: safeName,
      content: args.terraformContent,
      sizeBytes: Buffer.byteLength(args.terraformContent, 'utf8'),
    },
  ]);

  if (!outcome.ok) {
    return { valid: false, error: outcome.error };
  }

  return {
    valid: true,
    riskScore: outcome.result.riskScore,
    riskLabel: outcome.result.riskLabel,
    findings: outcome.result.findings.map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      lineNumber: f.lineNumber,
      recommendation: f.recommendation,
    })),
  };
}

export const DeploymentContextArgsSchema = z.object({
  serviceName: z.string().max(120).optional(),
});

export function runGetDeploymentContext(
  _args: z.infer<typeof DeploymentContextArgsSchema>,
  ctx: ToolExecutionContext
) {
  return {
    connected: false,
    workspaceName: ctx.workspaceName || 'none',
    message:
      'No live CI/CD or cluster API connector is configured in this environment. Rely only on uploaded files, ShipSafe scan results, or supplied incident evidence.',
  };
}

export const PodStatusArgsSchema = z.object({
  namespace: z.string().max(120).optional(),
  podName: z.string().max(120).optional(),
});

export function runGetPodStatus(
  _args: z.infer<typeof PodStatusArgsSchema>,
  _ctx: ToolExecutionContext
) {
  return {
    connected: false,
    message:
      'No live read-only Kubernetes cluster integration is connected. Ask the engineer to paste `kubectl get pods` / `kubectl describe pod` output or review attached incident evidence.',
  };
}
