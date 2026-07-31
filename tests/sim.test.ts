import { describe, expect, it } from 'vitest';
import { angleDiff, circlesOverlap, norm } from '../src/engine/math';
import { createState, idleInput } from '../src/game/state';
import { step } from '../src/game/sim';
import { T } from '../src/game/tuning';

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

describe('sim: 이동', () => {
  it('오른쪽 입력 1초면 playerSpeed만큼 이동한다', () => {
    const s = createState();
    const inp = { ...idleInput(), moveX: 1 };
    for (let i = 0; i < 60; i++) step(s, inp);
    expect(s.player.pos.x).toBeCloseTo(T.playerSpeed, 1);
    expect(s.player.pos.y).toBeCloseTo(0, 5);
  });

  it('facing은 에임 방향을 향한다', () => {
    const s = createState();
    step(s, { ...idleInput(), aimX: 0, aimY: 100 });
    expect(s.player.facing).toBeCloseTo(Math.PI / 2, 5);
  });

  it('tick이 증가한다', () => {
    const s = createState();
    step(s, idleInput());
    expect(s.tick).toBe(1);
  });
});
