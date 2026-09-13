import sharp from 'sharp';
import { applyFit } from '../shared/fit.js';
import { orientImage } from '../shared/orient.js';
import { pickFormat, applyEncoding, contentTypeFor } from '../shared/format.js';
import type { OutputFormat } from '../shared/types.js';
import { PipelineError } from '../errors.js';
import { chooseGrid, distribute, defaultGutter } from './grid.js';

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 9;

export interface ProcessCollageInput {
  buffers: Buffer[];
  target: { width: number; height: number };
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

export async function processCollage(input: ProcessCollageInput): Promise<ProcessResult> {
  const { buffers, target } = input;
  if (buffers.length < MIN_PHOTOS || buffers.length > MAX_PHOTOS) {
    throw new PipelineError(
      `A collage needs between ${MIN_PHOTOS} and ${MAX_PHOTOS} photos (got ${buffers.length}).`,
      400,
      'INVALID_PHOTO_COUNT',
    );
  }

  const { rows, cols } = chooseGrid(buffers.length, target.width / target.height);
  const gutter = input.gutter ?? defaultGutter(target);
  const gutterColor = input.gutterColor ?? '#121212';

  const colLayout = distribute(target.width - gutter * (cols - 1), cols);
  const rowLayout = distribute(target.height - gutter * (rows - 1), rows);

  // Every photo is fit into its own cell with the same saliency-aware Cover
  // crop used elsewhere, each against its own cell size — a photo smaller
  // than its cell still trips the shared upscale guard, per-cell.
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < buffers.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cellWidth = colLayout.sizes[col];
    const cellHeight = rowLayout.sizes[row];
    const left = colLayout.offsets[col] + col * gutter;
    const top = rowLayout.offsets[row] + row * gutter;

    const oriented = await orientImage(buffers[i]);
    const cellPipeline = await applyFit({
      buffer: oriented.buffer,
      source: { width: oriented.width, height: oriented.height },
      target: { width: cellWidth, height: cellHeight },
      mode: 'cover',
      allowUpscale: input.allowUpscale ?? false,
    }).catch((err: unknown) => {
      if (err instanceof PipelineError) {
        throw new PipelineError(`Photo ${i + 1}: ${err.message}`, err.statusCode, err.code);
      }
      throw err;
    });
    const cellBuffer = await cellPipeline.png().toBuffer();
    composites.push({ input: cellBuffer, left, top });
  }

  const canvas = sharp({
    create: { width: target.width, height: target.height, channels: 4, background: gutterColor },
  }).composite(composites);

  const format = pickFormat(true, false, input.format);
  const buffer = await applyEncoding(canvas, format, input.quality).toBuffer();
  return { buffer, contentType: contentTypeFor(format) };
}
