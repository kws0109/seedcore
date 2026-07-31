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

function isWallAt(tiles: Uint8Array, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) return true;
  return tiles[ty * GRID + tx] === 0;
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

// 지형 성격 파라미터 (Task 3에서 바이옴 프리셋으로 차등)
export interface CarveParams {
  roundness: number; // 0=각진 방(체비쇼프) ~ 1=둥근 방(유클리드)
  noiseAmp: number; // 방 가장자리 불규칙도
  corridorJitter: number; // 복도가 옆길로 새는 확률
}

const DEFAULT_CARVE: CarveParams = { roundness: 0.75, noiseAmp: 0.25, corridorJitter: 0.3 };

// 방 블롭 캐브: 타원/사각 혼합 정규화 거리 + 타일별 노이즈.
// 중심부(dist<0.5)는 노이즈와 무관하게 항상 바닥 → 복도 연결·스폰 안전지대 보장.
function carveRoomBlob(tiles: Uint8Array, r: Room, rng: Rng, p: CarveParams): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const nx = ((x + 0.5 - cx) / (r.w / 2)) ** 2;
      const ny = ((y + 0.5 - cy) / (r.h / 2)) ** 2;
      const euclid = nx + ny;
      const cheby = Math.max(nx, ny);
      const dist = cheby * (1 - p.roundness) + euclid * p.roundness;
      const noise = (rng() - 0.5) * 2 * p.noiseAmp;
      if (dist <= 1.02 + noise || dist < 0.5) tiles[y * GRID + x] = 1;
    }
  }
}

function carve2x2(tiles: Uint8Array, x: number, y: number): void {
  const cx = Math.max(1, Math.min(GRID - 3, x));
  const cy = Math.max(1, Math.min(GRID - 3, y));
  tiles[cy * GRID + cx] = 1;
  tiles[cy * GRID + cx + 1] = 1;
  tiles[(cy + 1) * GRID + cx] = 1;
  tiles[(cy + 1) * GRID + cx + 1] = 1;
}

// 목표 지향 랜덤 워크 복도 (2타일 폭). jitter 확률로 옆길로 샌다.
function carveCorridorWalk(tiles: Uint8Array, from: Room, to: Room, rng: Rng, p: CarveParams): void {
  const a = roomCenter(from);
  const b = roomCenter(to);
  let x = a.cx;
  let y = a.cy;
  let guard = 0;
  while ((x !== b.cx || y !== b.cy) && guard++ < 4000) {
    carve2x2(tiles, x, y);
    const dx = Math.sign(b.cx - x);
    const dy = Math.sign(b.cy - y);
    if (rng() < p.corridorJitter) {
      if (rng() < 0.5) x += rng() < 0.5 ? 1 : -1;
      else y += rng() < 0.5 ? 1 : -1;
      x = Math.max(2, Math.min(GRID - 4, x));
      y = Math.max(2, Math.min(GRID - 4, y));
    } else if (dx !== 0 && (dy === 0 || rng() < 0.5)) {
      x += dx;
    } else if (dy !== 0) {
      y += dy;
    }
  }
  carve2x2(tiles, x, y);
}

// 시작 방 중심에서 닿지 않는 바닥을 전부 벽으로 환원
function pruneUnreachable(tiles: Uint8Array, start: { cx: number; cy: number }): void {
  const startIdx = start.cy * GRID + start.cx;
  tiles[startIdx] = 1; // 방 중심부는 캐브 규칙상 바닥이지만 방어적으로 보장
  const visited = new Uint8Array(GRID * GRID);
  visited[startIdx] = 1;
  const stack = [startIdx];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const cx = cur % GRID;
    const cy = Math.floor(cur / GRID);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const idx = ny * GRID + nx;
      if (tiles[idx] === 1 && !visited[idx]) {
        visited[idx] = 1;
        stack.push(idx);
      }
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === 1 && !visited[i]) tiles[i] = 0;
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

// 방 안 무작위 "실제 바닥" 위치 — 블롭 캐브 후에는 사각 범위 안에 벽이 섞이므로
// 결정론적 재시도로 바닥 타일을 찾고, 실패 시 항상 바닥인 방 중심으로 폴백.
function randomFloorPosInRoom(rng: Rng, tiles: Uint8Array, r: Room): Vec {
  for (let attempt = 0; attempt < 50; attempt++) {
    const tx = r.x + 1 + Math.floor(rng() * (r.w - 2));
    const ty = r.y + 1 + Math.floor(rng() * (r.h - 2));
    if (tiles[ty * GRID + tx] === 1) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  const c = roomCenter(r);
  return { x: (c.cx + 0.5) * TILE, y: (c.cy + 0.5) * TILE };
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

  const carve = DEFAULT_CARVE;
  for (const r of rooms) carveRoomBlob(tiles, r, rng, carve);
  for (let i = 1; i < rooms.length; i++) carveCorridorWalk(tiles, rooms[i - 1], rooms[i], rng, carve);
  // 노이즈 캐브가 만든 고립 바닥을 벽으로 되돌린다 — 도달 가능성의 구조적 보증
  pruneUnreachable(tiles, roomCenter(rooms[0]));

  const d: Dungeon = {
    seed,
    w: GRID,
    h: GRID,
    tiles,
    rooms,
    spawn: randomFloorPosInRoom(rng, tiles, rooms[0]),
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
        pos: randomFloorPosInRoom(spawnRng, tiles, room),
        drop: rollDrop(lootRng, 'ghoul'),
      });
    }
    if (spawnRng() < 0.4) {
      d.enemies.push({
        kind: 'archer',
        pos: randomFloorPosInRoom(spawnRng, tiles, room),
        drop: rollDrop(lootRng, 'archer'),
      });
    }
    if (i === deepest) {
      d.enemies.push({
        kind: 'brute',
        pos: randomFloorPosInRoom(spawnRng, tiles, room),
        drop: rollDrop(lootRng, 'brute'),
      });
    }
  }

  // 횃불: 방마다 1개, 벽에 인접한 바닥 타일 우선 (layout 스트림)
  for (const room of rooms) {
    let placed: Vec | null = null;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      const tx = room.x + Math.floor(rng() * room.w);
      const ty = room.y + Math.floor(rng() * room.h);
      if (tiles[ty * GRID + tx] !== 1) continue;
      const nearWall =
        isWallAt(tiles, tx + 1, ty) || isWallAt(tiles, tx - 1, ty) ||
        isWallAt(tiles, tx, ty + 1) || isWallAt(tiles, tx, ty - 1);
      if (nearWall) placed = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    }
    d.torches.push(placed ?? randomFloorPosInRoom(rng, tiles, room));
  }

  return d;
}
