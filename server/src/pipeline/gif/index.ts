import sharp from 'sharp';
import type { FitMode } from '../shared/types.js';
import { applyFit } from '../shared/fit.js';
import { PipelineError } from '../errors.js';

export interface ProcessGifInput {
  buffer: Buffer;
  target: { width: number; height: number };
  mode: FitMode;
  allowUpscale?: boolean;
  padColor?: string;
  maxFrames?: number;
}

export interface ProcessResult {
  buffer: Buffer;
  contentType: string;
}

export async function processGif(input: ProcessGifInput): Promise<ProcessResult> {
  const metadata = await sharp(input.buffer, { animated: true }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new PipelineError('Could not read GIF dimensions.', 422, 'UNREADABLE_IMAGE');
  }

  const frames = metadata.pages ?? 1;
  const maxFrames = input.maxFrames ?? 300;
  if (frames > maxFrames) {
    throw new PipelineError(
      `This GIF has ${frames} frames, which exceeds the ${maxFrames}-frame processing limit.`,
      413,
      'TOO_MANY_FRAMES',
    );
  }

  const pageHeight = metadata.pageHeight ?? metadata.height;
  const pipeline = await applyFit({
    buffer: input.buffer,
    source: { width: metadata.width, height: pageHeight },
    target: input.target,
    mode: input.mode,
    allowUpscale: input.allowUpscale ?? false,
    padColor: input.padColor,
    animated: true,
  });

  const buffer = await pipeline.gif({ loop: metadata.loop ?? 0 }).toBuffer();
  return { buffer, contentType: 'image/gif' };
}
