import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/engine/rng';
import { step } from '../src/game/sim';
import {
  createEnemy,
  createState,
  idleInput,
  type GameState,
  type InputFrame,
} from '../src/game/state';

// 시드 RNG로 입력 스크립트를 만들어 300틱을 돌린다.
function makeWorld(seed: number): { state: GameState; script: InputFrame[] } {
  const rng = mulberry32(seed);
  const state = createState();
  for (let i = 0; i < 5; i++) {
    state.enemies.push(createEnemy(i, { x: (rng() - 0.5) * 600, y: (rng() - 0.5) * 600 }));
  }
  const script: InputFrame[] = Array.from({ length: 300 }, () => ({
    ...idleInput(),
    moveX: Math.round(rng() * 2 - 1),
    moveY: Math.round(rng() * 2 - 1),
    aimX: (rng() - 0.5) * 400,
    aimY: (rng() - 0.5) * 400,
    attack: rng() < 0.15,
    dash: rng() < 0.05,
  }));
  return { state, script };
}

describe('결정론', () => {
  it('같은 시드·같은 입력이면 300틱 후 상태가 완전히 같다', () => {
    const a = makeWorld(777);
    const b = makeWorld(777);
    for (let i = 0; i < 300; i++) {
      step(a.state, a.script[i]);
      step(b.state, b.script[i]);
    }
    expect(JSON.stringify(a.state)).toEqual(JSON.stringify(b.state));
  });

  it('다른 시드면 상태가 달라진다', () => {
    const a = makeWorld(1);
    const b = makeWorld(2);
    for (let i = 0; i < 300; i++) {
      step(a.state, a.script[i]);
      step(b.state, b.script[i]);
    }
    expect(JSON.stringify(a.state)).not.toEqual(JSON.stringify(b.state));
  });
});
