import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { applyManualCrop } from '../../src/pipeline/shared/manualCrop.js';

// 4x2 source: left half red, right half blue. Small and exact so every
// pixel can be checked by hand rather than trusting the math on faith.
async function makeSplitImage(): Promise<Buffer> {
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
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

async function pixelsOf(pipeline: sharp.Sharp): Promise<{ data: Buffer; info: sharp.OutputInfo }> {
  return pipeline.raw().toBuffer({ resolveWithObject: true });
}

describe('applyManualCrop', () => {
  it('crops the requested normalized rectangle at the exact target size', async () => {
    const buffer = await makeSplitImage();
    const pipeline = await applyManualCrop({
      buffer,
      source: { width: 4, height: 2 },
      target: { width: 2, height: 2 },
      crop: { x: 0, y: 0, width: 0.5, height: 1 },
      allowUpscale: false,
    });
    const { data, info } = await pixelsOf(pipeline);
    expect(info.width).toBe(2);
    expect(info.height).toBe(2);
    // Left half only was cropped: every pixel should be red.
    for (let i = 0; i < info.width * info.height; i++) {
      expect(data[i * info.channels]).toBeGreaterThan(200);
      expect(data[i * info.channels + 2]).toBeLessThan(50);
    }
  });

  it('crops the right half when asked', async () => {
    const buffer = await makeSplitImage();
    const pipeline = await applyManualCrop({
      buffer,
      source: { width: 4, height: 2 },
      target: { width: 2, height: 2 },
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
      allowUpscale: false,
    });
    const { data, info } = await pixelsOf(pipeline);
    for (let i = 0; i < info.width * info.height; i++) {
      expect(data[i * info.channels + 2]).toBeGreaterThan(200);
    }
  });

  it('refuses to upscale a crop smaller than the target by default', async () => {
    const buffer = await makeSplitImage();
    await expect(
      applyManualCrop({
        buffer,
        source: { width: 4, height: 2 },
        target: { width: 400, height: 400 },
        crop: { x: 0, y: 0, width: 0.1, height: 0.1 },
        allowUpscale: false,
      }),
    ).rejects.toThrow(/larger than the source/);
  });
});
