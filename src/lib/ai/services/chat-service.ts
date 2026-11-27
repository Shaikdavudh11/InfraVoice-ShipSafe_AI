import { ThinkingLevel } from '@google/genai';
import type { Content, Part } from '@google/genai';
import { z } from 'zod';
import { getAiConfig } from '../ai-config.ts';
import { AiServiceError, generateWithRetry } from '../gemini-client.ts';
import {
  sanitizeConversationWindow,
  sanitizeUntrustedText,
  wrapUntrustedContext,
} from '../context-sanitizer.ts';
import { INFRAVOICE_SYSTEM_PROMPT } from '../prompts/system-prompt.ts';
import type {
  IncidentContextPayload,
  ToolCallTrace,
  ToolExecutionContext,
} from '../tools/infrastructure-tools.ts';
import { executeRegisteredTool, getToolDeclarations } from '../tools/tool-registry.ts';
import type { ShipSafeScanResult } from '../../shipsafe/types.ts';

export const ChatContextTypeSchema = z.enum([
  'general',
  'shipsafe',
  'incident',
  'kubernetes',
  'docker',
  'terraform',
  'cicd',
]);

export type ChatContextType = z.infer<typeof ChatContextTypeSchema>;

export const SupportedLanguageSchema = z.enum(['en-IN', 'hi-IN', 'te-IN', 'ta-IN', 'kn-IN']);
export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  'en-IN': 'English',
  'hi-IN': 'Hindi (using natural English technical DevOps terms where appropriate)',
  'te-IN': 'Telugu (using natural English technical DevOps terms where appropriate)',
  'ta-IN': 'Tamil (using natural English technical DevOps terms where appropriate)',
  'kn-IN': 'Kannada (using natural English technical DevOps terms where appropriate)',
};

const ScanFindingInputSchema = z.object({
  id: z.string().max(120),
  ruleId: z.string().max(40),
  title: z.string().max(240),
  description: z.string().max(1000),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  category: z.string().max(60),
  fileName: z.string().max(240),
  lineNumber: z.number().nullable(),
  evidence: z.string().max(1200),
  impact: z.string().max(1000),
  recommendation: z.string().max(1000),
  fixExample: z.string().max(1500).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  source: z.string().max(120).optional(),
});

const ScanResultContextSchema = z.object({
  scanId: z.string().max(120),
  timestamp: z.string().max(100).optional(),
  scannedAt: z.string().max(100).optional(),
  riskScore: z.number().min(0).max(100),
  riskLabel: z.string().max(60),
  totalFindings: z.number().min(0),
  severityCounts: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    info: z.number(),
  }),
  fileSummaries: z
    .array(
      z.object({
        fileName: z.string().max(240),
        fileType: z.string().max(80),
        lineCount: z.number(),
        findingCount: z.number(),
      })
    )
    .max(20),
  findings: z.array(ScanFindingInputSchema).max(60),
});

const IncidentContextSchema = z.object({
  id: z.string().max(80),
  title: z.string().max(240),
  severity: z.string().max(40),
  status: z.string().max(40),
  affectedService: z.string().max(160),
  namespace: z.string().max(120).optional(),
  timestamp: z.string().max(120).optional(),
  summary: z.string().max(2000),
  timeline: z
    .array(
      z.object({
        timestamp: z.string().max(80),
        source: z.string().max(120),
        title: z.string().max(240),
        detail: z.string().max(600),
      })
    )
    .max(25)
    .optional(),
  logs: z
    .array(
      z.object({
        timestamp: z.string().max(80),
        level: z.string().max(20),
        pod: z.string().max(160).optional(),
        message: z.string().max(1000),
      })
    )
    .max(50)
    .optional(),
  rawEvidenceText: z.string().max(12000).optional(),
});

export const InfraVoiceChatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty.').max(4000),
  conversationId: z.string().max(120).optional(),
  contextType: ChatContextTypeSchema.default('general'),
  language: SupportedLanguageSchema.default('en-IN'),
  workspaceName: z.string().max(120).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })
    )
    .max(20)
    .default([]),
  scanResult: ScanResultContextSchema.nullable().optional(),
  incident: IncidentContextSchema.nullable().optional(),
  artifactText: z.string().max(15000).nullable().optional(),
});

export type InfraVoiceChatRequest = z.infer<typeof InfraVoiceChatRequestSchema>;

export interface InfraVoiceChatResponse {
  reply: string;
  conversationId: string;
  model: string;
  contextType: ChatContextType;
  toolActivity: ToolCallTrace[];
  contextSummary: string[];
  timestamp: string;
}

