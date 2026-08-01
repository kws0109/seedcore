import { Assets, Rectangle, Texture } from 'pixi.js';

// 사전 렌더 스프라이트 시트 규격: 행=방향(down/left/up/right), 열=프레임.
// 캐릭터/무기 분리 시트를 같은 프레임 인덱스로 겹쳐 그린다 (무기 교체 설계).
export const SHEET_CELL = 128;
export const DIR_ROWS = 4;

export type ClipName = 'idle' | 'walk' | 'slash';
export type Dir = 0 | 1 | 2 | 3; // down, left, up, right

export const CLIPS: Record<ClipName, { frames: number; fps: number; loop: boolean }> = {
  idle: { frames: 6, fps: 5, loop: true },
  walk: { frames: 6, fps: 12, loop: true },
  slash: { frames: 6, fps: 20, loop: false },
};

// facing(라디안, y축 아래 양수) → 방향 행
export function dirFromAngle(a: number): Dir {
  const q = Math.round(a / (Math.PI / 2));
  if (q === 0) return 3; // right
  if (q === 1) return 0; // down
  if (q === -1) return 2; // up
  return 1; // left (±2)
}

export interface ClipTextures {
  char: Texture[][]; // [dir][frame]
  weapon: Texture[][];
}

function slice(sheet: Texture, frames: number): Texture[][] {
  const out: Texture[][] = [];
  for (let d = 0; d < DIR_ROWS; d++) {
    const row: Texture[] = [];
    for (let f = 0; f < frames; f++) {
      row.push(
        new Texture({
          source: sheet.source,
          frame: new Rectangle(f * SHEET_CELL, d * SHEET_CELL, SHEET_CELL, SHEET_CELL),
        }),
      );
    }
    out.push(row);
  }
  return out;
}

export async function loadPlayerAnim(base: string): Promise<Record<ClipName, ClipTextures>> {
  const names: ClipName[] = ['idle', 'walk', 'slash'];
  const result = {} as Record<ClipName, ClipTextures>;
  for (const name of names) {
    const [charSheet, weaponSheet] = await Promise.all([
      Assets.load<Texture>(`${base}assets/anim/player-${name}.png`),
      Assets.load<Texture>(`${base}assets/anim/player-${name}-w.png`),
    ]);
    result[name] = {
      char: slice(charSheet, CLIPS[name].frames),
      weapon: slice(weaponSheet, CLIPS[name].frames),
    };
  }
  return result;
}
