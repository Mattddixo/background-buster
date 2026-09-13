import sharp from 'sharp';
import type { Dimensions } from './types.js';
import type { CropSpec } from './cropSpec.js';
import { assertNoUpscale } from './fit.js';

export interface ApplyManualCropInput {
  /** Already EXIF-oriented (run through orientImage first). */
  buffer: Buffer;
  source: Dimensions;
  target: Dimensions;
  crop: CropSpec;
  allowUpscale: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Applies a user-chosen crop from the photo editor: rotate, then flip, then
// extract the crop rectangle, then resize to the exact target — the same
// operation order the client's canvas preview uses, so what was shown while
// editing is exactly what comes out here. Verified against sharp directly
// (not assumed): rotate(90) is clockwise, flop() mirrors horizontally,
// flip() mirrors vertically.
export async function applyManualCrop(input: ApplyManualCropInput): Promise<sharp.Sharp> {
  const { buffer, source, target, crop, allowUpscale } = input;

  const swapped = crop.rotation === 90 || crop.rotation === 270;
  const rotatedWidth = swapped ? source.height : source.width;
  const rotatedHeight = swapped ? source.width : source.height;

  let pipeline = sharp(buffer);
  if (crop.rotation !== 0) pipeline = pipeline.rotate(crop.rotation);
  if (crop.flipH) pipeline = pipeline.flop();
  if (crop.flipV) pipeline = pipeline.flip();

  const left = clamp(Math.round(crop.x * rotatedWidth), 0, rotatedWidth - 1);
  const top = clamp(Math.round(crop.y * rotatedHeight), 0, rotatedHeight - 1);
  const width = clamp(Math.round(crop.width * rotatedWidth), 1, rotatedWidth - left);
  const height = clamp(Math.round(crop.height * rotatedHeight), 1, rotatedHeight - top);

  assertNoUpscale({ width, height }, target, allowUpscale);

  return pipeline
    .extract({ left, top, width, height })
    .resize(target.width, target.height, { fit: 'fill', kernel: sharp.kernel.lanczos3 });
}
