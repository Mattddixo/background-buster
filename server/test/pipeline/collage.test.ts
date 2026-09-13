import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { chooseGrid, distribute, defaultGutter } from '../../src/pipeline/collage/grid.js';
import { processCollage } from '../../src/pipeline/collage/index.js';

async function makeTestImage(width: number, height: number, background: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();
}

describe('chooseGrid', () => {
  it('picks a square grid for a square count and aspect', () => {
    expect(chooseGrid(4, 1)).toEqual({ rows: 2, cols: 2 });
  });

  it('prefers more columns for a wide target', () => {
    const shape = chooseGrid(6, 3);
    expect(shape.cols).toBeGreaterThan(shape.rows);
  });

  it('never wastes more cells than necessary', () => {
    // 5 photos: 1x5/5x1 waste 0 cells but have an extreme aspect; a roughly
    // square target should still land on a low-waste shape (max 1 empty cell).
    const { rows, cols } = chooseGrid(5, 1);
    expect(rows * cols - 5).toBeLessThanOrEqual(1);
  });
});

describe('distribute', () => {
  it('sums back to exactly the available space', () => {
    const { sizes } = distribute(1001, 3);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(sizes).toHaveLength(3);
  });

  it('offsets are cumulative and start at zero', () => {
    const { offsets, sizes } = distribute(100, 4);
    expect(offsets[0]).toBe(0);
    expect(offsets[3]).toBe(sizes[0] + sizes[1] + sizes[2]);
  });
});

describe('defaultGutter', () => {
  it('is clamped to a sane range', () => {
    expect(defaultGutter({ width: 100, height: 100 })).toBeGreaterThanOrEqual(2);
    expect(defaultGutter({ width: 8000, height: 8000 })).toBeLessThanOrEqual(24);
  });
});

describe('processCollage', () => {
  it('rejects fewer than two photos', async () => {
    const one = await makeTestImage(200, 200, 'red');
    await expect(
      processCollage({ buffers: [one], target: { width: 300, height: 300 } }),
    ).rejects.toThrow(/between 2 and 9/);
  });

  it('rejects more than the max photos', async () => {
    const photo = await makeTestImage(200, 200, 'red');
    const buffers = Array.from({ length: 10 }, () => photo);
    await expect(
      processCollage({ buffers, target: { width: 300, height: 300 } }),
    ).rejects.toThrow(/between 2 and 9/);
  });

  it('composes N photos into a canvas at the exact target size', async () => {
    const buffers = await Promise.all([
      makeTestImage(400, 400, 'red'),
      makeTestImage(400, 400, 'green'),
      makeTestImage(400, 400, 'blue'),
      makeTestImage(400, 400, 'yellow'),
    ]);
    const result = await processCollage({ buffers, target: { width: 320, height: 240 } });
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(240);
  });

  it('names the offending photo when a per-cell upscale is rejected', async () => {
    const buffers = [await makeTestImage(2000, 2000, 'red'), await makeTestImage(10, 10, 'blue')];
    await expect(
      processCollage({ buffers, target: { width: 2000, height: 1000 } }),
    ).rejects.toThrow(/Photo 2:/);
  });
});
