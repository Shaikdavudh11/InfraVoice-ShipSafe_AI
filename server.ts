import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import {
  MAX_FILE_COUNT,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_SIZE_BYTES,
} from './src/lib/shipsafe/file-detector.ts';
import { scanUploadedFiles } from './src/lib/shipsafe/scan-engine.ts';
import { getAiConfig, isAiConfigured } from './src/lib/ai/ai-config.ts';
import { AiServiceError } from './src/lib/ai/gemini-client.ts';
import { checkRateLimit } from './src/lib/ai/rate-limiter.ts';
import { z } from 'zod';
import { runInfraVoiceChat } from './src/lib/ai/services/chat-service.ts';
import { analyzeShipSafeScan } from './src/lib/ai/services/shipsafe-ai-service.ts';
import { investigateIncident } from './src/lib/ai/services/incident-ai-service.ts';
import {
  approveAndStartRecovery,
  getSimulationEvents,
  getSimulationState,
  resetSimulationEnvironment,
  triggerIncidentScenario,
} from './src/lib/simulation/state-manager.ts';
import { investigateActiveSimulationIncident } from './src/lib/simulation/investigation-service.ts';

const TriggerScenarioRequestSchema = z.object({
  scenarioId: z.enum([
    'crashloop_backoff',
    'probe_misconfiguration',
    'resource_pressure',
  ]),
});

const ResetSimulationRequestSchema = z.object({
  confirmed: z.literal(true, {
    error: 'Explicit confirmation (confirmed: true) is required to reset simulation.',
  }),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILE_COUNT,
  },
});

function getClientRateKey(req: express.Request, scope: string): string {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.ip || req.socket?.remoteAddress || 'local';
  const normalizedIp = rawIp.replace(/[^a-zA-Z0-9.:_-]/g, '').slice(0, 64) || 'local';
  return `${scope}:${normalizedIp}`;
}

