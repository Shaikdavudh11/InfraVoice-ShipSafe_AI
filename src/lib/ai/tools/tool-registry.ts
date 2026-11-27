import { Type } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';
import {
  AnalyzeDockerfileArgsSchema,
  AnalyzeLogsArgsSchema,
  AnalyzeTerraformArgsSchema,
  DeploymentContextArgsSchema,
  ExplainK8sArgsSchema,
  InspectScanFindingsArgsSchema,
  PodStatusArgsSchema,
  runAnalyzeDockerfile,
  runAnalyzeLogs,
  runAnalyzeTerraform,
  runExplainKubernetesResource,
  runGetDeploymentContext,
  runGetPodStatus,
  runInspectScanFindings,
  runSummarizeIncidentEvidence,
  SummarizeIncidentArgsSchema,
  type ToolCallTrace,
  type ToolExecutionContext,
} from './infrastructure-tools.ts';

interface RegisteredTool {
  label: string;
  declaration: FunctionDeclaration;
  execute: (args: unknown, ctx: ToolExecutionContext) => { summary: string; data: unknown };
}

const TOOL_REGISTRY: Record<string, RegisteredTool> = {
  analyze_logs: {
    label: 'Inspecting provided logs',
    declaration: {
      name: 'analyze_logs',
      description: 'Analyze supplied log text to extract error counts, patterns, timestamps, and probable failure signals.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          logContent: { type: Type.STRING, description: 'Raw log text provided by the user or incident context.' },
        },
        required: ['logContent'],
      },
    },
    execute: (args) => {
      const parsed = AnalyzeLogsArgsSchema.parse(args);
      const data = runAnalyzeLogs(parsed);
      return {
        summary: `Scanned ${data.totalLines} log lines (${data.errorLineCount} errors, ${data.warningLineCount} warnings)`,
        data,
      };
    },
  },
  explain_kubernetes_resource: {
    label: 'Analyzing Kubernetes manifest',
    declaration: {
      name: 'explain_kubernetes_resource',
      description: 'Validate and scan a supplied Kubernetes YAML resource using ShipSafe deterministic rules.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          yamlContent: { type: Type.STRING, description: 'Kubernetes YAML content.' },
          fileName: { type: Type.STRING, description: 'Optional manifest filename.' },
        },
        required: ['yamlContent'],
      },
    },
    execute: (args) => {
      const parsed = ExplainK8sArgsSchema.parse(args);
      const data = runExplainKubernetesResource(parsed);
      return {
        summary: data.valid
          ? `Found ${data.findings?.length ?? 0} Kubernetes findings (score ${data.riskScore}/100)`
          : `Manifest check error: ${data.error}`,
        data,
      };
    },
  },
  inspect_scan_findings: {
    label: 'Analyzing scan findings',
    declaration: {
      name: 'inspect_scan_findings',
      description: 'Retrieve normalized deterministic findings from the currently active ShipSafe scan context.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          severity: {
            type: Type.STRING,
            enum: ['all', 'critical', 'high', 'medium', 'low', 'info'],
            description: 'Optional severity filter.',
          },
          ruleId: { type: Type.STRING, description: 'Optional rule ID such as DS001 or KS001.' },
        },
      },
    },
    execute: (args, ctx) => {
      const parsed = InspectScanFindingsArgsSchema.parse(args ?? {});
      const data = runInspectScanFindings(parsed, ctx);
      return {
        summary: data.available
          ? `Retrieved ${data.matchedCount} findings from scan ${data.scanId}`
          : 'No active ShipSafe scan attached',
        data,
      };
    },
  },
  summarize_incident_evidence: {
    label: 'Reviewing deployment & incident evidence',
    declaration: {
      name: 'summarize_incident_evidence',
      description: 'Summarize timeline events, service metadata, and logs attached to the active incident context.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          includeLogs: { type: Type.BOOLEAN, description: 'Whether to include incident log lines.' },
        },
      },
    },
    execute: (args, ctx) => {
      const parsed = SummarizeIncidentArgsSchema.parse(args ?? {});
      const data = runSummarizeIncidentEvidence(parsed, ctx);
      return {
        summary: data.available
          ? `Reviewed incident ${data.id} (${data.timelineCount} timeline events)`
          : 'No active incident attached',
        data,
      };
    },
  },
  analyze_dockerfile: {
    label: 'Scanning Dockerfile configuration',
    declaration: {
      name: 'analyze_dockerfile',
      description: 'Run deterministic ShipSafe Dockerfile rules against a provided Dockerfile.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          dockerfileContent: { type: Type.STRING, description: 'Dockerfile text.' },
        },
        required: ['dockerfileContent'],
      },
    },
    execute: (args) => {
      const parsed = AnalyzeDockerfileArgsSchema.parse(args);
      const data = runAnalyzeDockerfile(parsed);
      return {
        summary: data.valid
          ? `Evaluated Dockerfile (${data.findings?.length ?? 0} findings)`
          : `Dockerfile parse note: ${data.error}`,
        data,
      };
    },
  },
  analyze_terraform: {
    label: 'Scanning Terraform configuration',
    declaration: {
      name: 'analyze_terraform',
      description: 'Run deterministic ShipSafe Terraform rules against provided .tf content.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          terraformContent: { type: Type.STRING, description: 'Terraform HCL content.' },
          fileName: { type: Type.STRING, description: 'Optional .tf filename.' },
        },
        required: ['terraformContent'],
      },
    },
    execute: (args) => {
      const parsed = AnalyzeTerraformArgsSchema.parse(args);
      const data = runAnalyzeTerraform(parsed);
      return {
        summary: data.valid
          ? `Evaluated Terraform (${data.findings?.length ?? 0} findings)`
          : `Terraform parse note: ${data.error}`,
        data,
      };
    },
  },
  get_deployment_context: {
    label: 'Checking deployment integration',
    declaration: {
      name: 'get_deployment_context',
      description: 'Check whether a live deployment integration is connected and return available metadata.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          serviceName: { type: Type.STRING, description: 'Optional service name.' },
        },
      },
    },
    execute: (args, ctx) => {
      const parsed = DeploymentContextArgsSchema.parse(args ?? {});
      const data = runGetDeploymentContext(parsed, ctx);
      return {
        summary: 'Verified no live CD connector is attached (using supplied context only)',
        data,
      };
    },
  },
  get_pod_status: {
    label: 'Checking cluster pod connector',
    declaration: {
      name: 'get_pod_status',
      description: 'Check pod status only if a live read-only Kubernetes cluster integration exists.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          namespace: { type: Type.STRING, description: 'Kubernetes namespace.' },
          podName: { type: Type.STRING, description: 'Kubernetes pod name.' },
        },
      },
    },
    execute: (args, ctx) => {
      const parsed = PodStatusArgsSchema.parse(args ?? {});
      const data = runGetPodStatus(parsed, ctx);
      return {
        summary: 'Confirmed no live cluster connector is active',
        data,
      };
    },
  },
};

