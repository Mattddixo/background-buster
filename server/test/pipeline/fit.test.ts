import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { applyFit } from '../../src/pipeline/shared/fit.js';

async function makeTestImage(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
}

describe('applyFit', () => {
  it('covers the target exactly', async () => {
    const buffer = await makeTestImage(400, 300);
    const pipeline = await applyFit({
      buffer,
      source: { width: 400, height: 300 },
      target: { width: 200, height: 200 },
      mode: 'cover',
      allowUpscale: false,
    });
    const metadata = await pipeline.png().toBuffer().then((b) => sharp(b).metadata());
    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(200);
  });

  it('refuses to upscale by default', async () => {
    const buffer = await makeTestImage(100, 100);
    await expect(
      applyFit({
        buffer,
        source: { width: 100, height: 100 },
        target: { width: 400, height: 400 },
        mode: 'cover',
        allowUpscale: false,
      }),
    ).rejects.toThrow(/larger than the source/);
  });

  it('allows upscaling when explicitly requested', async () => {
    const buffer = await makeTestImage(100, 100);
    const pipeline = await applyFit({
      buffer,
      source: { width: 100, height: 100 },
      target: { width: 400, height: 400 },
      mode: 'cover',
      allowUpscale: true,
    });
    const metadata = await pipeline.png().toBuffer().then((b) => sharp(b).metadata());
    expect(metadata.width).toBe(400);
  });

  it('rejects non-cover fit modes for animated input', async () => {
    const buffer = await makeTestImage(100, 100);
    await expect(
      applyFit({
        buffer,
        source: { width: 100, height: 100 },
        target: { width: 50, height: 50 },
        mode: 'contain-pad',
        allowUpscale: false,
        animated: true,
      }),
    ).rejects.toThrow(/Cover fit mode/);
  });

  it('pads contain mode with the requested color', async () => {
    const buffer = await makeTestImage(300, 600);
    const pipeline = await applyFit({
      buffer,
      source: { width: 300, height: 600 },
      target: { width: 200, height: 200 },
      mode: 'contain-pad',
      allowUpscale: false,
      padColor: '#0000ff',
    });
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(200);
    // top-left corner should be the pad color, not the source image
    expect(data[0]).toBeLessThan(50);
    expect(data[2]).toBeGreaterThan(200);
  });
});
