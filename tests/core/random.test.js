import { describe, it, expect } from 'vitest';
import { seededRandom, shuffle, defaultRandom } from '../../js/core/random.js';

describe('seededRandom', () => {
  it('is deterministic for a fixed seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('produces values in [0, 1)', () => {
    const rand = seededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds diverge', () => {
    const a = seededRandom(1);
    const b = seededRandom(2);
    const seqA = Array.from({ length: 10 }, a);
    const seqB = Array.from({ length: 10 }, b);
    expect(seqA).not.toEqual(seqB);
  });
});

describe('shuffle', () => {
  it('returns a permutation of the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const out = shuffle(input, seededRandom(3));
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('does not mutate the input', () => {
    const input = [3, 1, 2];
    shuffle(input, seededRandom(1));
    expect(input).toEqual([3, 1, 2]);
  });

  it('is deterministic under a seeded generator', () => {
    const a = shuffle([1, 2, 3, 4, 5], seededRandom(9));
    const b = shuffle([1, 2, 3, 4, 5], seededRandom(9));
    expect(a).toEqual(b);
  });

  it('defaults to Math.random', () => {
    expect(defaultRandom).toBe(Math.random);
    const out = shuffle([1, 2, 3]);
    expect([...out].sort()).toEqual([1, 2, 3]);
  });
});
