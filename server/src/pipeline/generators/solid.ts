import sharp from 'sharp';
import type { Generator } from './types.js';
import { seededPalette } from '../shared/color.js';

export const generateSolid: Generator = async ({ seed, width, height }) => {
  const [color] = seededPalette(seed, 1);
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
};