function buildContextBlocks(input: InfraVoiceChatRequest, maxContextChars: number): {
  blocks: string[];
  contextSummary: string[];
} {
  const blocks: string[] = [];
  const contextSummary: string[] = [];

  blocks.push(
    `ACTIVE DOMAIN CONTEXT: ${input.contextType}\nWORKSPACE: ${sanitizeUntrustedText(input.workspaceName || 'prod-ap-south-1', 100)}`
  );

  if (input.language && input.language !== 'en-IN') {
    blocks.push(
      `LANGUAGE PREFERENCE: Respond in ${LANGUAGE_LABELS[input.language]}. Keep CLI commands, YAML/HCL keys, and ShipSafe rule IDs in ASCII inside code blocks.`
    );
  }

  if (input.scanResult) {
    contextSummary.push(
      `ShipSafe Scan ${input.scanResult.scanId} (${input.scanResult.totalFindings} findings, risk ${input.scanResult.riskScore}/100)`
    );
    const compactScan = {
      scanId: input.scanResult.scanId,
      riskScore: input.scanResult.riskScore,
      riskLabel: input.scanResult.riskLabel,
      severityCounts: input.scanResult.severityCounts,
      files: input.scanResult.fileSummaries.map((f) => `${f.fileName} (${f.fileType})`),
      findings: input.scanResult.findings.slice(0, 20).map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        fileName: f.fileName,
        lineNumber: f.lineNumber,
        title: f.title,
        evidence: sanitizeUntrustedText(f.evidence, 180),
        recommendation: f.recommendation,
      })),
    };
    blocks.push(
      wrapUntrustedContext('shipsafe_scan', JSON.stringify(compactScan, null, 2), 4500)
    );
  }

  if (input.incident) {
    contextSummary.push(`Incident ${input.incident.id} (${input.incident.affectedService})`);
    const compactIncident = {
      id: input.incident.id,
      title: input.incident.title,
      severity: input.incident.severity,
      status: input.incident.status,
      affectedService: input.incident.affectedService,
      namespace: input.incident.namespace,
      summary: input.incident.summary,
      timeline: (input.incident.timeline || []).slice(0, 8),
      logs: (input.incident.logs || []).slice(0, 15),
      rawEvidenceText: input.incident.rawEvidenceText,
    };
    blocks.push(
      wrapUntrustedContext('incident_evidence', JSON.stringify(compactIncident, null, 2), 4500)
    );
  }

  if (input.artifactText && input.artifactText.trim().length > 0) {
    contextSummary.push('Attached config/log snippet');
    blocks.push(
      wrapUntrustedContext('user_attached_artifact', input.artifactText, 4500)
    );
  }

  // Respect total context budget
  const joined = blocks.join('\n\n');
  if (joined.length > maxContextChars) {
    return {
      blocks: [joined.slice(0, maxContextChars)],
      contextSummary,
    };
  }

  return { blocks, contextSummary };
}

export async function runInfraVoiceChat(
  rawInput: unknown
): Promise<InfraVoiceChatResponse> {
  const parsed = InfraVoiceChatRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AiServiceError(
      parsed.error.issues[0]?.message || 'Invalid chat request payload.',
      400,
      'INVALID_RESPONSE',
      false
    );
  }

  const input = parsed.data;
  const cfg = getAiConfig();
  const conversationId = input.conversationId || `conv-${Date.now()}`;

  const historyTurns = sanitizeConversationWindow(
    input.history,
    cfg.maxHistoryMessages,
    5500
  );

  const { blocks, contextSummary } = buildContextBlocks(input, cfg.maxContextChars);
  const sanitizedMessage = sanitizeUntrustedText(input.message, 3800);

  const userTurnText = [
    ...blocks,
    'ENGINEER QUESTION:',
    wrapUntrustedContext('user_query', sanitizedMessage, 3800),
  ].join('\n\n');

  const contents: Content[] = [
    ...historyTurns.map((turn) => ({
      role: turn.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: turn.content }],
    })),
    {
      role: 'user',
      parts: [{ text: userTurnText }],
    },
  ];

  const toolCtx: ToolExecutionContext = {
    scanResult: (input.scanResult as unknown as ShipSafeScanResult | undefined) ?? null,
    incident: (input.incident as IncidentContextPayload | undefined) ?? null,
    artifactText: input.artifactText ?? null,
    workspaceName: input.workspaceName,
  };

  const toolActivity: ToolCallTrace[] = [];
  const declarations = getToolDeclarations();
  let totalToolExecutions = 0;

  let response = await generateWithRetry({
    contents,
    systemInstruction: INFRAVOICE_SYSTEM_PROMPT,
    tools: [{ functionDeclarations: declarations }],
    thinkingLevel: ThinkingLevel.LOW,
  });

  for (let iteration = 0; iteration < cfg.maxToolIterations; iteration++) {
    const calls = response.functionCalls;
    if (!calls || calls.length === 0) {
      break;
    }

    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) {
      contents.push(modelContent);
    }

    const functionResponseParts: Part[] = [];
    for (const call of calls) {
      if (totalToolExecutions >= 6) {
        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name || 'unknown',
            response: { error: 'Maximum read-only tool call budget reached for this turn.' },
          },
        });
        continue;
      }

      totalToolExecutions += 1;
      const toolName = call.name || 'unknown';
      const outcome = executeRegisteredTool(toolName, call.args ?? {}, toolCtx);
      toolActivity.push(outcome.trace);

      functionResponseParts.push({
        functionResponse: {
          id: call.id,
          name: toolName,
          response: outcome.responsePayload,
        },
      });
    }

    contents.push({
      role: 'user',
      parts: functionResponseParts,
    });

    response = await generateWithRetry({
      contents,
      systemInstruction: INFRAVOICE_SYSTEM_PROMPT,
      tools: [{ functionDeclarations: declarations }],
      thinkingLevel: ThinkingLevel.LOW,
    });
  }

  const rawReply = (response.text || '').trim();
  if (!rawReply) {
    throw new AiServiceError(
      'Gemini returned an empty response. Please retry your question.',
      502,
      'INVALID_RESPONSE',
      true
    );
  }

  // Redact any accidental credential tokens from assistant output while keeping markdown intact
  const safeReply = sanitizeUntrustedText(rawReply, 12000);

  return {
    reply: safeReply,
    conversationId,
    model: cfg.model,
    contextType: input.contextType,
    toolActivity,
    contextSummary,
    timestamp: new Date().toISOString(),
  };
}
