import sharp from 'sharp';
import { makeRng, range } from './random.js';

export function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function parseHsl(value: string): [number, number, number] {
  const match = value.match(/hsl\((\d+) (\d+)% (\d+)%\)/);
  if (!match) return [128, 128, 128];
  return hslToRgb(Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100);
}

export function seededPalette(seed: string, count: number): string[] {
  const rng = makeRng(seed);
  const baseHue = range(rng, 0, 360);
  const spread = range(rng, 20, 90);
  return Array.from({ length: count }, (_, i) => {
    const hue = (baseHue + (i * spread) / Math.max(count - 1, 1)) % 360;
    return hsl(hue, range(rng, 55, 85), range(rng, 35, 65));
  });
}

export async function dominantEdgeColor(buffer: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data } = await sharp(buffer).resize(1, 1, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}
