import type sharp from 'sharp';
import type { OutputFormat } from './types.js';

export function pickFormat(hasAlpha: boolean, isAnimated: boolean, requested?: OutputFormat): OutputFormat {
  if (requested) return requested;
  if (isAnimated) return 'gif';
  if (hasAlpha) return 'png';
  return 'webp';
}

export function contentTypeFor(format: OutputFormat): string {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
  }
}

export function applyEncoding(pipeline: sharp.Sharp, format: OutputFormat, quality = 92): sharp.Sharp {
  switch (format) {
    case 'png':
      return pipeline.png({ compressionLevel: 9 });
    case 'jpeg':
      return pipeline.jpeg({ quality, mozjpeg: true });
    case 'webp':
      return pipeline.webp({ quality });
    case 'gif':
      return pipeline.gif();
  }
}
