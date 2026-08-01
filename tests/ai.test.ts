import { describe, expect, it } from 'vitest';
import { findPath, hasLineOfSight } from '../src/game/ai';
import { TILE, type Dungeon } from '../src/game/dungeon';
import { step } from '../src/game/sim';
import { createEnemy, createState, createStateFromDungeon, idleInput } from '../src/game/state';
import ENEMIES from '../src/data/enemies.json';

// 수제 픽스처: 10×10, 가운데 세로 벽(아래쪽 1칸 통로)
//   ##########
//   #....#...#
//   #....#...#
//   #....#...#
//   #........#   ← y=7 통로
//   ##########
function fixtureDungeon(): Dungeon {
  const w = 10;
  const h = 10;
  const tiles = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) tiles[y * w + x] = 1;
  }
  for (let y = 1; y <= 6; y++) tiles[y * w + 5] = 0; // 세로 벽 (x=5, y1~6). y=7이 통로
  return {
    seed: 0,
    biome: 'crypt',
    w,
    h,
    tiles,
    rooms: [{ x: 1, y: 1, w: 4, h: 8 }],
    spawn: { x: 2.5 * TILE, y: 2.5 * TILE },
    enemies: [],
    torches: [],
  };
}

describe('시야 (Line of Sight)', () => {
  it('벽이 가로막으면 보이지 않는다', () => {
    const d = fixtureDungeon();
    expect(hasLineOfSight(d, { x: 2.5 * TILE, y: 2.5 * TILE }, { x: 7.5 * TILE, y: 2.5 * TILE })).toBe(false);
  });

  it('트인 공간에서는 보인다', () => {
    const d = fixtureDungeon();
    expect(hasLineOfSight(d, { x: 2.5 * TILE, y: 7.5 * TILE }, { x: 7.5 * TILE, y: 7.5 * TILE })).toBe(true);
  });

  it('던전이 없으면(테스트 평면) 항상 보인다', () => {
    expect(hasLineOfSight(null, { x: 0, y: 0 }, { x: 9999, y: 0 })).toBe(true);
  });
});

describe('A* 길찾기', () => {
  it('벽을 돌아가는 경로를 찾는다', () => {
    const d = fixtureDungeon();
    const path = findPath(d, { x: 2.5 * TILE, y: 2.5 * TILE }, { x: 7.5 * TILE, y: 2.5 * TILE });
    expect(path.length).toBeGreaterThan(0);
    // 경로는 통로(y=7 행)를 지나야 한다
    expect(path.some((wp) => Math.floor(wp.y / TILE) === 7)).toBe(true);
    // 종점은 목표 타일
    const last = path[path.length - 1];
    expect(Math.floor(last.x / TILE)).toBe(7);
    expect(Math.floor(last.y / TILE)).toBe(2);
  });

  it('경로가 없으면 빈 배열을 반환한다', () => {
    const d = fixtureDungeon();
    // 사방이 벽인 지점 (경계 밖 타일)
    const path = findPath(d, { x: 2.5 * TILE, y: 2.5 * TILE }, { x: 0.5 * TILE, y: 0.5 * TILE });
    expect(path).toEqual([]);
  });
});

