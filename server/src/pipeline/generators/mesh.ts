import sharp from 'sharp';
import type { Generator } from './types.js';
import { seededPalette, parseHsl } from '../shared/color.js';
import { makeRng, range } from '../shared/random.js';

// Classic mesh-gradient trick: scatter a handful of colors on a tiny canvas,
// then blur+upscale it. The blur is what turns discrete points into the soft
// blended fields a mesh gradient is known for.
export const generateMesh: Generator = async ({ seed, width, height }) => {
  const rng = makeRng(seed);
  const colors = seededPalette(seed, 5);
  const cellW = 6;
  const cellH = 4;
  const raw = Buffer.alloc(cellW * cellH * 3);

  for (let i = 0; i < cellW * cellH; i++) {
    const color = colors[Math.floor(range(rng, 0, colors.length))];
    const [r, g, b] = parseHsl(color);
    raw[i * 3] = r;
    raw[i * 3 + 1] = g;
    raw[i * 3 + 2] = b;
  }

  return sharp(raw, { raw: { width: cellW, height: cellH, channels: 3 } })
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.cubic })
    .blur(Math.max(width, height) / 12)
    .png()
    .toBuffer();
};
