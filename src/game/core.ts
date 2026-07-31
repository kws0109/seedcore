import { generateDungeon, type Biome, type ItemStat, type Rarity } from './dungeon';

// 코어 코드 형식: SC1-<시드 8hex>-<체크섬 4hex>
// 시드만 있으면 던전 전체(바이옴·배치·확정 드롭)가 재현되므로 코드는 시드+무결성 검증만 담는다.
// 주의: 형식·체크섬 로직 변경은 기존 공유 코드를 무효화한다 — 배포 후 변경 금지.

const PREFIX = 'SC1';

function checksum(seed: number): number {
  let h = 0x811c9dc5;
  const s = `${PREFIX}:${seed >>> 0}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 16; // 16비트
}

export function encodeCore(seed: number): string {
  const u = seed >>> 0;
  const seedHex = u.toString(16).padStart(8, '0');
  const sumHex = checksum(u).toString(16).padStart(4, '0');
  return `${PREFIX}-${seedHex}-${sumHex}`;
}

export function decodeCore(code: string): number | null {
  const m = code.trim().toUpperCase().match(/^SC1-([0-9A-F]{1,8})-([0-9A-F]{4})$/);
  if (!m) return null;
  const seed = parseInt(m[1], 16) >>> 0;
  const sum = parseInt(m[2], 16);
  if (checksum(seed) !== sum) return null;
  return seed;
}

export interface DungeonSummary {
  biome: Biome;
  enemyCount: number;
  brutes: number;
  items: Array<{ rarity: Rarity; stat: ItemStat }>;
  totalGold: number;
}

export function summarizeDungeon(seed: number): DungeonSummary {
  const d = generateDungeon(seed);
  return {
    biome: d.biome,
    enemyCount: d.enemies.length,
    brutes: d.enemies.filter((e) => e.kind === 'brute').length,
    items: d.enemies.filter((e) => e.drop.item).map((e) => ({ ...e.drop.item! })),
    totalGold: d.enemies.reduce((acc, e) => acc + e.drop.gold, 0),
  };
}

export const ITEM_VALUE: Record<Rarity, number> = { common: 15, rare: 40, epic: 120 };

// 감정가: 코어에 봉인된 전리품·위험도 기반. 결정론적.
export function appraise(seed: number): number {
  const s = summarizeDungeon(seed);
  const itemValue = s.items.reduce((acc, it) => acc + ITEM_VALUE[it.rarity], 0);
  return Math.max(1, Math.floor(itemValue * 0.6 + s.totalGold * 0.5 + s.enemyCount * 2));
}

// 시장 재고용 시드. 시장은 로컬 메타라 결정론이 필요 없다.
export function rollMarketSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
