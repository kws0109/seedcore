import { describe, expect, it } from 'vitest';
import { generateDungeon, isWall, TILE } from '../src/game/dungeon';
import { step } from '../src/game/sim';
import { createStateFromDungeon, idleInput } from '../src/game/state';

// Uint8Array는 JSON.stringify가 객체로 찍히므로 비교용으로 정규화한다.
function fingerprint(seed: number): string {
  const d = generateDungeon(seed);
  return JSON.stringify({ ...d, tiles: Array.from(d.tiles) });
}

describe('던전 생성', () => {
  it('같은 시드는 완전히 같은 던전을 만든다', () => {
    expect(fingerprint(1234)).toEqual(fingerprint(1234));
  });

  it('다른 시드는 다른 던전을 만든다', () => {
    expect(fingerprint(1)).not.toEqual(fingerprint(2));
  });

  it('방 개수는 7~9개다', () => {
    for (const seed of [1, 42, 777, 9999]) {
      const d = generateDungeon(seed);
      expect(d.rooms.length).toBeGreaterThanOrEqual(7);
      expect(d.rooms.length).toBeLessThanOrEqual(9);
    }
  });

  it('방마다 실제 바닥 타일이 6개 이상이다 (블롭 캐브 하한)', () => {
    for (const seed of [1, 42, 777, 9999]) {
      const d = generateDungeon(seed);
      for (const r of d.rooms) {
        let floors = 0;
        for (let ty = r.y; ty < r.y + r.h; ty++) {
          for (let tx = r.x; tx < r.x + r.w; tx++) {
            if (!isWall(d, tx, ty)) floors++;
          }
        }
        expect(floors).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('모든 바닥 타일은 시작점에서 도달 가능하다 (플러드필)', () => {
    for (const seed of [1, 42, 777, 9999, 31337, 2, 3, 55555]) {
      const d = generateDungeon(seed);
      const sx = Math.floor(d.spawn.x / TILE);
      const sy = Math.floor(d.spawn.y / TILE);
      const visited = new Uint8Array(d.w * d.h);
      const queue = [sy * d.w + sx];
      visited[queue[0]] = 1;
      while (queue.length > 0) {
        const cur = queue.pop()!;
        const cx = cur % d.w;
        const cy = Math.floor(cur / d.w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (isWall(d, nx, ny)) continue;
          const idx = ny * d.w + nx;
          if (!visited[idx]) {
            visited[idx] = 1;
            queue.push(idx);
          }
        }
      }
      let floorCount = 0;
      let reached = 0;
      for (let i = 0; i < d.tiles.length; i++) {
        if (d.tiles[i] === 1) {
          floorCount++;
          if (visited[i]) reached++;
        }
      }
      expect(reached).toBe(floorCount);
    }
  });

  it('시작 방에는 스폰이 없고, 모든 스폰은 바닥 위에 있다', () => {
    const d = generateDungeon(777);
    const start = d.rooms[0];
    for (const s of d.enemies) {
      const tx = Math.floor(s.pos.x / TILE);
      const ty = Math.floor(s.pos.y / TILE);
      expect(isWall(d, tx, ty)).toBe(false);
      const inStart =
        tx >= start.x && tx < start.x + start.w && ty >= start.y && ty < start.y + start.h;
      expect(inStart).toBe(false);
    }
  });

  it('브루트가 정확히 1마리 있고 드롭이 사전 롤링되어 있다', () => {
    const d = generateDungeon(777);
    const brutes = d.enemies.filter((e) => e.kind === 'brute');
    expect(brutes).toHaveLength(1);
    expect(brutes[0].drop.item).not.toBeNull(); // 브루트는 아이템 100%
    for (const s of d.enemies) {
      expect(s.drop.gold).toBeGreaterThan(0);
    }
  });
});

describe('벽 충돌', () => {
  // 원이 벽 타일과 겹치는지 검사
  function overlapsWall(d: ReturnType<typeof generateDungeon>, x: number, y: number, r: number): boolean {
    const minTx = Math.floor((x - r) / TILE);
    const maxTx = Math.floor((x + r) / TILE);
    const minTy = Math.floor((y - r) / TILE);
    const maxTy = Math.floor((y + r) / TILE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!isWall(d, tx, ty)) continue;
        const cx = Math.max(tx * TILE, Math.min(x, (tx + 1) * TILE));
        const cy = Math.max(ty * TILE, Math.min(y, (ty + 1) * TILE));
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  it('4방향으로 600틱씩 밀어붙여도 플레이어가 벽을 관통하지 않는다', () => {
    const d = generateDungeon(42);
    for (const [mx, my] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const s = createStateFromDungeon(d);
      s.enemies = []; // 순수 이동 검사
      const inp = { ...idleInput(), moveX: mx, moveY: my };
      for (let i = 0; i < 600; i++) {
        step(s, inp);
        expect(overlapsWall(d, s.player.pos.x, s.player.pos.y, s.player.radius - 0.01)).toBe(false);
      }
    }
  });

  it('createStateFromDungeon은 스폰을 적 인스턴스로 만든다', () => {
    const d = generateDungeon(777);
    const s = createStateFromDungeon(d);
    expect(s.enemies).toHaveLength(d.enemies.length);
    expect(s.player.pos).toEqual(d.spawn);
    const brute = s.enemies.find((e) => e.kind === 'brute')!;
    expect(brute.hp).toBeGreaterThan(300 - 1);
  });
});
