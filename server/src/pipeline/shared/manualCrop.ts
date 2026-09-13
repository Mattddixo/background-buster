import sharp from 'sharp';
import type { Dimensions } from './types.js';
import type { CropSpec } from './cropSpec.js';
import { assertNoUpscale } from './fit.js';

export interface ApplyManualCropInput {
  /** Already oriented — EXIF auto-orient plus any user rotation/flip. */
  buffer: Buffer;
  source: Dimensions;
  target: Dimensions;
  crop: CropSpec;
  allowUpscale: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Applies a user-chosen crop rectangle from the photo editor — nothing
// more. Rotation/flip are the caller's job (applyUserOrientation), applied
// before this ever sees the buffer, so the fraction-of-image math here
// never has to reason about orientation at all.
export async function applyManualCrop(input: ApplyManualCropInput): Promise<sharp.Sharp> {
  const { buffer, source, target, crop, allowUpscale } = input;

  const left = clamp(Math.round(crop.x * source.width), 0, source.width - 1);
  const top = clamp(Math.round(crop.y * source.height), 0, source.height - 1);
  const width = clamp(Math.round(crop.width * source.width), 1, source.width - left);
  const height = clamp(Math.round(crop.height * source.height), 1, source.height - top);

  assertNoUpscale({ width, height }, target, allowUpscale);

  return sharp(buffer)
    .extract({ left, top, width, height })
    .resize(target.width, target.height, { fit: 'fill', kernel: sharp.kernel.lanczos3 });
}
