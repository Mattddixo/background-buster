import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { processGif } from '../../pipeline/gif/index.js';
import { resolveTarget } from '../resolveTarget.js';
import { processOptionsSchema, targetSchema } from '../schemas.js';
import { PipelineError, UnsupportedMediaError } from '../../pipeline/errors.js';

function fieldValue(fields: Record<string, unknown>, name: string): string | undefined {
  const field = fields[name] as { value?: string } | undefined;
  return field?.value;
}

export default async function gifRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/gif', async (req, reply) => {
    const file = await req.file();
    if (!file) {
      throw new PipelineError('No file uploaded.', 400, 'MISSING_FILE');
    }

    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      throw new PipelineError('Upload exceeds the configured size limit.', 413, 'UPLOAD_TOO_LARGE');
    }

    const metadata = await sharp(buffer, { animated: true })
      .metadata()
      .catch(() => undefined);
    if (metadata?.format !== 'gif') {
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
      padColor: fieldValue(fields, 'padColor'),
    });

    const result = await processGif({
      buffer,
      target,
      mode: options.mode,
      allowUpscale: options.allowUpscale,
      padColor: options.padColor,
    });

    reply.header('Content-Type', result.contentType);
    return result.buffer;
  });
}
