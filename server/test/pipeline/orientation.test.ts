import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { applyUserOrientation, isIdentityOrientation } from '../../src/pipeline/shared/orientation.js';

// 4x2 source: left half red, right half blue.
async function makeSplitImage(): Promise<{ buffer: Buffer; width: number; height: number; hasAlpha: boolean }> {
  const w = 4;
  const h = 2;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 3;
      const isLeft = x < w / 2;
      raw[idx] = isLeft ? 255 : 0;
      raw[idx + 1] = 0;
      raw[idx + 2] = isLeft ? 0 : 255;
    }
  }
  const buffer = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
  return { buffer, width: w, height: h, hasAlpha: false };
}

describe('isIdentityOrientation', () => {
  it('is true only for no rotation and no flip', () => {
    expect(isIdentityOrientation({ rotation: 0, flipH: false, flipV: false })).toBe(true);
    expect(isIdentityOrientation({ rotation: 90, flipH: false, flipV: false })).toBe(false);
    expect(isIdentityOrientation({ rotation: 0, flipH: true, flipV: false })).toBe(false);
  });
});

describe('applyUserOrientation', () => {
  it('is a no-op fast path for identity orientation', async () => {
    const image = await makeSplitImage();
    const result = await applyUserOrientation(image, { rotation: 0, flipH: false, flipV: false });
    expect(result).toBe(image); // same object, not just equal bytes
  });

  it('defaults to identity when no orientation is given', async () => {
    const image = await makeSplitImage();
    const result = await applyUserOrientation(image);
    expect(result).toBe(image);
  });

  it('rotation is clockwise: the left edge becomes the top edge, and swaps dimensions', async () => {
    const image = await makeSplitImage();
    const result = await applyUserOrientation(image, { rotation: 90, flipH: false, flipV: false });
    expect(result.width).toBe(2);
    expect(result.height).toBe(4);

    const { data, info } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
    const topIdx = 0;
    const bottomIdx = (info.height - 1) * info.width * info.channels;
    expect(data[topIdx]).toBeGreaterThan(200); // red at top (was left)
    expect(data[bottomIdx + 2]).toBeGreaterThan(200); // blue at bottom (was right)
  });

  it('flipH mirrors left-right without changing dimensions', async () => {
    const image = await makeSplitImage();
    const result = await applyUserOrientation(image, { rotation: 0, flipH: true, flipV: false });
    expect(result.width).toBe(4);
    expect(result.height).toBe(2);

    const { data, info } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
    expect(data[0 + 2]).toBeGreaterThan(200); // blue now on the left
    expect(data[(info.width - 1) * info.channels]).toBeGreaterThan(200); // red now on the right
  });
});
