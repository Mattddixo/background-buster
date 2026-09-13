import sharp from 'sharp';
import type { Generator } from './types.js';
import { seededPalette } from '../shared/color.js';
import { makeRng, pick } from '../shared/random.js';

function svgFor(seed: string, width: number, height: number): string {
  const rng = makeRng(seed);
  const colors = seededPalette(seed, 3);
  const kind = pick(rng, ['linear', 'radial'] as const);
  const angle = Math.floor(rng() * 360);
  const stops = colors
    .map((c, i) => `<stop offset="${Math.round((i / (colors.length - 1)) * 100)}%" stop-color="${c}" />`)
    .join('');

  const def =
    kind === 'linear'
      ? `<linearGradient id="g" gradientTransform="rotate(${angle} 0.5 0.5)">${stops}</linearGradient>`
      : `<radialGradient id="g" cx="${(0.3 + rng() * 0.4).toFixed(2)}" cy="${(0.3 + rng() * 0.4).toFixed(2)}" r="0.8">${stops}</radialGradient>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>${def}</defs>
    <rect width="100%" height="100%" fill="url(#g)" />
  </svg>`;
}

export const generateGradient: Generator = async ({ seed, width, height }) => {
  const svg = svgFor(seed, width, height);
  // The extra resize guarantees exact pixel dimensions regardless of any
  // rounding in the SVG rasterization step.
  return sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();
};
