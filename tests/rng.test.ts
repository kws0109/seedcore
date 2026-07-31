import { describe, expect, it } from 'vitest';
import { deriveSeed, mulberry32 } from '../src/engine/rng';

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

describe('deriveSeed', () => {
  it('같은 시드·같은 라벨은 같은 서브 시드를 낸다', () => {
    expect(deriveSeed(777, 'layout')).toBe(deriveSeed(777, 'layout'));
  });

  it('라벨이 다르면 서브 시드가 다르다', () => {
    expect(deriveSeed(777, 'layout')).not.toBe(deriveSeed(777, 'loot'));
    expect(deriveSeed(777, 'layout')).not.toBe(deriveSeed(777, 'spawn'));
    expect(deriveSeed(777, 'spawn')).not.toBe(deriveSeed(777, 'loot'));
  });

  it('시드가 다르면 서브 시드가 다르다', () => {
    expect(deriveSeed(1, 'layout')).not.toBe(deriveSeed(2, 'layout'));
  });

  it('32비트 부호 없는 정수를 반환한다', () => {
    const v = deriveSeed(123456789, 'biome');
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
  });
});
