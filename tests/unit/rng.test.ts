import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, seedRng } from '../../src/rules/rng';

function sequence(seed: number, n: number): number[] {
  let s = seedRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [v, next] = nextFloat(s);
    out.push(v);
    s = next;
  }
  return out;
}

describe('seeded rng', () => {
  it('is deterministic for a seed', () => {
    expect(sequence(42, 100)).toEqual(sequence(42, 100));
  });

  it('differs between seeds', () => {
    expect(sequence(1, 10)).not.toEqual(sequence(2, 10));
  });

  it('stays in [0, 1)', () => {
    for (const v of sequence(7, 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt is inclusive and in range', () => {
    let s = seedRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const [v, next] = nextInt(s, 1, 6);
      seen.add(v);
      s = next;
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
