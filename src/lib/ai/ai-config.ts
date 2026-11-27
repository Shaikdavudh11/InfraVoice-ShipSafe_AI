export interface AiConfig {
  model: string;
  useVertexAi: boolean;
  gcpProject: string;
  gcpLocation: string;
  hasApiKey: boolean;
  hasVertexCredentials: boolean;
  requestTimeoutMs: number;
  maxOutputTokens: number;
  maxHistoryMessages: number;
  maxContextChars: number;
  maxToolIterations: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

const DEFAULT_MODEL = 'gemini-4-hydrogen';

const PROHIBITED_DEPRECATED_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
]);

export function resolveModelId(envModel?: string): string {
  const candidate = (envModel || '').trim();
  if (!candidate || PROHIBITED_DEPRECATED_MODELS.has(candidate.toLowerCase())) {
    return DEFAULT_MODEL;
  }
  return candidate;
}

export function getAiConfig(): AiConfig {
  const useVertexAi = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
  const gcpProject = (process.env.GOOGLE_CLOUD_PROJECT || '').trim();
  const gcpLocation = (process.env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim();
  const rawApiKey = (process.env.GEMINI_API_KEY || '').trim();
  const hasApiKey = Boolean(rawApiKey && rawApiKey !== 'MY_GEMINI_API_KEY');
  const hasVertexCredentials = Boolean(
    useVertexAi && gcpProject && (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE)
  );

  return {
    model: resolveModelId(process.env.GEMINI_MODEL),
    useVertexAi,
    gcpProject,
    gcpLocation,
    hasApiKey,
    hasVertexCredentials,
    requestTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 28000),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 4096),
    maxHistoryMessages: 8,
    maxContextChars: 12000,
    maxToolIterations: 4,
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 25,
  };
}

export function isAiConfigured(config: AiConfig = getAiConfig()): boolean {
  return config.useVertexAi ? Boolean(config.gcpProject) : config.hasApiKey;
}
