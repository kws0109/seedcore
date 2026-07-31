import { describe, expect, it } from 'vitest';
import { step } from '../src/game/sim';
import { createEnemy, createState, idleInput } from '../src/game/state';
import { T } from '../src/game/tuning';
import ENEMIES from '../src/data/enemies.json';

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
    expect(front.hp).toBe(ENEMIES.ghoul.hp - T.attackDamage);
    expect(back.hp).toBe(ENEMIES.ghoul.hp);
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

describe('combat: 궁수·투사체', () => {
  it('사거리 내 궁수는 쿨다운마다 투사체를 쏜다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 250, y: 0 }, 'archer'));
    step(s, idleInput());
    expect(s.projectiles).toHaveLength(1);
    step(s, idleInput());
    expect(s.projectiles).toHaveLength(1); // 쿨다운 중 재발사 없음
  });

  it('투사체는 플레이어에게 1회 피해 후 소멸한다', () => {
    const s = createState();
    s.projectiles.push({
      id: 1,
      pos: { x: 30, y: 0 },
      vel: { x: -320, y: 0 },
      radius: 5,
      damage: ENEMIES.archer.projectileDamage,
      ttl: 3,
    });
    let hits = 0;
    for (let i = 0; i < 20; i++) {
      step(s, idleInput());
      if (s.events.some((ev) => ev.type === 'playerHit')) hits++;
    }
    expect(hits).toBe(1);
    expect(s.player.hp).toBe(T.playerMaxHp - ENEMIES.archer.projectileDamage);
    expect(s.projectiles).toHaveLength(0);
  });

  it('대시 중에는 투사체 피해를 받지 않는다', () => {
    const s = createState();
    s.projectiles.push({
      id: 1,
      pos: { x: 20, y: 0 },
      vel: { x: -320, y: 0 },
      radius: 5,
      damage: 14,
      ttl: 0.05,
    });
    step(s, { ...idleInput(), dash: true, moveX: 1 });
    expect(s.player.hp).toBe(T.playerMaxHp);
  });

  it('브루트는 넉백 저항이 있다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 50, y: 0 }, 'ghoul'));
    s.enemies.push(createEnemy(2, { x: 50, y: 0 }, 'brute'));
    step(s, { ...idleInput(), attack: true, aimX: 100, aimY: 0 });
    const ghoul = s.enemies.find((e) => e.kind === 'ghoul')!;
    const brute = s.enemies.find((e) => e.kind === 'brute')!;
    expect(Math.abs(brute.vel.x)).toBeLessThan(Math.abs(ghoul.vel.x));
  });
});

describe('combat: 접촉 피해', () => {
  it('피격 직후 무적 시간 동안 연속 피해가 없다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 0, y: 0 }));
    step(s, idleInput());
    expect(s.player.hp).toBe(T.playerMaxHp - ENEMIES.ghoul.touchDamage);
    step(s, idleInput());
    expect(s.player.hp).toBe(T.playerMaxHp - ENEMIES.ghoul.touchDamage);
  });
});
