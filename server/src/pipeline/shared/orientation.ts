import sharp from 'sharp';
import type { OrientedImage } from './orient.js';

// User-chosen rotation/flip — separate from CropSpec on purpose. Orientation
// applies no matter which fit mode a photo uses (Fit/Contain photos can be
// sideways too); a crop rectangle only means something in Fill/Cover mode.
export interface Orientation {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

const IDENTITY: Orientation = { rotation: 0, flipH: false, flipV: false };

export function isIdentityOrientation(orientation: Orientation): boolean {
  return orientation.rotation === 0 && !orientation.flipH && !orientation.flipV;
}

// Applied after orientImage's EXIF auto-orient, so this is purely the
// user's deliberate choice on top of whatever the camera already recorded.
// Verified against sharp directly (not assumed): rotate(90) is clockwise,
// flop() mirrors horizontally, flip() mirrors vertically.
export async function applyUserOrientation(
  image: OrientedImage,
  orientation: Orientation = IDENTITY,
): Promise<OrientedImage> {
  if (isIdentityOrientation(orientation)) return image;

  let pipeline = sharp(image.buffer);
  if (orientation.rotation !== 0) pipeline = pipeline.rotate(orientation.rotation);
  if (orientation.flipH) pipeline = pipeline.flop();
  if (orientation.flipV) pipeline = pipeline.flip();

  const swapped = orientation.rotation === 90 || orientation.rotation === 270;
  const buffer = await pipeline.toBuffer();
  return {
    buffer,
    width: swapped ? image.height : image.width,
    height: swapped ? image.width : image.height,
    hasAlpha: image.hasAlpha,
  };
}
