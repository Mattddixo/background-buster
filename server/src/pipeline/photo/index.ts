import sharp from 'sharp';
import type { FitMode, OutputFormat } from '../shared/types.js';
import { applyFit } from '../shared/fit.js';
import { pickFormat, applyEncoding, contentTypeFor } from '../shared/format.js';
import { PipelineError } from '../errors.js';

export interface ProcessPhotoInput {
  buffer: Buffer;
  target: { width: number; height: number };
  mode: FitMode;
  allowUpscale?: boolean;
  format?: OutputFormat;
  quality?: number;
  padColor?: string;
}

export interface ProcessResult {
  buffer: Buffer;
  contentType: string;
  format: OutputFormat;
}

export async function processPhoto(input: ProcessPhotoInput): Promise<ProcessResult> {
  // .rotate() with no args applies the EXIF orientation and then sharp drops
  // the original metadata (we never call withMetadata()) — orientation is
  // respected but EXIF/GPS never survives into the output.
  const oriented = sharp(input.buffer).rotate();
  const metadata = await oriented.metadata();
  if (!metadata.width || !metadata.height) {
    throw new PipelineError('Could not read image dimensions.', 422, 'UNREADABLE_IMAGE');
  }
  const orientedBuffer = await oriented.toBuffer();

  const pipeline = await applyFit({
    buffer: orientedBuffer,
    source: { width: metadata.width, height: metadata.height },
    target: input.target,
    mode: input.mode,
    allowUpscale: input.allowUpscale ?? false,
    padColor: input.padColor,
  });

  const format = pickFormat(Boolean(metadata.hasAlpha), false, input.format);
  const buffer = await applyEncoding(pipeline, format, input.quality).toBuffer();

  return { buffer, contentType: contentTypeFor(format), format };
}