export const ALLOWED_TOOL_NAMES = Object.keys(TOOL_REGISTRY);

export function getToolDeclarations(): FunctionDeclaration[] {
  return ALLOWED_TOOL_NAMES.map((name) => TOOL_REGISTRY[name].declaration);
}

export function executeRegisteredTool(
  toolName: string,
  args: unknown,
  ctx: ToolExecutionContext
): { ok: boolean; trace: ToolCallTrace; responsePayload: Record<string, unknown> } {
  if (!Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, toolName)) {
    return {
      ok: false,
      trace: {
        tool: toolName,
        label: `Blocked unregistered tool (${toolName})`,
        status: 'rejected',
        summary: 'Tool is not on the server-side read-only allowlist.',
      },
      responsePayload: {
        error: `Tool "${toolName}" is not permitted.`,
      },
    };
  }

  const entry = TOOL_REGISTRY[toolName];
  try {
    const result = entry.execute(args, ctx);
    return {
      ok: true,
      trace: {
        tool: toolName,
        label: entry.label,
        status: 'completed',
        summary: result.summary,
      },
      responsePayload: { result: result.data },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid tool arguments';
    return {
      ok: false,
      trace: {
        tool: toolName,
        label: entry.label,
        status: 'rejected',
        summary: `Argument validation failed: ${msg.slice(0, 120)}`,
      },
      responsePayload: { error: `Invalid arguments for ${toolName}` },
    };
  }
}
