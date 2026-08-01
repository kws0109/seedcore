import { Assets, Rectangle, Texture } from 'pixi.js';

// 사전 렌더 스프라이트 시트 규격: 행=방향(16방향, 행 i = 화면각 i·22.5°, 0=오른쪽·시계방향), 열=프레임.
// 캐릭터/무기 분리 시트를 같은 프레임 인덱스로 겹쳐 그린다 (무기 교체 설계).
export const SHEET_CELL = 128;
export const DIR_ROWS = 16;

export type ClipName = 'idle' | 'walk' | 'slash';

export const CLIPS: Record<ClipName, { frames: number; fps: number; loop: boolean }> = {
  idle: { frames: 6, fps: 5, loop: true },
  walk: { frames: 6, fps: 12, loop: true },
  slash: { frames: 6, fps: 20, loop: false },
};

// facing(라디안, y축 아래 양수, 0=오른쪽) → 방향 행 (가장 가까운 22.5° 스텝)
export function dirFromAngle(a: number): number {
  const step = (Math.PI * 2) / DIR_ROWS;
  return ((Math.round(a / step) % DIR_ROWS) + DIR_ROWS) % DIR_ROWS;
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
