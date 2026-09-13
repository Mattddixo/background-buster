import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { processCollage, MIN_PHOTOS, MAX_PHOTOS } from '../../pipeline/collage/index.js';
import { computeCollageLayout } from '../../pipeline/collage/grid.js';
import { resolveTarget } from '../resolveTarget.js';
import { collageOptionsSchema, collageLayoutQuerySchema, targetSchema } from '../schemas.js';
import { parseCropField } from '../parseCrop.js';
import { PipelineError, UnsupportedMediaError } from '../../pipeline/errors.js';

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);

export default async function collageRoutes(app: FastifyInstance): Promise<void> {
  // Lets the editor know each cell's exact pixel size (for the crop frame
  // aspect ratio and the upscale-aware zoom cap) before any file is
  // uploaded — same layout math the final render uses, so they can't drift
  // apart into two different ideas of "where photo 3 goes."
  app.get('/api/collage/layout', async (req) => {
    const query = collageLayoutQuerySchema.parse(req.query);
    return computeCollageLayout(query.count, { width: query.width, height: query.height }, query.gutter);
  });

  app.post('/api/collage', async (req, reply) => {
    // Fields and files can arrive in any order across a multi-file multipart
    // body, so this walks every part in one pass instead of relying on the
    // "fields must come before the file" ordering the single-file routes
    // lean on with req.file().
    const fields: Record<string, string> = {};
    const buffers: Buffer[] = [];

    for await (const part of req.parts()) {
      if (part.type !== 'file') {
        if (typeof part.value === 'string') fields[part.fieldname] = part.value;
        continue;
      }

      if (buffers.length >= MAX_PHOTOS) {
        await part.toBuffer().catch(() => undefined);
        throw new PipelineError(`A collage supports at most ${MAX_PHOTOS} photos.`, 400, 'TOO_MANY_PHOTOS');
      }

      const buffer = await part.toBuffer();
      const metadata = await sharp(buffer)
        .metadata()
        .catch(() => undefined);
      if (!metadata?.format || !ACCEPTED_FORMATS.has(metadata.format)) {
        throw new UnsupportedMediaError(metadata?.format ?? 'unknown');
      }
      buffers.push(buffer);
    }

    if (buffers.length < MIN_PHOTOS) {
      throw new PipelineError(
        `A collage needs at least ${MIN_PHOTOS} photos (got ${buffers.length}).`,
        400,
        'INVALID_PHOTO_COUNT',
      );
    }

    const target = resolveTarget(
      targetSchema.parse({ presetId: fields.presetId, width: fields.width, height: fields.height }),
    );
    const options = collageOptionsSchema.parse({
      allowUpscale: fields.allowUpscale,
      gutter: fields.gutter,
      gutterColor: fields.gutterColor,
      format: fields.format,
      quality: fields.quality,
    });
    const crops = buffers.map((_, i) => parseCropField(fields[`crop_${i}`]));

    const result = await processCollage({
      buffers,
      target,
      crops,
      allowUpscale: options.allowUpscale,
      gutter: options.gutter,
      gutterColor: options.gutterColor,
      format: options.format,
      quality: options.quality,
    });

    reply.header('Content-Type', result.contentType);
    return result.buffer;
  });
}
