import type { FitMode, OutputFormat } from '../shared/types.js';
import type { CropSpec } from '../shared/cropSpec.js';
import type { Orientation } from '../shared/orientation.js';
import { applyFit } from '../shared/fit.js';
import { applyManualCrop } from '../shared/manualCrop.js';
import { applyUserOrientation } from '../shared/orientation.js';
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
  orientation?: Orientation;
  /** Only used when mode is 'cover'; ignored for Fit (contain) modes. */
  crop?: CropSpec;
}

export interface ProcessResult {
  buffer: Buffer;
  contentType: string;
  format: OutputFormat;
}

export async function processPhoto(input: ProcessPhotoInput): Promise<ProcessResult> {
  const autoOriented = await orientImage(input.buffer);
  const oriented = await applyUserOrientation(autoOriented, input.orientation);
  const source = { width: oriented.width, height: oriented.height };

  // A crop rectangle only means something in Fill (Cover) mode — Fit
  // (contain) modes always show the whole photo, so a leftover crop from a
  // photo that was previously in Fill mode is never honored here.
  const useCrop = input.mode === 'cover' && input.crop;

  const pipeline = useCrop
    ? await applyManualCrop({
        buffer: oriented.buffer,
        source,
        target: input.target,
        crop: input.crop as CropSpec,
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
