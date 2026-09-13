import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { config } from './config/index.js';
import { loggerOptions } from './logging/index.js';
import { registerRoutes } from './api/router.js';
import { PipelineError } from './pipeline/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildServer() {
  const app = Fastify({
    logger: loggerOptions,
    bodyLimit: (config.MAX_UPLOAD_MB + 1) * 1024 * 1024,
  });

  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  });

  const webDist = path.join(__dirname, '../../web/dist');
  await app.register(fastifyStatic, { root: webDist });

  await registerRoutes(app);

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof PipelineError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      return reply
        .status(400)
        .send({ error: 'VALIDATION_ERROR', message: err.issues.map((i) => i.message).join('; ') });
    }
    app.log.error(err);
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Something went wrong.' });
  });

  return app;
}