describe('어그로', () => {
  it('시야 범위 밖의 몬스터는 어그로 없이 홈 주변에 머문다 (배회만)', () => {
    const s = createState();
    const e = createEnemy(1, { x: ENEMIES.ghoul.aggroRange + 400, y: 0 });
    s.enemies.push(e);
    for (let i = 0; i < 300; i++) step(s, idleInput());
    expect(e.aggro).toBe(false);
    // 플레이어 쪽으로 추적하지 않고 홈 반경 안에 머문다
    expect(Math.hypot(e.pos.x - e.home.x, e.pos.y - e.home.y)).toBeLessThan(150);
  });

  it('범위 안 + 시야가 트이면 어그로가 잡히고 접근한다', () => {
    const s = createState();
    const e = createEnemy(1, { x: 200, y: 0 });
    s.enemies.push(e);
    for (let i = 0; i < 60; i++) step(s, idleInput());
    expect(e.aggro).toBe(true);
    expect(e.pos.x).toBeLessThan(200);
  });

  it('범위 안이라도 벽 뒤면 어그로가 잡히지 않는다', () => {
    const d = fixtureDungeon();
    const s = createStateFromDungeon(d);
    const e = createEnemy(0, { x: 7.5 * TILE, y: 2.5 * TILE });
    s.enemies.push(e);
    s.player.pos = { x: 2.5 * TILE, y: 2.5 * TILE };
    for (let i = 0; i < 30; i++) step(s, idleInput());
    expect(e.aggro).toBe(false);
  });

  it('피격당하면 어그로가 잡히고 주변 무리도 깨어난다', () => {
    const s = createState();
    const near = createEnemy(1, { x: 50, y: 0 });
    const packmate = createEnemy(2, { x: 50 + 100, y: 0 }); // near에서 100px
    const far = createEnemy(3, { x: 2000, y: 0 });
    // 어그로 상태 초기화 테스트를 위해 시야 어그로를 배제할 수 없으므로 직접 확인:
    s.enemies.push(near, packmate, far);
    step(s, { ...idleInput(), attack: true, aimX: 100, aimY: 0 });
    expect(near.aggro).toBe(true);
    expect(packmate.aggro).toBe(true); // 경보 전파 (150px 이내)
    expect(far.aggro).toBe(false);
  });
});

describe('배회 (비인지 상태)', () => {
  it('비인지 몬스터도 시간이 지나면 홈 주변을 움직인다', () => {
    const s = createState();
    s.player.pos = { x: 5000, y: 5000 }; // 인지 불가 거리
    const e = createEnemy(1, { x: 0, y: 0 });
    s.enemies.push(e);
    let moved = false;
    for (let i = 0; i < 600; i++) {
      step(s, idleInput());
      if (Math.hypot(e.pos.x, e.pos.y) > 5) moved = true;
    }
    expect(moved).toBe(true);
    expect(e.aggro).toBe(false);
  });

  it('배회는 홈 반경을 벗어나지 않는다', () => {
    const s = createState();
    s.player.pos = { x: 5000, y: 5000 };
    const e = createEnemy(2, { x: 0, y: 0 });
    s.enemies.push(e);
    for (let i = 0; i < 3600; i++) {
      step(s, idleInput());
      expect(Math.hypot(e.pos.x - e.home.x, e.pos.y - e.home.y)).toBeLessThan(150);
    }
  });

  it('배회 중 인지되면 즉시 추적으로 전환된다', () => {
    const s = createState();
    const e = createEnemy(3, { x: 200, y: 0 });
    s.enemies.push(e);
    for (let i = 0; i < 90; i++) step(s, idleInput());
    expect(e.aggro).toBe(true);
    expect(e.pos.x).toBeLessThan(200); // 접근 중
  });
});

describe('길찾기 통합', () => {
  it('벽 뒤에서 어그로 잡힌 몬스터가 통로를 돌아 접근한다', () => {
    const d = fixtureDungeon();
    const s = createStateFromDungeon(d);
    const e = createEnemy(0, { x: 7.5 * TILE, y: 2.5 * TILE });
    e.aggro = true; // 경보 등으로 이미 인지한 상황
    s.enemies.push(e);
    s.player.pos = { x: 2.5 * TILE, y: 2.5 * TILE };
    const d0 = Math.hypot(e.pos.x - s.player.pos.x, e.pos.y - s.player.pos.y);
    for (let i = 0; i < 600; i++) step(s, idleInput());
    const d1 = Math.hypot(e.pos.x - s.player.pos.x, e.pos.y - s.player.pos.y);
    // 직선 돌진이면 벽에 막혀 거리가 거의 안 줄어든다. 경로 탐색이면 크게 준다.
    expect(d1).toBeLessThan(d0 * 0.6);
  });
});
