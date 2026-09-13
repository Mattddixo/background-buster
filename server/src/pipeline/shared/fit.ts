import sharp from 'sharp';
import type { Dimensions, FitMode } from './types.js';
import { PipelineError, UpscaleNotAllowedError } from '../errors.js';
import { dominantEdgeColor } from './color.js';

export interface ApplyFitInput {
  buffer: Buffer;
  source: Dimensions;
  target: Dimensions;
  mode: FitMode;
  allowUpscale: boolean;
  padColor?: string;
  animated?: boolean;
}

function wouldUpscale(source: Dimensions, target: Dimensions): boolean {
  return target.width > source.width || target.height > source.height;
}

export async function applyFit(input: ApplyFitInput): Promise<sharp.Sharp> {
  const { buffer, source, target, mode, allowUpscale, padColor, animated = false } = input;

  if (!allowUpscale && wouldUpscale(source, target)) {
    throw new UpscaleNotAllowedError(source, target);
  }

  if (animated && mode !== 'cover') {
    // Per-frame blur/pad compositing on an animated source isn't implemented —
    // failing clearly here beats silently shipping a broken or misaligned GIF.
    throw new PipelineError(
      'Only the Cover fit mode is currently supported for animated GIFs.',
      422,
      'ANIMATED_CONTAIN_UNSUPPORTED',
    );
  }

  const source$ = () => sharp(buffer, { animated });

  if (mode === 'cover') {
    return source$().resize(target.width, target.height, {
      fit: 'cover',
      position: animated ? 'centre' : sharp.strategy.attention,
      kernel: sharp.kernel.lanczos3,
    });
  }

  const foreground = await source$()
    .resize(target.width, target.height, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .toBuffer();

  if (mode === 'contain-blur') {
    const backdrop = await source$()
      .resize(target.width, target.height, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
      .blur(Math.max(target.width, target.height) / 40)
      .toBuffer();
    return sharp(backdrop).composite([{ input: foreground, gravity: 'centre' }]);
  }

  const edgeColor = await dominantEdgeColor(buffer);
  const background = padColor ?? `rgb(${edgeColor.r},${edgeColor.g},${edgeColor.b})`;
  return sharp({
    create: { width: target.width, height: target.height, channels: 4, background },
  }).composite([{ input: foreground, gravity: 'centre' }]);
}
