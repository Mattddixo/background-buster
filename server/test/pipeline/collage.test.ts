import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { chooseGrid, distribute, defaultGutter } from '../../src/pipeline/collage/grid.js';
import { processCollage, DEFAULT_FIT_MODE } from '../../src/pipeline/collage/index.js';

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

  it('defaults every photo to Fit (contain), preserving the whole image, not Cover', () => {
    // Cropping is only ever an explicit per-photo choice — see DESIGN.md.
    expect(DEFAULT_FIT_MODE).toBe('contain-blur');
  });

  it('honors a per-photo fitMode override (contain-pad with an explicit color)', async () => {
    // contain-pad is deterministic (unlike Cover's attention-based crop),
    // so the pad color at a corner is a reliable signal the override took.
    const wide = await makeTestImage(800, 200, 'red'); // won't fill a square-ish cell
    const square = await makeTestImage(400, 400, 'green');
    const result = await processCollage({
      buffers: [wide, square],
      target: { width: 400, height: 200 }, // 2x1 grid -> two ~196x200 cells
      fitModes: ['contain-pad', undefined],
      padColors: ['#0000ff', undefined],
    });
    const { data } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
    // Top-left corner of the first cell should be the pad color (blue), not
    // the photo's own red, since the photo's aspect can't fill the cell.
    expect(data[2]).toBeGreaterThan(200); // blue channel
    expect(data[0]).toBeLessThan(50); // red channel
  });

  it('honors a per-photo Cover fit mode with an explicit crop rectangle', async () => {
    const buffers = [await makeTestImage(400, 400, 'red'), await makeTestImage(400, 400, 'green')];
    const result = await processCollage({
      buffers,
      target: { width: 400, height: 200 },
      fitModes: ['cover', undefined],
      crops: [{ x: 0, y: 0, width: 1, height: 1 }, undefined],
    });
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(200);
  });
});
