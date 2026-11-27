import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { Content, GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { getAiConfig, isAiConfigured } from './ai-config.ts';

export class AiServiceError extends Error {
  statusCode: number;
  code:
    | 'AI_UNAVAILABLE'
    | 'RATE_LIMITED'
    | 'TIMEOUT'
    | 'QUOTA_EXHAUSTED'
    | 'INVALID_RESPONSE'
    | 'UPSTREAM_ERROR';
  retryable: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: AiServiceError['code'],
    retryable = false
  ) {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

export interface GeminiClientLike {
  models: {
    generateContent: (params: GenerateContentParameters) => Promise<GenerateContentResponse>;
    generateContentStream?: (
      params: GenerateContentParameters
    ) => Promise<AsyncIterable<GenerateContentResponse>>;
  };
}

let testClientOverride: GeminiClientLike | null = null;

/**
 * Allows automated tests to inject a deterministic mock Gemini client
 * without requiring live Google Cloud or Gemini API credentials.
 */
export function setGeminiClientOverride(client: GeminiClientLike | null): void {
  testClientOverride = client;
}

export function getGeminiClient(): GeminiClientLike {
  if (testClientOverride) {
    return testClientOverride;
  }

  const cfg = getAiConfig();
  if (!isAiConfigured(cfg)) {
    throw new AiServiceError(
      cfg.useVertexAi
        ? 'Vertex AI is enabled but GOOGLE_CLOUD_PROJECT or Google Cloud credentials are not configured.'
        : 'Gemini AI is not configured on the server. Set GEMINI_API_KEY in Secrets or configure Vertex AI.',
      503,
      'AI_UNAVAILABLE',
      false
    );
  }

  if (cfg.useVertexAi) {
    return new GoogleGenAI({
      vertexai: true,
      project: cfg.gcpProject,
      location: cfg.gcpLocation,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function classifyUpstreamError(err: unknown): AiServiceError {
  if (err instanceof AiServiceError) return err;

  const rawMsg = err instanceof Error ? err.message : String(err);
  const lower = rawMsg.toLowerCase();

  if (lower.includes('abort') || lower.includes('timed out') || lower.includes('timeout')) {
    return new AiServiceError(
      'Gemini took too long to respond. Please retry.',
      504,
      'TIMEOUT',
      true
    );
  }

  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return new AiServiceError(
      'Gemini API rate limit or quota reached. Please wait briefly and retry.',
      429,
      'QUOTA_EXHAUSTED',
      true
    );
  }

  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('could not load the default credentials')
  ) {
    return new AiServiceError(
      'Server-side Gemini/Vertex AI credentials were rejected or are unavailable. Check Settings > Secrets or Google Cloud ADC.',
      503,
      'AI_UNAVAILABLE',
      false
    );
  }

  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('econnreset')) {
    return new AiServiceError(
      'Gemini service is temporarily unavailable. Please retry.',
      503,
      'UPSTREAM_ERROR',
      true
    );
  }

  return new AiServiceError(
    'Unable to complete AI request right now. Please retry.',
    502,
    'UPSTREAM_ERROR',
    true
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new AiServiceError('AI request timed out.', 504, 'TIMEOUT', true));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface GenerateOptions {
  contents: string | Content[];
  systemInstruction: string;
  responseMimeType?: string;
  responseSchema?: unknown;
  tools?: GenerateContentParameters['config'] extends infer C
    ? C extends { tools?: infer T }
      ? T
      : never
    : never;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
}

export async function generateWithRetry(
  options: GenerateOptions
): Promise<GenerateContentResponse> {
  const cfg = getAiConfig();
  const client = getGeminiClient();

  const maxAttempts = 2;
  let lastError: AiServiceError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const config: GenerateContentParameters['config'] = {
        systemInstruction: options.systemInstruction,
        thinkingConfig: {
          thinkingLevel: options.thinkingLevel ?? ThinkingLevel.LOW,
        },
      };

      const maxTokens = options.maxOutputTokens ?? cfg.maxOutputTokens;
      if (typeof maxTokens === 'number' && maxTokens > 0) {
        config.maxOutputTokens = maxTokens;
      }

      if (options.responseMimeType) {
        config.responseMimeType = options.responseMimeType;
      }
      if (options.responseSchema) {
        config.responseSchema = options.responseSchema as GenerateContentParameters['config'] extends {
          responseSchema?: infer S;
        }
          ? S
          : never;
      }
      if (options.tools) {
        config.tools = options.tools;
      }

      const response = await withTimeout(
        client.models.generateContent({
          model: cfg.model,
          contents: options.contents,
          config,
        }),
        cfg.requestTimeoutMs
      );

      return response;
    } catch (err) {
      lastError = classifyUpstreamError(err);
      if (!lastError.retryable || attempt >= maxAttempts) {
        throw lastError;
      }
      await new Promise((r) => setTimeout(r, 350 * attempt));
    }
  }

  throw lastError ?? new AiServiceError('AI request failed.', 502, 'UPSTREAM_ERROR', true);
}
