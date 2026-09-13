import sharp from 'sharp';
import type { Generator } from './types.js';
import { hslToRgb } from '../shared/color.js';
import { makeRng, range } from '../shared/random.js';

// Demoscene-style plasma: sum a few sine fields per pixel and map the result
// to hue. Computed directly at the target resolution, so there's no
// resize/blur step to introduce banding.
export const generatePlasma: Generator = async ({ seed, width, height }) => {
  const rng = makeRng(seed);
  const scale = range(rng, 60, 160);
  const hueOffset = range(rng, 0, 360);
  const phase1 = range(rng, 0, Math.PI * 2);
  const phase2 = range(rng, 0, Math.PI * 2);

  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v =
        Math.sin(x / scale + phase1) +
        Math.sin(y / scale + phase2) +
        Math.sin((x + y) / scale) +
        Math.sin(Math.sqrt(x * x + y * y) / scale);
      const hue = (hueOffset + ((v + 4) / 8) * 360) % 360;
      const [r, g, b] = hslToRgb(hue, 0.65, 0.5);
      const idx = (y * width + x) * 3;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
    }
  }

  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
};
