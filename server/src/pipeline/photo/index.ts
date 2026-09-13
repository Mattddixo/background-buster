import type { FitMode, OutputFormat } from '../shared/types.js';
import type { CropSpec } from '../shared/cropSpec.js';
import { applyFit } from '../shared/fit.js';
import { applyManualCrop } from '../shared/manualCrop.js';
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
  /** When present, overrides the automatic fit entirely for this photo. */
  crop?: CropSpec;
}

export interface ProcessResult {
  buffer: Buffer;
  contentType: string;
  format: OutputFormat;
}

export async function processPhoto(input: ProcessPhotoInput): Promise<ProcessResult> {
  const oriented = await orientImage(input.buffer);
  const source = { width: oriented.width, height: oriented.height };

  const pipeline = input.crop
    ? await applyManualCrop({
        buffer: oriented.buffer,
        source,
        target: input.target,
        crop: input.crop,
        allowUpscale: input.allowUpscale ?? false,
      })
    : await applyFit({
        buffer: oriented.buffer,
        source,
        target: input.target,
        mode: input.mode,
        allowUpscale: input.allowUpscale ?? false,
        padColor: input.padColor,
      });

  const format = pickFormat(oriented.hasAlpha, false, input.format);
  const buffer = await applyEncoding(pipeline, format, input.quality).toBuffer();

  return { buffer, contentType: contentTypeFor(format), format };
}
