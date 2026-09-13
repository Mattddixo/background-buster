import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/index.js';
import { loggerOptions } from './logging/index.js';
import { registerRoutes } from './api/router.js';
import { PipelineError } from './pipeline/errors.js';
import { MAX_PHOTOS } from './pipeline/collage/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ZodLikeError {
  name: 'ZodError';
  issues: Array<{ message: string }>;
}

function isZodError(err: unknown): err is ZodLikeError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'ZodError' &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

export async function buildServer() {
  const app = Fastify({
    logger: loggerOptions,
    // Sized for the largest request this app accepts: a collage of
    // MAX_PHOTOS files, each up to MAX_UPLOAD_MB, plus multipart overhead.
    bodyLimit: (config.MAX_UPLOAD_MB * MAX_PHOTOS + 5) * 1024 * 1024,
  });

  // Registered before any routes: Fastify resolves each plugin/route's
  // error handler from the encapsulation context that exists at the moment
  // it's registered, so setting this after `registerRoutes` was observed to
  // silently never apply to those routes at all — they kept falling through
  // to Fastify's own default handler instead. Verified live (see
  // server.test.ts), not assumed.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof PipelineError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (isZodError(err)) {
      return reply
        .status(400)
        .send({ error: 'VALIDATION_ERROR', message: err.issues.map((i) => i.message).join('; ') });
    }
    app.log.error(err);
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Something went wrong.' });
  });

  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: MAX_PHOTOS },
  });

  const webDist = path.join(__dirname, '../../web/dist');
  await app.register(fastifyStatic, { root: webDist });

  await registerRoutes(app);

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}
