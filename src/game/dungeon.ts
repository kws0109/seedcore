import { deriveSeed, mulberry32, type Rng } from '../engine/rng';
import type { Vec } from '../engine/math';
import type { EnemyKind } from './state';

export const TILE = 64;

const GRID = 48; // 타일 단위 던전 크기
const ROOM_MIN = 5;
const ROOM_MAX = 9;
const ROOMS_MIN = 7;
const ROOMS_MAX = 9;

export type Rarity = 'common' | 'rare' | 'epic';
export type ItemStat = 'atk' | 'hp' | 'speed';

export interface RolledDrop {
  gold: number;
  item: { rarity: Rarity; stat: ItemStat } | null;
}

export interface EnemySpawn {
  kind: EnemyKind;
  pos: Vec;
  drop: RolledDrop;
}

export interface Room {
  x: number; // 타일 좌표
  y: number;
  w: number;
  h: number;
}

export interface Dungeon {
  seed: number;
  w: number;
  h: number;
  tiles: Uint8Array; // 0=벽, 1=바닥
  rooms: Room[]; // [0]이 시작 방
  spawn: Vec; // 월드 좌표
  enemies: EnemySpawn[];
  torches: Vec[]; // 월드 좌표
}

export function isWall(d: Dungeon, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return true;
  return d.tiles[ty * d.w + tx] === 0;
}

function roomCenter(r: Room): { cx: number; cy: number } {
  return { cx: Math.floor(r.x + r.w / 2), cy: Math.floor(r.y + r.h / 2) };
}

function overlaps(a: Room, b: Room): boolean {
  // 마진 1타일 포함 겹침 판정
  return (
    a.x - 1 < b.x + b.w + 1 &&
    a.x + a.w + 1 > b.x - 1 &&
    a.y - 1 < b.y + b.h + 1 &&
    a.y + a.h + 1 > b.y - 1
  );
}

function carveRoom(tiles: Uint8Array, r: Room): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      tiles[y * GRID + x] = 1;
    }
  }
}

// L자 복도 (2타일 폭): 수평 먼저, 그다음 수직
function carveCorridor(tiles: Uint8Array, from: Room, to: Room): void {
  const a = roomCenter(from);
  const b = roomCenter(to);
  const [x1, x2] = a.cx < b.cx ? [a.cx, b.cx] : [b.cx, a.cx];
  for (let x = x1; x <= x2; x++) {
    tiles[a.cy * GRID + x] = 1;
    tiles[(a.cy + 1) * GRID + x] = 1;
  }
  const [y1, y2] = a.cy < b.cy ? [a.cy, b.cy] : [b.cy, a.cy];
  for (let y = y1; y <= y2; y++) {
    tiles[y * GRID + b.cx] = 1;
    tiles[y * GRID + b.cx + 1] = 1;
  }
}

function rollDrop(rng: Rng, kind: EnemyKind): RolledDrop {
  const goldRange: Record<EnemyKind, [number, number]> = {
    ghoul: [5, 15],
    archer: [10, 25],
    brute: [40, 80],
  };
  const itemChance: Record<EnemyKind, number> = { ghoul: 0.1, archer: 0.2, brute: 1.0 };
  const [gMin, gMax] = goldRange[kind];
  const gold = gMin + Math.floor(rng() * (gMax - gMin + 1));
  let item: RolledDrop['item'] = null;
  if (rng() < itemChance[kind]) {
    const r = rng();
    const rarity: Rarity = r < 0.7 ? 'common' : r < 0.95 ? 'rare' : 'epic';
    const stats: ItemStat[] = ['atk', 'hp', 'speed'];
    item = { rarity, stat: stats[Math.floor(rng() * stats.length)] };
  }
  return { gold, item };
}

// 방 안 무작위 바닥 위치 (가장자리 1타일 안쪽)
function randomPosInRoom(rng: Rng, r: Room): Vec {
  const tx = r.x + 1 + Math.floor(rng() * (r.w - 2));
  const ty = r.y + 1 + Math.floor(rng() * (r.h - 2));
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

export function generateDungeon(seed: number): Dungeon {
  // 독립 스트림: 한 스트림의 로직 변경이 다른 스트림 결과를 흔들지 않는다 (코어 공유 안정성)
  const rng = mulberry32(deriveSeed(seed, 'layout'));
  const spawnRng = mulberry32(deriveSeed(seed, 'spawn'));
  const lootRng = mulberry32(deriveSeed(seed, 'loot'));
  const tiles = new Uint8Array(GRID * GRID); // 전부 벽

  // 방 배치 (rejection sampling)
  const targetRooms = ROOMS_MIN + Math.floor(rng() * (ROOMS_MAX - ROOMS_MIN + 1));
  const rooms: Room[] = [];
  let attempts = 0;
  while (rooms.length < targetRooms && attempts < 400) {
    attempts++;
    const w = ROOM_MIN + Math.floor(rng() * (ROOM_MAX - ROOM_MIN + 1));
    const h = ROOM_MIN + Math.floor(rng() * (ROOM_MAX - ROOM_MIN + 1));
    const x = 2 + Math.floor(rng() * (GRID - w - 4));
    const y = 2 + Math.floor(rng() * (GRID - h - 4));
    const room: Room = { x, y, w, h };
    if (rooms.some((r) => overlaps(r, room))) continue;
    rooms.push(room);
  }

  for (const r of rooms) carveRoom(tiles, r);
  for (let i = 1; i < rooms.length; i++) carveCorridor(tiles, rooms[i - 1], rooms[i]);

  const d: Dungeon = {
    seed,
    w: GRID,
    h: GRID,
    tiles,
    rooms,
    spawn: randomPosInRoom(rng, rooms[0]),
    enemies: [],
    torches: [],
  };

  // 최심방: 시작 방 중심에서 가장 먼 방
  const start = roomCenter(rooms[0]);
  let deepest = 1;
  let deepestDist = -1;
  for (let i = 1; i < rooms.length; i++) {
    const c = roomCenter(rooms[i]);
    const dist = (c.cx - start.cx) ** 2 + (c.cy - start.cy) ** 2;
    if (dist > deepestDist) {
      deepestDist = dist;
      deepest = i;
    }
  }

  // 스폰 (시작 방 제외) — 배치는 spawn 스트림, 드롭은 loot 스트림
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    const ghouls = 2 + Math.floor(spawnRng() * 2); // 2~3
    for (let g = 0; g < ghouls; g++) {
      d.enemies.push({
        kind: 'ghoul',
        pos: randomPosInRoom(spawnRng, room),
        drop: rollDrop(lootRng, 'ghoul'),
      });
    }
    if (spawnRng() < 0.4) {
      d.enemies.push({
        kind: 'archer',
        pos: randomPosInRoom(spawnRng, room),
        drop: rollDrop(lootRng, 'archer'),
      });
    }
    if (i === deepest) {
      d.enemies.push({
        kind: 'brute',
        pos: randomPosInRoom(spawnRng, room),
        drop: rollDrop(lootRng, 'brute'),
      });
    }
  }

  // 횃불: 방마다 1개 (layout 스트림)
  for (const room of rooms) {
    const tx = room.x + 1 + Math.floor(rng() * (room.w - 2));
    d.torches.push({ x: (tx + 0.5) * TILE, y: (room.y + 0.35) * TILE });
  }

  return d;
}
