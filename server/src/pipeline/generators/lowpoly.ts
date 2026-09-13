import sharp from 'sharp';
import type { Generator } from './types.js';
import { seededPalette } from '../shared/color.js';
import { makeRng, range } from '../shared/random.js';

type Point = [number, number];

function triangle(a: Point, b: Point, c: Point, color: string): string {
  return `<polygon points="${a.join(',')} ${b.join(',')} ${c.join(',')}" fill="${color}" />`;
}

export const generateLowPoly: Generator = async ({ seed, width, height }) => {
  const rng = makeRng(seed);
  const colors = seededPalette(seed, 6);
  const cols = 10;
  const rows = Math.max(4, Math.round((cols * height) / width));
  const cellW = width / cols;
  const cellH = height / rows;

  const points: Point[][] = [];
  for (let y = 0; y <= rows; y++) {
    const row: Point[] = [];
    for (let x = 0; x <= cols; x++) {
      const jitterX = range(rng, -cellW * 0.4, cellW * 0.4);
      const jitterY = range(rng, -cellH * 0.4, cellH * 0.4);
      row.push([x * cellW + jitterX, y * cellH + jitterY]);
    }
    points.push(row);
  }

  const triangles: string[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = points[y][x];
      const b = points[y][x + 1];
      const c = points[y + 1][x];
      const d = points[y + 1][x + 1];
      triangles.push(triangle(a, b, c, colors[Math.floor(range(rng, 0, colors.length))]));
      triangles.push(triangle(b, d, c, colors[Math.floor(range(rng, 0, colors.length))]));
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${triangles.join('')}</svg>`;
  return sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();
};
