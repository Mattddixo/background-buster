import type { FitMode, OutputFormat } from '../shared/types.js';
import { applyFit } from '../shared/fit.js';
import { pickFormat, applyEncoding, contentTypeFor } from '../shared/format.js';
import { orientImage } from '../shared/orient.js';

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
  const oriented = await orientImage(input.buffer);

  const pipeline = await applyFit({
    buffer: oriented.buffer,
    source: { width: oriented.width, height: oriented.height },
    target: input.target,
    mode: input.mode,
    allowUpscale: input.allowUpscale ?? false,
    padColor: input.padColor,
  });

  const format = pickFormat(oriented.hasAlpha, false, input.format);
  const buffer = await applyEncoding(pipeline, format, input.quality).toBuffer();

  return { buffer, contentType: contentTypeFor(format), format };
}
