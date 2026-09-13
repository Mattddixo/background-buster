import { describe, expect, it } from 'vitest';
import { makeRng } from '../../src/pipeline/shared/random.js';

describe('makeRng', () => {
  it('is deterministic for the same seed', () => {
    const a = makeRng('hello');
    const b = makeRng('hello');
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    const a = makeRng('hello')();
    const b = makeRng('world')();
    expect(a).not.toEqual(b);
  });
});
