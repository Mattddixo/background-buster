import { describe, expect, it } from 'vitest';
import { matchPresetsByAspect, findPreset } from '../../src/presets/index.js';

describe('matchPresetsByAspect', () => {
  it('ranks the closest aspect ratio first', () => {
    const [top] = matchPresetsByAspect(3440, 1440);
    expect(top.id).toBe('desktop-ultrawide');
  });
});

describe('findPreset', () => {
  it('returns undefined for an unknown id', () => {
    expect(findPreset('does-not-exist')).toBeUndefined();
  });
});
