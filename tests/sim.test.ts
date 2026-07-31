import { describe, expect, it } from 'vitest';
import { angleDiff, circlesOverlap, norm } from '../src/engine/math';

describe('math', () => {
  it('norm은 단위 벡터를 만들고 영벡터는 그대로 둔다', () => {
    expect(norm({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(norm({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('circlesOverlap은 반지름 합 기준으로 판정한다', () => {
    expect(circlesOverlap({ x: 0, y: 0 }, 5, { x: 9, y: 0 }, 5)).toBe(true);
    expect(circlesOverlap({ x: 0, y: 0 }, 5, { x: 11, y: 0 }, 5)).toBe(false);
  });

  it('angleDiff는 2π 랩어라운드를 처리한다', () => {
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 5);
  });
});
