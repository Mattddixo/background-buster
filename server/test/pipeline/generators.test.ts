import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { generators } from '../../src/pipeline/generators/index.js';

describe('generators', () => {
  for (const [style, generate] of Object.entries(generators)) {
    it(`${style} produces an image at the requested size`, async () => {
      const buffer = await generate({ seed: 'test-seed', width: 64, height: 48 });
      const metadata = await sharp(buffer).metadata();
      expect(metadata.width).toBe(64);
      expect(metadata.height).toBe(48);
    });

    it(`${style} is deterministic for the same seed`, async () => {
      const a = await generate({ seed: 'repeatable', width: 32, height: 32 });
      const b = await generate({ seed: 'repeatable', width: 32, height: 32 });
      expect(Buffer.compare(a, b)).toBe(0);
    });
  }
});
