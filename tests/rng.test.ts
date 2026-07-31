import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/engine/rng';

describe('mulberry32', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('다른 시드는 다른 수열을 낸다', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toEqual(b());
  });

  it('값은 항상 [0, 1) 범위다', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
