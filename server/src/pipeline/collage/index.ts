import sharp from 'sharp';
import { applyFit } from '../shared/fit.js';
import { applyManualCrop } from '../shared/manualCrop.js';
import { orientImage } from '../shared/orient.js';
import { pickFormat, applyEncoding, contentTypeFor } from '../shared/format.js';
import type { OutputFormat } from '../shared/types.js';
import type { CropSpec } from '../shared/cropSpec.js';
import { PipelineError } from '../errors.js';
import { computeCollageLayout } from './grid.js';

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 9;

export interface ProcessCollageInput {
  buffers: Buffer[];
  target: { width: number; height: number };
  /** Parallel to `buffers`; a photo with no entry falls back to automatic Cover fit. */
  crops?: Array<CropSpec | undefined>;
  gutter?: number;
  gutterColor?: string;
  allowUpscale?: boolean;
  format?: OutputFormat;
  quality?: number;
}

export interface ProcessResult {
  buffer: Buffer;
  contentType: string;
}

function withPhotoContext<T>(index: number, promise: Promise<T>): Promise<T> {
  return promise.catch((err: unknown) => {
    if (err instanceof PipelineError) {
      throw new PipelineError(`Photo ${index + 1}: ${err.message}`, err.statusCode, err.code);
    }
    throw err;
  });
}

export async function processCollage(input: ProcessCollageInput): Promise<ProcessResult> {
  const { buffers, target } = input;
  if (buffers.length < MIN_PHOTOS || buffers.length > MAX_PHOTOS) {
    throw new PipelineError(
      `A collage needs between ${MIN_PHOTOS} and ${MAX_PHOTOS} photos (got ${buffers.length}).`,
      400,
      'INVALID_PHOTO_COUNT',
    );
  }

  const layout = computeCollageLayout(buffers.length, target, input.gutter);
  const gutterColor = input.gutterColor ?? '#121212';
  const allowUpscale = input.allowUpscale ?? false;

  // Every photo is fit into its own cell — either the manual crop chosen in
  // the editor, or (when none was set) the same saliency-aware Cover crop
  // used for a single photo — each against its own cell size, so a photo
  // smaller than its cell still trips the shared upscale guard, per-cell.
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < buffers.length; i++) {
    const cell = layout.cells[i];
    const cellTarget = { width: cell.width, height: cell.height };
    const crop = input.crops?.[i];

    const oriented = await orientImage(buffers[i]);
    const source = { width: oriented.width, height: oriented.height };

    const cellPipeline = await withPhotoContext(
      i,
      crop
        ? applyManualCrop({ buffer: oriented.buffer, source, target: cellTarget, crop, allowUpscale })
        : applyFit({ buffer: oriented.buffer, source, target: cellTarget, mode: 'cover', allowUpscale }),
    );
    const cellBuffer = await cellPipeline.png().toBuffer();
    composites.push({ input: cellBuffer, left: cell.x, top: cell.y });
  }

  const canvas = sharp({
    create: { width: target.width, height: target.height, channels: 4, background: gutterColor },
  }).composite(composites);

  const format = pickFormat(true, false, input.format);
  const buffer = await applyEncoding(canvas, format, input.quality).toBuffer();
  return { buffer, contentType: contentTypeFor(format) };
}
