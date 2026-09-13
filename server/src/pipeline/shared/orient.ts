import sharp from 'sharp';
import { PipelineError } from '../errors.js';

export interface OrientedImage {
  buffer: Buffer;
  width: number;
  height: number;
  hasAlpha: boolean;
}

// Shared by the photo and collage pipelines: apply EXIF orientation, then
// drop the original metadata (no withMetadata() call) so EXIF/GPS never
// survives into anything this app produces.
export async function orientImage(buffer: Buffer): Promise<OrientedImage> {
  const oriented = sharp(buffer).rotate();
  const metadata = await oriented.metadata();
  if (!metadata.width || !metadata.height) {
    throw new PipelineError('Could not read image dimensions.', 422, 'UNREADABLE_IMAGE');
  }
  const orientedBuffer = await oriented.toBuffer();
  return {
    buffer: orientedBuffer,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: Boolean(metadata.hasAlpha),
  };
}
