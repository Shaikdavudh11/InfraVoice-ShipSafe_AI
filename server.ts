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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILE_COUNT,
  },
});

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'shipsafe-scanner' });
  });

  app.post('/api/shipsafe/scan', (req, res) => {
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

  // Generic error guard — never expose stack traces
  app.use(
    (
      _err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(500).json({ error: 'Internal server error while processing scan.' });
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
