import { Assets, Rectangle, Texture } from 'pixi.js';

// 사전 렌더 스프라이트 시트 규격: 행=방향(행 i = 화면각 i·(360/dirs)°, 0=오른쪽·시계방향), 열=프레임.
// 캐릭터/무기 분리 시트를 같은 프레임 인덱스로 겹쳐 그린다 (무기 교체 설계).
export const SHEET_CELL = 128;

export interface ClipSpec {
  frames: number;
  fps: number;
  loop: boolean;
}

export interface ClipTextures {
  char: Texture[][]; // [dir][frame]
  weapon: Texture[][] | null;
}

export interface AnimSet {
  dirs: number;
  clips: Record<string, ClipSpec>;
  tex: Record<string, ClipTextures>;
}

export type PlayerClip = 'idle' | 'walk' | 'slash';
export type EnemyClip = 'idle' | 'walk' | 'attack';

export const PLAYER_CLIPS: Record<PlayerClip, ClipSpec> = {
  idle: { frames: 6, fps: 5, loop: true },
  walk: { frames: 6, fps: 12, loop: true },
  slash: { frames: 6, fps: 20, loop: false },
};

export const ENEMY_CLIPS: Record<EnemyClip, ClipSpec> = {
  idle: { frames: 6, fps: 5, loop: true },
  walk: { frames: 6, fps: 10, loop: true },
  attack: { frames: 6, fps: 12, loop: true },
};

// facing(라디안, y축 아래 양수, 0=오른쪽) → 방향 행 (가장 가까운 스텝)
export function dirFromAngle(a: number, dirs: number): number {
  const step = (Math.PI * 2) / dirs;
  return ((Math.round(a / step) % dirs) + dirs) % dirs;
}

function slice(sheet: Texture, frames: number, dirs: number): Texture[][] {
  const out: Texture[][] = [];
  for (let d = 0; d < dirs; d++) {
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

export async function loadAnimSet(
  base: string,
  prefix: string,
  clips: Record<string, ClipSpec>,
  dirs: number,
  withWeapon: boolean,
): Promise<AnimSet> {
  const tex: Record<string, ClipTextures> = {};
  for (const [name, spec] of Object.entries(clips)) {
    const charSheet = await Assets.load<Texture>(`${base}assets/anim/${prefix}-${name}.png`);
    let weapon: Texture[][] | null = null;
    if (withWeapon) {
      const weaponSheet = await Assets.load<Texture>(`${base}assets/anim/${prefix}-${name}-w.png`);
      weapon = slice(weaponSheet, spec.frames, dirs);
    }
    tex[name] = { char: slice(charSheet, spec.frames, dirs), weapon };
  }
  return { dirs, clips, tex };
}
