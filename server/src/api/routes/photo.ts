import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { processPhoto } from '../../pipeline/photo/index.js';
import { resolveTarget } from '../resolveTarget.js';
import { processOptionsSchema, targetSchema } from '../schemas.js';
import { parseCropField } from '../parseCrop.js';
import { PipelineError, UnsupportedMediaError } from '../../pipeline/errors.js';

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);

function fieldValue(fields: Record<string, unknown>, name: string): string | undefined {
  const field = fields[name] as { value?: string } | undefined;
  return field?.value;
}

export default async function photoRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/photo', async (req, reply) => {
    const file = await req.file();
    if (!file) {
      throw new PipelineError('No file uploaded.', 400, 'MISSING_FILE');
    }

    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      throw new PipelineError('Upload exceeds the configured size limit.', 413, 'UPLOAD_TOO_LARGE');
    }

    // The client-supplied Content-Type is never trusted: the real format is
    // whatever sharp's underlying decoder (libvips, reading magic bytes)
    // actually recognizes the bytes as.
    const metadata = await sharp(buffer)
      .metadata()
      .catch(() => undefined);
    if (!metadata?.format || !ACCEPTED_FORMATS.has(metadata.format)) {
      throw new UnsupportedMediaError(metadata?.format ?? 'unknown');
    }

    const fields = file.fields as Record<string, unknown>;
    const target = resolveTarget(
      targetSchema.parse({
        presetId: fieldValue(fields, 'presetId'),
        width: fieldValue(fields, 'width'),
        height: fieldValue(fields, 'height'),
      }),
    );
    const options = processOptionsSchema.parse({
      mode: fieldValue(fields, 'mode'),
      allowUpscale: fieldValue(fields, 'allowUpscale'),
      format: fieldValue(fields, 'format'),
      quality: fieldValue(fields, 'quality'),
      padColor: fieldValue(fields, 'padColor'),
    });
    const crop = parseCropField(fieldValue(fields, 'crop'));

    const result = await processPhoto({
      buffer,
      target,
      mode: options.mode,
      allowUpscale: options.allowUpscale,
      format: options.format,
      quality: options.quality,
      padColor: options.padColor,
      crop,
    });

    reply.header('Content-Type', result.contentType);
    return result.buffer;
  });
}
