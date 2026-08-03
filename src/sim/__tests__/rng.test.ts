import { describe, expect, it } from 'vitest';
import { nextRng, rollInt, seedRng } from '../rng';

describe('seedRng', () => {
  it('never yields 0', () => {
    expect(seedRng(0)).not.toBe(0);
    for (let seed = -1000; seed < 1000; seed++) {
      expect(seedRng(seed)).not.toBe(0);
    }
  });

  it('is deterministic per seed', () => {
    expect(seedRng(42)).toBe(seedRng(42));
  });
});

describe('nextRng', () => {
  it('produces the same sequence for the same seed', () => {
    let a = seedRng(7);
    let b = seedRng(7);
    for (let i = 0; i < 50; i++) {
      const [va, na] = nextRng(a);
      const [vb, nb] = nextRng(b);
      expect(va).toBe(vb);
      expect(na).toBe(nb);
      a = na;
      b = nb;
    }
  });

  it('yields values in [0, 1)', () => {
    let s = seedRng(123);
    for (let i = 0; i < 1000; i++) {
      const [v, next] = nextRng(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      s = next;
    }
  });

  it('never produces a 0 state', () => {
    let s = seedRng(1);
    for (let i = 0; i < 10000; i++) {
      const [, next] = nextRng(s);
      expect(next).not.toBe(0);
      s = next;
    }
  });
});

describe('rollInt', () => {
  it('covers exactly [min, max] inclusive over many draws', () => {
    let s = seedRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const [n, next] = rollInt(s, -1, 1);
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
      seen.add(n);
      s = next;
    }
    expect(seen).toEqual(new Set([-1, 0, 1]));
  });

  it('single-value range always returns that value', () => {
    let s = seedRng(5);
    for (let i = 0; i < 100; i++) {
      const [n, next] = rollInt(s, 4, 4);
      expect(n).toBe(4);
      s = next;
    }
  });
});
