import type { OwnedItem } from '../game/state';

// 런을 넘어 유지되는 메타 상태. localStorage에 저장된다.
export interface MetaState {
  v: 1;
  gold: number;
  items: OwnedItem[];
  cores: number[]; // 보유 코어의 시드 목록
  upgrades: { atk: number; hp: number; speed: number }; // 강화 레벨
}

const KEY = 'seedcore-save';

export function emptyMeta(): MetaState {
  return { v: 1, gold: 0, items: [], cores: [], upgrades: { atk: 0, hp: 0, speed: 0 } };
}

export function serializeMeta(meta: MetaState): string {
  return JSON.stringify(meta);
}

export function deserializeMeta(raw: string): MetaState | null {
  try {
    const data = JSON.parse(raw) as Partial<MetaState>;
    if (data.v !== 1) return null;
    const base = emptyMeta();
    return {
      v: 1,
      gold: typeof data.gold === 'number' ? data.gold : base.gold,
      items: Array.isArray(data.items) ? data.items : base.items,
      cores: Array.isArray(data.cores) ? data.cores : base.cores,
      upgrades: { ...base.upgrades, ...(data.upgrades ?? {}) },
    };
  } catch {
    return null;
  }
}

// localStorage 접근은 실패해도(프라이빗 모드 등) 게임이 죽지 않아야 한다.
export function saveMeta(meta: MetaState): void {
  try {
    localStorage.setItem(KEY, serializeMeta(meta));
  } catch {
    // 저장 실패는 치명적이지 않다 — 세션 내 진행은 유지된다
  }
}

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyMeta();
    return deserializeMeta(raw) ?? emptyMeta();
  } catch {
    return emptyMeta();
  }
}
