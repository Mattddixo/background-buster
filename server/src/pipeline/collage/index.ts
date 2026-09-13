import sharp from 'sharp';
import { applyFit } from '../shared/fit.js';
import { applyManualCrop } from '../shared/manualCrop.js';
import { applyUserOrientation } from '../shared/orientation.js';
import { orientImage } from '../shared/orient.js';
import { pickFormat, applyEncoding, contentTypeFor } from '../shared/format.js';
import type { OutputFormat, FitMode } from '../shared/types.js';
import type { CropSpec } from '../shared/cropSpec.js';
import type { Orientation } from '../shared/orientation.js';
import { PipelineError } from '../errors.js';
import { computeCollageLayout } from './grid.js';

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 9;

// Preserving the whole photo is the default everywhere in this app — see
// DESIGN.md. A photo only gets cropped when its fit mode is explicitly set
// to 'cover', which only happens via a deliberate choice in the editor.
export const DEFAULT_FIT_MODE: FitMode = 'contain-blur';

export interface ProcessCollageInput {
  buffers: Buffer[];
  target: { width: number; height: number };
  /** Parallel to `buffers`. Missing entries default to DEFAULT_FIT_MODE. */
  fitModes?: Array<FitMode | undefined>;
  /** Parallel to `buffers`. */
  orientations?: Array<Orientation | undefined>;
  /** Parallel to `buffers`; only honored where the matching fitMode is 'cover'. */
  crops?: Array<CropSpec | undefined>;
  /** Parallel to `buffers`; only relevant where the matching fitMode is 'contain-pad'. */
  padColors?: Array<string | undefined>;
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

  // Every photo is fit into its own cell against that cell's exact size, so
  // a photo smaller than its cell still trips the shared upscale guard,
  // per-cell, with the offending photo named in the error.
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < buffers.length; i++) {
    const cell = layout.cells[i];
    const cellTarget = { width: cell.width, height: cell.height };
    const fitMode = input.fitModes?.[i] ?? DEFAULT_FIT_MODE;
    // A crop only means something in Fill (Cover) mode — Fit (contain)
    // modes always show the whole photo, so a leftover crop from before a
    // photo was switched back to Fit is never honored here.
    const crop = fitMode === 'cover' ? input.crops?.[i] : undefined;
    const padColor = input.padColors?.[i];

    const autoOriented = await orientImage(buffers[i]);
    const oriented = await applyUserOrientation(autoOriented, input.orientations?.[i]);
    const source = { width: oriented.width, height: oriented.height };

    const cellPipeline = await withPhotoContext(
      i,
      crop
        ? applyManualCrop({ buffer: oriented.buffer, source, target: cellTarget, crop, allowUpscale })
        : applyFit({ buffer: oriented.buffer, source, target: cellTarget, mode: fitMode, allowUpscale, padColor }),
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
