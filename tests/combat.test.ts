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

describe('combat: 드롭·클리어', () => {
  it('적 처치 시 사전 롤링된 드롭이 스폰된다', () => {
    const s = createState();
    const e = createEnemy(1, { x: 50, y: 0 });
    e.hp = T.attackDamage;
    e.drop = { gold: 12, item: { rarity: 'rare', stat: 'atk' } };
    s.enemies.push(e);
    step(s, { ...idleInput(), attack: true, aimX: 100, aimY: 0 });
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0].gold).toBe(12);
    expect(s.drops[0].item).toEqual({ rarity: 'rare', stat: 'atk' });
  });

  it('드롭에 접근하면 골드가 오르고 아이템 스탯이 즉시 적용된다', () => {
    const s = createState();
    s.drops.push({ id: 1, pos: { x: 10, y: 0 }, gold: 30, item: { rarity: 'common', stat: 'hp' } });
    const beforeMax = s.player.maxHp;
    step(s, idleInput());
    expect(s.gold).toBe(30);
    expect(s.items).toHaveLength(1);
    expect(s.player.maxHp).toBeGreaterThan(beforeMax);
    expect(s.drops).toHaveLength(0);
  });

  it('적 전멸 시 dungeonCleared 이벤트가 정확히 1회 발생한다', () => {
    const s = createState();
    const e = createEnemy(1, { x: 50, y: 0 });
    e.hp = T.attackDamage;
    s.enemies.push(e);
    step(s, { ...idleInput(), attack: true, aimX: 100, aimY: 0 });
    expect(s.cleared).toBe(true);
    expect(s.events.filter((ev) => ev.type === 'dungeonCleared')).toHaveLength(1);
    step(s, idleInput());
    expect(s.events.filter((ev) => ev.type === 'dungeonCleared')).toHaveLength(0);
  });

  it('플레이어 사망 시 playerDied 이벤트가 발생한다', () => {
    const s = createState();
    s.player.hp = 5;
    s.enemies.push(createEnemy(1, { x: 0, y: 0 }));
    step(s, idleInput());
    expect(s.events.some((ev) => ev.type === 'playerDied')).toBe(true);
  });
});

describe('combat: 강체 충돌', () => {
  it('같은 점에 겹친 몬스터들은 서로 밀려나 최소 간격을 확보한다', () => {
    const s = createState();
    s.player.pos = { x: 1000, y: 1000 }; // 멀리 — 접촉 피해 배제
    s.enemies.push(createEnemy(1, { x: 0, y: 0 }));
    s.enemies.push(createEnemy(2, { x: 0, y: 0 }));
    s.enemies.push(createEnemy(3, { x: 0.5, y: 0 }));
    for (let i = 0; i < 120; i++) step(s, idleInput());
    for (let i = 0; i < s.enemies.length; i++) {
      for (let j = i + 1; j < s.enemies.length; j++) {
        const a = s.enemies[i];
        const b = s.enemies[j];
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
        expect(d).toBeGreaterThanOrEqual((a.radius + b.radius) * 0.9);
      }
    }
  });

  it('몬스터는 플레이어를 관통하지 못하고 접촉 거리에서 멈춘다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 200, y: 0 }));
    for (let i = 0; i < 300; i++) {
      step(s, idleInput());
      const e = s.enemies[0];
      const d = Math.hypot(e.pos.x - s.player.pos.x, e.pos.y - s.player.pos.y);
      expect(d).toBeGreaterThanOrEqual((e.radius + s.player.radius) * 0.85);
    }
  });

  it('대시 중에는 몬스터를 통과할 수 있다', () => {
    const s = createState();
    const e = createEnemy(1, { x: 60, y: 0 });
    e.speed = 0; // 고정 장애물화
    s.enemies.push(e);
    // 오른쪽으로 대시 — 적 위치를 넘어가야 한다
    step(s, { ...idleInput(), dash: true, moveX: 1, aimX: 100, aimY: 0 });
    for (let i = 0; i < 10; i++) step(s, { ...idleInput(), moveX: 1, aimX: 200, aimY: 0 });
    expect(s.player.pos.x).toBeGreaterThan(e.pos.x + e.radius);
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