function handleAiRouteError(res: express.Response, err: unknown) {
  if (err instanceof AiServiceError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      retryable: err.retryable,
    });
    return;
  }
  res.status(500).json({
    error: 'Internal server error while processing AI request.',
    code: 'UPSTREAM_ERROR',
    retryable: true,
  });
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Defensive security headers (omits X-Frame-Options so embedded preview iframe works cleanly)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=()');
    next();
  });

  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) => {
    const cfg = getAiConfig();
    res.json({
      status: 'ok',
      service: 'infravoice-shipsafe',
      aiConfigured: isAiConfigured(cfg),
    });
  });

  app.get('/api/ai/status', (_req, res) => {
    const cfg = getAiConfig();
    res.status(200).json({
      configured: isAiConfigured(cfg),
      provider: cfg.useVertexAi ? 'vertex-ai' : 'gemini-developer-api',
      model: cfg.model,
    });
  });

  app.post('/api/shipsafe/scan', (req, res) => {
    const limit = checkRateLimit(getClientRateKey(req, 'shipsafe-scan'), 40, 60_000);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      res.status(429).json({
        error: `Too many scan requests. Please wait ${limit.retryAfterSeconds}s before scanning again.`,
      });
      return;
    }

    // Reject overly large Content-Length upfront before buffering
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > MAX_TOTAL_SIZE_BYTES + 64 * 1024) {
      res.status(413).json({
        error: 'Total upload payload exceeds the 5 MB limit.',
      });
      return;
    }

    upload.array('files', MAX_FILE_COUNT)(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              error: 'One or more files exceed the 1 MB individual file size limit.',
            });
            return;
          }
          if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
            res.status(400).json({
              error: `Maximum ${MAX_FILE_COUNT} files allowed per scan under field "files".`,
            });
            return;
          }
          res.status(400).json({ error: 'Invalid multipart upload request.' });
          return;
        }
        res.status(400).json({ error: 'Unable to parse uploaded files.' });
        return;
      }

      const uploaded = (req.files as Express.Multer.File[] | undefined) || [];
      const rawFiles = uploaded.map((file) => ({
        fileName: file.originalname,
        content: file.buffer.toString('utf8'),
        sizeBytes: file.size,
      }));

      // Explicitly drop buffer references after decoding
      for (const file of uploaded) {
        file.buffer = Buffer.alloc(0);
      }

      const outcome = scanUploadedFiles(rawFiles);
      if (!outcome.ok) {
        res.status(outcome.statusCode).json({
          error: outcome.error,
          rejections: outcome.rejections,
        });
        return;
      }

      res.status(200).json(outcome.result);
    });
  });

  app.post('/api/infravoice/chat', async (req, res) => {
    const cfg = getAiConfig();
    const limit = checkRateLimit(
      getClientRateKey(req, 'ai-chat'),
      cfg.rateLimitMaxRequests,
      cfg.rateLimitWindowMs
    );
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      res.status(429).json({
        error: `Too many AI requests. Please wait ${limit.retryAfterSeconds}s before retrying.`,
        code: 'RATE_LIMITED',
        retryable: true,
      });
      return;
    }

    try {
      const result = await runInfraVoiceChat(req.body);
      res.status(200).json(result);
    } catch (err) {
      handleAiRouteError(res, err);
    }
  });

  app.post('/api/shipsafe/analyze', async (req, res) => {
    const cfg = getAiConfig();
    const limit = checkRateLimit(
      getClientRateKey(req, 'ai-shipsafe'),
      cfg.rateLimitMaxRequests,
      cfg.rateLimitWindowMs
    );
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      res.status(429).json({
        error: `Too many AI analysis requests. Please wait ${limit.retryAfterSeconds}s before retrying.`,
        code: 'RATE_LIMITED',
        retryable: true,
      });
      return;
    }

    try {
      const result = await analyzeShipSafeScan(req.body);
      res.status(200).json(result);
    } catch (err) {
      handleAiRouteError(res, err);
    }
  });

  app.post('/api/incidents/investigate', async (req, res) => {
    const cfg = getAiConfig();
    const limit = checkRateLimit(
      getClientRateKey(req, 'ai-incident'),
      cfg.rateLimitMaxRequests,
      cfg.rateLimitWindowMs
    );
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      res.status(429).json({
        error: `Too many incident investigation requests. Please wait ${limit.retryAfterSeconds}s before retrying.`,
        code: 'RATE_LIMITED',
        retryable: true,
      });
      return;
    }

    try {
      const result = await investigateIncident(req.body);
      res.status(200).json(result);
    } catch (err) {
      handleAiRouteError(res, err);
    }
  });

  // =========================================================================
  // Phase 4: Isolated Incident Simulation & Safe Recovery APIs (Simulation-Only)
  // =========================================================================
  app.get('/api/simulation/state', (_req, res) => {
    res.status(200).json(getSimulationState());
  });

  app.get('/api/simulation/events', (_req, res) => {
    res.status(200).json({
      simulated: true,
      events: getSimulationEvents(),
    });
  });

  app.post('/api/simulation/trigger', (req, res) => {
    const limit = checkRateLimit(getClientRateKey(req, 'sim-mutate'), 40, 60_000);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      res.status(429).json({
        error: `Too many simulation triggers. Please wait ${limit.retryAfterSeconds}s.`,
      });
      return;
    }

    const parsed = TriggerScenarioRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:
          'Invalid scenarioId. Expected one of: crashloop_backoff, probe_misconfiguration, resource_pressure.',
      });
      return;
    }

    const nextState = triggerIncidentScenario(parsed.data.scenarioId);
    res.status(200).json(nextState);
  });

  app.post('/api/simulation/investigate', async (req, res) => {
    const cfg = getAiConfig();
    const limit = checkRateLimit(
      getClientRateKey(req, 'sim-investigate'),
      cfg.rateLimitMaxRequests,
      cfg.rateLimitWindowMs
    );
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      res.status(429).json({
        error: `Too many investigation requests. Please wait ${limit.retryAfterSeconds}s.`,
        code: 'RATE_LIMITED',
        retryable: true,
      });
      return;
    }

    try {
      const outcome = await investigateActiveSimulationIncident();
      res.status(200).json(outcome);
    } catch (err) {
      handleAiRouteError(res, err);
    }
  });

  app.post('/api/simulation/remediation/approve', (req, res) => {
    const limit = checkRateLimit(getClientRateKey(req, 'sim-approve'), 30, 60_000);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      res.status(429).json({
        error: `Too many remediation approval requests. Please wait ${limit.retryAfterSeconds}s.`,
      });
      return;
    }

    const outcome = approveAndStartRecovery(req.body);
    if (!outcome.ok) {
      res.status(outcome.statusCode).json({ error: outcome.error });
      return;
    }

    res.status(200).json({
      simulated: true,
      actionRecord: outcome.actionRecord,
      state: outcome.state,
    });
  });

  app.post('/api/simulation/reset', (req, res) => {
    const limit = checkRateLimit(getClientRateKey(req, 'sim-reset'), 30, 60_000);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      res.status(429).json({
        error: `Too many simulation reset requests. Please wait ${limit.retryAfterSeconds}s.`,
      });
      return;
    }

    const parsed = ResetSimulationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Explicit confirmation (confirmed: true) is required to reset simulation.',
      });
      return;
    }

    const resetState = resetSimulationEnvironment();
    res.status(200).json(resetState);
  });

  // Body parser & generic error guard — never expose stack traces
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const e = err as { type?: string; status?: number };
      if (e?.type === 'entity.too.large' || e?.status === 413) {
        res.status(413).json({ error: 'Request JSON payload exceeds the 512 KB limit.' });
        return;
      }
      if (err instanceof SyntaxError && e?.status === 400) {
        res.status(400).json({ error: 'Malformed JSON request body.' });
        return;
      }
      res.status(500).json({ error: 'Internal server error while processing request.' });
    }
  );

  return app;
}

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`InfraVoice — ShipSafe AI server listening on port ${PORT}`);
  });
}

// Only start HTTP listener when executed directly (not when imported in tests)
const isEntrypoint =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === __filename;

if (isEntrypoint) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  });
}
