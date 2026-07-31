import { TILE, type Dungeon } from './dungeon';
import type { Vec } from '../engine/math';

// 은신처: 수제 고정 공간. 생성기·몬스터 없음. Dungeon 구조를 재사용해 렌더러 변경을 최소화한다.
const GRID = 24;
const ROOM = { x: 4, y: 7, w: 16, h: 10 } as const;

export type StationKind = 'device' | 'merchant' | 'storage' | 'anvil';

export interface Station {
  kind: StationKind;
  pos: Vec; // 월드 좌표
  label: string;
  texKey: 'device' | 'merchant' | 'chest' | 'anvil';
}

function at(tx: number, ty: number): Vec {
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

export const HIDEOUT_STATIONS: Station[] = [
  { kind: 'device', pos: at(12, 8.2), label: '코어 삽입 장치', texKey: 'device' },
  { kind: 'merchant', pos: at(18, 11), label: '코어 상인', texKey: 'merchant' },
  { kind: 'storage', pos: at(6, 8.6), label: '보관함', texKey: 'chest' },
  { kind: 'anvil', pos: at(6, 14.5), label: '대장간', texKey: 'anvil' },
];

// 포탈이 생성되는 위치 (장치 앞)
export const PORTAL_POS: Vec = at(12, 11);

export function createHideout(): Dungeon {
  const tiles = new Uint8Array(GRID * GRID);
  for (let y = ROOM.y; y < ROOM.y + ROOM.h; y++) {
    for (let x = ROOM.x; x < ROOM.x + ROOM.w; x++) {
      tiles[y * GRID + x] = 1;
    }
  }
  return {
    seed: 0,
    biome: 'crypt',
    w: GRID,
    h: GRID,
    tiles,
    rooms: [{ ...ROOM }],
    spawn: at(12, 13.5),
    enemies: [],
    torches: [at(5, 7.5), at(19, 7.5), at(9, 8), at(15, 8)],
  };
}
