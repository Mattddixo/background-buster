import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { generators } from '../../pipeline/generators/index.js';
import { generateRequestSchema } from '../schemas.js';
import { contentTypeFor, pickFormat, applyEncoding } from '../../pipeline/shared/format.js';
import { PipelineError } from '../../pipeline/errors.js';

export default async function generateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/generate', async () => Object.keys(generators));

  app.post<{ Params: { style: string } }>('/api/generate/:style', async (req, reply) => {
    const generator = generators[req.params.style];
    if (!generator) {
      throw new PipelineError(`Unknown generator style: ${req.params.style}`, 404, 'UNKNOWN_STYLE');
    }

    const body = generateRequestSchema.parse(req.body);
    const raw = await generator({ seed: body.seed, width: body.width, height: body.height });
    const format = pickFormat(true, false, body.format ?? 'png');
    const encoded = await applyEncoding(sharp(raw), format, body.quality).toBuffer();

    reply.header('Content-Type', contentTypeFor(format));
    return encoded;
  });
}
