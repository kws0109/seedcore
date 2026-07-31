import { describe, expect, it } from 'vitest';
import { step } from '../src/game/sim';
import { createEnemy, createState, idleInput } from '../src/game/state';
import { T } from '../src/game/tuning';

describe('combat: 대시', () => {
  it('대시 중에는 접촉 피해를 받지 않는다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 5, y: 0 })); // 즉시 겹침
    step(s, { ...idleInput(), dash: true, moveX: 1 });
    expect(s.player.hp).toBe(T.playerMaxHp);
  });

  it('쿨다운 중에는 대시가 다시 발동하지 않는다', () => {
    const s = createState();
    step(s, { ...idleInput(), dash: true, moveX: 1 });
    const t1 = s.player.dashCooldown;
    step(s, { ...idleInput(), dash: true, moveX: 1 });
    expect(s.player.dashCooldown).toBeLessThan(t1); // 재발동 없이 감소만
  });
});

describe('combat: 공격', () => {
  it('전방 부채꼴 안의 적만 피해를 입는다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 50, y: 0 })); // 전방
    s.enemies.push(createEnemy(2, { x: -50, y: 0 })); // 후방
    step(s, { ...idleInput(), attack: true, aimX: 100, aimY: 0 });
    const front = s.enemies.find((e) => e.id === 1)!;
    const back = s.enemies.find((e) => e.id === 2)!;
    expect(front.hp).toBe(T.enemyHp - T.attackDamage);
    expect(back.hp).toBe(T.enemyHp);
  });

  it('적 처치 시 목록에서 제거되고 enemyDied 이벤트가 남는다', () => {
    const s = createState();
    const e = createEnemy(1, { x: 50, y: 0 });
    e.hp = T.attackDamage; // 한 방
    s.enemies.push(e);
    step(s, { ...idleInput(), attack: true, aimX: 100, aimY: 0 });
    expect(s.enemies).toHaveLength(0);
    expect(s.events.some((ev) => ev.type === 'enemyDied')).toBe(true);
  });

  it('명중 시 히트스톱이 걸리고 다음 틱은 소모된다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 50, y: 0 }));
    step(s, { ...idleInput(), attack: true, aimX: 100, aimY: 0 });
    expect(s.hitstop).toBeGreaterThan(0);
    const tick = s.tick;
    step(s, idleInput());
    expect(s.tick).toBe(tick); // 히트스톱이 틱을 멈춘다
  });
});

describe('combat: 접촉 피해', () => {
  it('피격 직후 무적 시간 동안 연속 피해가 없다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 0, y: 0 }));
    step(s, idleInput());
    expect(s.player.hp).toBe(T.playerMaxHp - T.enemyTouchDamage);
    step(s, idleInput());
    expect(s.player.hp).toBe(T.playerMaxHp - T.enemyTouchDamage);
  });
});
