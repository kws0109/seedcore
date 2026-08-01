import {
  Application,
  Assets,
  Container,
  Graphics,
  Matrix,
  Sprite,
  Texture,
  TilingSprite,
} from 'pixi.js';
import { isWall, TILE, type Biome, type Dungeon } from '../game/dungeon';
import { hasLineOfSight } from '../game/ai';
import { T } from '../game/tuning';
import type { EnemyKind, GameState } from '../game/state';
import {
  dirFromAngle,
  ENEMY_CLIPS,
  loadAnimSet,
  PLAYER_CLIPS,
  type AnimSet,
  type EnemyClip,
  type PlayerClip,
} from './anim';
import { Effects } from './effects';
import ENEMIES from '../data/enemies.json';

const RARITY_TINT = { common: 0xcfc4a8, rare: 0x6a9ad0, epic: 0xb060d0 } as const;

const BASE = import.meta.env.BASE_URL;

// 축측 투영: 캐릭터 시트를 캡처한 카메라(38°)와 같은 기울기로 지면을 눕힌다.
// 월드 컨테이너 y를 sin38°로 압축하고, 수직으로 서야 하는 빌보드(캐릭터·소품)만 역보정.
// 시뮬레이션은 압축 없는 정사각 좌표계 그대로 — 투영은 순수 렌더 계층.
export const CAM_TILT = (38 * Math.PI) / 180;
const PROJ = Math.sin(CAM_TILT); // 지면 y 압축률 ≈ 0.616
// 카메라 줌 — 런타임 조절 가능(마우스 휠). 값은 setZoom으로 갱신되고 매 프레임 반영된다.
const ZOOM_DEFAULT = 2.42; // 사용자 확정값 (2026-08-01)
const ZOOM_MIN = 1.2;
const ZOOM_MAX = 4;
const WALL_H = 48; // 벽 높이(월드 단위)
const WALL_RISE = WALL_H * Math.cos(CAM_TILT); // 벽 상단이 화면에서 솟는 픽셀
const WALL_RISE_L = WALL_RISE / PROJ; // 위 상승량의 월드-로컬 환산

const TEXTURES = {
  player: 'player-knight',
  ghoul: 'enemy-ghoul',
  archer: 'enemy-archer',
  brute: 'enemy-brute',
  floor: 'floor-stone',
  floorCave: 'floor-cave',
  floorAbyss: 'floor-abyss',
  torch: 'prop-torch',
  mushroom: 'prop-mushroom',
  coral: 'prop-coral',
  core: 'core-crystal',
  device: 'prop-device',
  merchant: 'prop-merchant',
  chest: 'prop-chest',
  anvil: 'prop-anvil',
  wallStone: 'wall-stone',
  wallCave: 'wall-cave',
  wallAbyss: 'wall-abyss',
} as const;

// 바이옴별 팔레트·텍스처. 지형 프리셋은 dungeon.ts, 시각 연출은 여기.
interface BiomeVisual {
  floorKey: 'floor' | 'floorCave' | 'floorAbyss';
  wallKey: 'wallStone' | 'wallCave' | 'wallAbyss';
  floorTint: number;
  wallFill: number;
  wallHighlight: number;
  propKey: 'torch' | 'mushroom' | 'coral';
  lightStops: Array<[number, string]>; // 플레이어 광원
  glowStops: Array<[number, string]>; // 소품 광원
}

const BIOME_VISUALS: Record<Biome, BiomeVisual> = {
  crypt: {
    floorKey: 'floor',
    wallKey: 'wallStone',
    floorTint: 0x9a938a,
    wallFill: 0x1a1512,
    wallHighlight: 0x322a20,
    propKey: 'torch',
    lightStops: [
      [0, 'rgba(255,180,90,0.32)'],
      [0.5, 'rgba(255,150,70,0.12)'],
      [1, 'rgba(0,0,0,0)'],
    ],
    glowStops: [
      [0, 'rgba(255,170,80,0.35)'],
      [0.6, 'rgba(200,110,50,0.1)'],
      [1, 'rgba(0,0,0,0)'],
    ],
  },
  cavern: {
    floorKey: 'floorCave',
    wallKey: 'wallCave',
    floorTint: 0x8fa094,
    wallFill: 0x131711,
    wallHighlight: 0x27301f,
    propKey: 'mushroom',
    lightStops: [
      [0, 'rgba(170,240,200,0.26)'],
      [0.5, 'rgba(120,200,160,0.1)'],
      [1, 'rgba(0,0,0,0)'],
    ],
    glowStops: [
      [0, 'rgba(140,240,200,0.32)'],
      [0.6, 'rgba(80,180,140,0.1)'],
      [1, 'rgba(0,0,0,0)'],
    ],
  },
  abyss: {
    floorKey: 'floorAbyss',
    wallKey: 'wallAbyss',
    floorTint: 0x8a97a8,
    wallFill: 0x0e141c,
    wallHighlight: 0x223040,
    propKey: 'coral',
    lightStops: [
      [0, 'rgba(110,180,240,0.28)'],
      [0.5, 'rgba(70,140,210,0.1)'],
      [1, 'rgba(0,0,0,0)'],
    ],
    glowStops: [
      [0, 'rgba(90,180,255,0.32)'],
      [0.6, 'rgba(50,120,200,0.1)'],
      [1, 'rgba(0,0,0,0)'],
    ],
  },
};

// 캔버스로 방사형 그라데이션 텍스처를 만든다 (광원·비네트용).
function radialTexture(size: number, stops: Array<[number, string]>): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

export class Renderer {
  readonly app = new Application();
  readonly world = new Container(); // 카메라 변환 대상
  readonly fx = new Container(); // 이펙트 레이어
  readonly effects = new Effects(this.fx);
  shake = 0; // 남은 흔들림 강도(px)

  private textures!: Record<keyof typeof TEXTURES, Texture>;
  private floor!: TilingSprite;
  private light!: Sprite;
  private fog!: Sprite;
  private vignette!: Sprite;
  private dungeonRef: Dungeon | null = null;
  private playerSprite!: Container; // char + weapon 레이어 (시트 프레임 교체 방식)
  private playerChar!: Sprite;
  private playerWeapon!: Sprite;
  private playerAnim!: AnimSet;
  private enemyAnim!: Record<EnemyKind, AnimSet>;
  private slashMs = 0; // 슬래시 원샷 재생 잔여(ms)
  private enemySprites = new Map<
    number,
    {
      root: Container;
      char: Sprite;
      weapon: Sprite | null;
      lastDir: number;
      stillFrames: number;
      striking: boolean;
    }
  >();
  private walls = new Graphics(); // 던전당 1회 빌드
  private torchLayer = new Container();
  private torchGlows: Sprite[] = [];
  private projectilesG = new Graphics(); // 매 프레임 다시 그림
  private dropsG = new Graphics();
  private dropSprites = new Map<number, Sprite>();

  async init(): Promise<void> {
    await this.app.init({ background: '#0a0908', resizeTo: window, antialias: true });
    document.body.appendChild(this.app.canvas);

    const entries = Object.entries(TEXTURES) as Array<[keyof typeof TEXTURES, string]>;
    const loaded = await Promise.all(
      entries.map(async ([key, name]) => [key, await Assets.load(`${BASE}assets/${name}.webp`)]),
    );
    this.textures = Object.fromEntries(loaded) as Record<keyof typeof TEXTURES, Texture>;
    // 벽 텍스처는 Graphics 텍스처 필로 타일링되므로 반복 샘플링 필요
    for (const key of ['wallStone', 'wallCave', 'wallAbyss'] as const) {
      this.textures[key].source.addressMode = 'repeat';
    }

    // 바닥: 화면 고정 타일링, 카메라 오프셋으로 스크롤. y는 투영 압축분만큼 눌러 지면 원근 일치.
    this.floor = new TilingSprite({ texture: this.textures.floor });
    this.floor.tileScale.set(0.5 * this.zoom, 0.5 * this.zoom * PROJ); // 512px 원본 → 256px 타일
    this.floor.tint = 0x9a938a; // 살짝 어둡게
    this.app.stage.addChild(this.floor);

    this.app.stage.addChild(this.world);
    this.world.scale.set(this.zoom, this.zoom * PROJ); // 줌 + 지면 압축 — 월드 자식은 심 좌표 그대로

    // 플레이어 광원: 화면 중앙 고정(카메라가 플레이어를 중앙에 두므로), 가산 블렌드
    this.light = new Sprite(
      radialTexture(700, [
        [0, 'rgba(255,180,90,0.32)'],
        [0.5, 'rgba(255,150,70,0.12)'],
        [1, 'rgba(0,0,0,0)'],
      ]),
    );
    this.light.anchor.set(0.5);
    this.light.blendMode = 'add';
    this.app.stage.addChild(this.light);

    // 시야 fog: 시야 반경(타원) 밖을 어둠으로 차단. 중심 투명 → 가장자리 불투명 원형
    // 그라데이션 텍스처를 화면 중앙(=플레이어)에 고정하고, 크기만 시야 배율에 따라 갱신한다.
    // f=0.5 지점이 실효 시야 반경에 대응 (스프라이트 폭 = 시야×4×줌).
    this.fog = new Sprite(
      radialTexture(1024, [
        [0, 'rgba(5,4,8,0)'],
        [0.24, 'rgba(5,4,8,0)'],
        [0.38, 'rgba(5,4,8,0.55)'],
        [0.5, 'rgba(5,4,8,1)'],
        [1, 'rgba(5,4,8,1)'],
      ]),
    );
    this.fog.anchor.set(0.5);
    this.app.stage.addChild(this.fog);

    // 비네트: 화면 가장자리를 어둠으로 잠식
    this.vignette = new Sprite(
      radialTexture(1024, [
        [0, 'rgba(0,0,0,0)'],
        [0.55, 'rgba(0,0,0,0)'],
        [0.8, 'rgba(5,4,6,0.55)'],
        [1, 'rgba(5,4,6,0.92)'],
      ]),
    );
    this.vignette.anchor.set(0.5);
    this.app.stage.addChild(this.vignette);

    // 월드 레이어 순서: 벽 → 횃불 → 그림자 → 조준링 → 드롭 → 엔티티(y정렬) → 투사체 → 이펙트
    this.world.addChild(this.walls);
    this.world.addChild(this.torchLayer);
    this.world.addChild(this.shadowsG);
    this.world.addChild(this.aimG);
    this.world.addChild(this.dropsG);
    this.world.addChild(this.portalG);
    this.entityLayer.sortableChildren = true; // zIndex = 월드 y — 아래쪽이 앞에 그려진다
    this.world.addChild(this.entityLayer);
    this.playerAnim = await loadAnimSet(BASE, 'player', PLAYER_CLIPS, 16, true);
    this.enemyAnim = {
      ghoul: await loadAnimSet(BASE, 'ghoul', ENEMY_CLIPS, 8, false),
      archer: await loadAnimSet(BASE, 'archer', ENEMY_CLIPS, 8, true),
      brute: await loadAnimSet(BASE, 'brute', ENEMY_CLIPS, 8, true),
    };
    this.playerSprite = new Container();
    this.playerChar = new Sprite(this.playerAnim.tex.idle.char[0][0]);
    this.playerWeapon = new Sprite(this.playerAnim.tex.idle.weapon![0][0]);
    for (const sp of [this.playerChar, this.playerWeapon]) {
      sp.anchor.set(0.5, 0.72); // 발 위치가 논리 좌표에 오도록
      sp.scale.set(0.62); // 128px 셀 → 표시 약 80px
      this.playerSprite.addChild(sp);
    }
    this.playerSprite.scale.y = 1 / PROJ; // 빌보드 역보정 — 압축 월드 안에서 수직으로 선다
    this.entityLayer.addChild(this.playerSprite);
    this.world.addChild(this.projectilesG);
    this.world.addChild(this.fx); // 이펙트는 엔티티 위에 그린다

    this.layout();
    window.addEventListener('resize', () => this.layout());
  }

  private layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.floor.width = w;
    this.floor.height = h;
    this.light.position.set(w / 2, h / 2);
    this.fog.position.set(w / 2, h / 2);
    this.vignette.position.set(w / 2, h / 2);
    const cover = Math.max(w, h) * 1.45;
    this.vignette.width = cover;
    this.vignette.height = cover;
  }

  private zoom = ZOOM_DEFAULT;

  getZoom(): number {
    return this.zoom;
  }

  // 클램프 후 실제 적용값을 돌려준다 — 호출자가 저장·표시에 그대로 쓴다
  setZoom(z: number): number {
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    return this.zoom;
  }

  toWorld = (sx: number, sy: number): { x: number; y: number } => ({
    x: (sx - this.world.position.x) / this.zoom,
    y: (sy - this.world.position.y) / (this.zoom * PROJ), // 줌·지면 압축 역적용
  });

  private lightTexCache = new Map<Biome, Texture>();
  private glowTexCache = new Map<Biome, Texture>();

  // 던전 교체 시 정적 지형·소품·팔레트 재구축, 엔티티 스프라이트 초기화
  setDungeon(d: Dungeon): void {
    this.dungeonRef = d;
    const vis = BIOME_VISUALS[d.biome];

    this.floor.texture = this.textures[vis.floorKey];
    this.floor.tint = vis.floorTint;
    if (!this.lightTexCache.has(d.biome)) {
      this.lightTexCache.set(d.biome, radialTexture(700, vis.lightStops));
    }
    this.light.texture = this.lightTexCache.get(d.biome)!;

    const g = this.walls;
    g.clear();
    const W = d.w * TILE;
    const H = d.h * TILE;
    const M = 4000; // 외곽 어둠 마진
    g.rect(-M, -M, W + M * 2, M) // 상
      // 하 — 최남단 벽 상판이 위로 밀리며 남는 틈까지 덮는다
      .rect(-M, H - WALL_RISE_L, W + M * 2, M + WALL_RISE_L)
      .rect(-M, 0, M, H) // 좌
      .rect(W, 0, M, H) // 우
      .fill(vis.wallFill); // 벽 상판 기본색과 동일 — 맵 경계가 벽 덩어리에 녹아들게
    for (let ty = 0; ty < d.h; ty++) {
      for (let tx = 0; tx < d.w; tx++) {
        if (!isWall(d, tx, ty)) continue;
        // 평면 언더레이 — 입체 벽 조각 사이 이음새로 바닥 텍스처가 새지 않게 하는 안전망.
        // 상판 기본색과 동일해야 조각이 덮지 못하는 맵 최남단 띠가 이질적으로 보이지 않는다.
        g.rect(tx * TILE, ty * TILE, TILE, TILE).fill(vis.wallFill);
      }
    }
    // 접지 AO — 벽 입면이 닿는 바닥에 드리우는 그림자 (가장 싼 깊이 단서)
    for (let ty = 0; ty < d.h; ty++) {
      for (let tx = 0; tx < d.w; tx++) {
        if (!isWall(d, tx, ty) || isWall(d, tx, ty + 1)) continue;
        g.rect(tx * TILE, (ty + 1) * TILE, TILE, 14).fill({ color: 0x000000, alpha: 0.2 });
        g.rect(tx * TILE, (ty + 1) * TILE, TILE, 6).fill({ color: 0x000000, alpha: 0.28 });
      }
    }
    this.buildWallPieces(d, vis);

    this.torchLayer.removeChildren().forEach((c) => c.destroy({ children: false }));
    this.torchGlows = [];
    if (!this.glowTexCache.has(d.biome)) {
      this.glowTexCache.set(d.biome, radialTexture(360, vis.glowStops));
    }
    const glowTex = this.glowTexCache.get(d.biome)!;
    for (const t of d.torches) {
      const glow = new Sprite(glowTex);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.position.set(t.x, t.y + 10);
      this.torchLayer.addChild(glow);
      this.torchGlows.push(glow);
      const prop = new Sprite(this.textures[vis.propKey]);
      prop.anchor.set(0.5, 0.6);
      prop.scale.set(44 / 256, 44 / 256 / PROJ); // 빌보드 역보정
      prop.position.set(t.x, t.y);
      this.torchLayer.addChild(prop);
    }

    for (const entry of this.enemySprites.values()) entry.root.destroy({ children: true });
    this.enemySprites.clear();
    this.enemyPrevPos.clear();
    for (const sp of this.dropSprites.values()) sp.destroy();
    this.dropSprites.clear();
    for (const c of this.corpses) c.sp.destroy();
    this.corpses = [];
    this.projectilesG.clear();
    this.dropsG.clear();
    this.shadowsG.clear();
  }

  private wallPieces: Graphics[] = [];

  // 입체 벽: 행 단위로 병합한 조각을 엔티티 레이어에 y-정렬로 편입한다.
  // 상판은 화면 위로 WALL_RISE만큼 밀린 지붕(지면 평면 — 월드 압축이 원근 담당),
  // 남향 입면은 세로 밴드 그라데이션의 수직면. zIndex=남쪽 모서리이므로
  // 벽 북쪽(뒤)에 선 캐릭터는 벽에 가려진다 — 입체감의 핵심 오클루전.
  private buildWallPieces(d: Dungeon, vis: BiomeVisual): void {
    for (const p of this.wallPieces) p.destroy();
    this.wallPieces = [];
    for (let ty = 0; ty < d.h; ty++) {
      let tx = 0;
      while (tx < d.w) {
        if (!isWall(d, tx, ty)) {
          tx++;
          continue;
        }
        let end = tx;
        while (end + 1 < d.w && isWall(d, end + 1, ty)) end++;
        const piece = new Graphics();
        const x0 = tx * TILE;
        const runW = (end - tx + 1) * TILE;
        const yTop = ty * TILE - WALL_RISE_L;
        // 상판: 어두운 단색 + 미세 질감 오버레이 — 벽 덩어리는 음영 공간으로 남아야
        // 바닥과 혼동되지 않는다 (텍스처를 강하게 깔면 "또 다른 바닥"으로 읽힘)
        const wallTex = this.textures[vis.wallKey];
        const texM = new Matrix().scale(0.125, 0.125); // 1024px 원본 → 128 월드px 반복
        piece.rect(x0, yTop, runW, TILE).fill(vis.wallFill);
        piece
          .rect(x0, yTop, runW, TILE)
          .fill({ texture: wallTex, matrix: texM, color: 0x8a837a, alpha: 0.14 });
        // 북쪽 모서리 림 — 노출된 모서리(위가 벽이 아님)에만. 내부까지 그리면 벽 덩어리가 줄무늬가 된다.
        for (let rx = tx; rx <= end; rx++) {
          if (isWall(d, rx, ty - 1)) continue;
          let re = rx;
          while (re + 1 <= end && !isWall(d, re + 1, ty - 1)) re++;
          piece
            .rect(rx * TILE, yTop, (re - rx + 1) * TILE, 4)
            .fill({ color: vis.wallHighlight, alpha: 0.45 });
          rx = re;
        }
        // 남향 입면 — 아래가 바닥인 구간만. 위 밝음 → 바닥 어둠 5단 밴드
        for (let fx = tx; fx <= end; fx++) {
          if (isWall(d, fx, ty + 1)) continue;
          let fe = fx;
          while (fe + 1 <= end && !isWall(d, fe + 1, ty + 1)) fe++;
          const fx0 = fx * TILE;
          const fw = (fe - fx + 1) * TILE;
          const fyTop = (ty + 1) * TILE - WALL_RISE_L;
          // 입면: 벽 텍스처(밝게) + 아래로 갈수록 어두워지는 오버레이 — 위에서 내려오는 조명
          piece
            .rect(fx0, fyTop, fw, WALL_RISE_L)
            .fill({ texture: wallTex, matrix: texM, color: vis.floorTint });
          const bands = 6;
          for (let b = 0; b < bands; b++) {
            piece
              .rect(fx0, fyTop + (WALL_RISE_L * b) / bands, fw, WALL_RISE_L / bands + 0.5)
              .fill({ color: 0x000000, alpha: 0.55 * (b / bands) });
          }
          piece.rect(fx0, fyTop, fw, 2.5).fill({ color: 0xffffff, alpha: 0.1 }); // 상단 조명 림
          fx = fe;
        }
        piece.zIndex = (ty + 1) * TILE;
        this.entityLayer.addChild(piece);
        this.wallPieces.push(piece);
        tx = end + 1;
      }
    }
  }

  private propSprites: Sprite[] = [];
  private portalG = new Graphics();
  private portalPos: { x: number; y: number } | null = null;
  private portalSpin = 0;

  // 프로시저럴 애니메이션 상태 (전부 렌더 전용 — 시뮬레이션 무관)
  private shadowsG = new Graphics();
  private aimG = new Graphics(); // 조준 링 네비게이터 (연속 각도 — 스프라이트 양자화 보완)
  private entityLayer = new Container(); // 플레이어·몬스터·시체 — y-정렬 대상
  private shadowJobs: Array<{ x: number; y: number; r: number; lift: number }> = [];
  private enemyPrevPos = new Map<number, { x: number; y: number }>();
  private corpses: Array<{ sp: Sprite; life: number; spin: number }> = [];

  // 공격 순간 호출 (main의 이벤트 배선에서) — 슬래시 클립 원샷 재생
  playerLunge(): void {
    this.slashMs = (PLAYER_CLIPS.slash.frames / PLAYER_CLIPS.slash.fps) * 1000;
  }

  private drawShadows(): void {
    const g = this.shadowsG;
    g.clear();
    for (const s of this.shadowJobs) {
      const shrink = 1 - Math.min(0.4, s.lift * 0.06); // 떠 있을수록 그림자 축소
      g.ellipse(s.x, s.y, s.r * 1.05 * shrink, s.r * 0.68 * shrink).fill({
        color: 0x000000,
        alpha: 0.32,
      });
    }
    this.shadowJobs = [];
  }

  private updateCorpses(dtMs: number): void {
    for (const c of this.corpses) {
      c.life -= dtMs;
      const t = Math.max(0, c.life / 400);
      c.sp.alpha = t * 0.9;
      c.sp.rotation += c.spin * dtMs * 0.004;
      c.sp.scale.y = Math.abs(c.sp.scale.y) * 0.985 * Math.sign(c.sp.scale.y);
      c.sp.position.y += dtMs * 0.015;
    }
    this.corpses = this.corpses.filter((c) => {
      if (c.life > 0) return true;
      c.sp.destroy();
      return false;
    });
  }

  // 은신처 스테이션 등 고정 소품 배치 (던전 교체 시 setDungeon 뒤에 호출)
  // 엔티티 레이어에 넣어 플레이어와 y-정렬 — 소품 앞뒤로 자연스럽게 지나다닌다.
  setProps(props: Array<{ texKey: keyof typeof TEXTURES; pos: { x: number; y: number } }>): void {
    for (const sp of this.propSprites) sp.destroy();
    this.propSprites = [];
    for (const p of props) {
      const sp = new Sprite(this.textures[p.texKey]);
      sp.anchor.set(0.5, 0.7);
      sp.scale.set(84 / 256, 84 / 256 / PROJ); // 빌보드 역보정
      sp.position.set(p.pos.x, p.pos.y);
      sp.zIndex = p.pos.y;
      this.entityLayer.addChild(sp);
      this.propSprites.push(sp);
    }
  }

  setPortal(pos: { x: number; y: number } | null): void {
    this.portalPos = pos;
    if (!pos) this.portalG.clear();
  }

  private drawPortal(dtMs: number): void {
    if (!this.portalPos) return;
    this.portalSpin += dtMs * 0.004;
    const g = this.portalG;
    const { x, y } = this.portalPos;
    g.clear();
    g.circle(x, y, 26).fill({ color: 0x46f0c8, alpha: 0.12 });
    for (let ring = 0; ring < 2; ring++) {
      const r = 20 + ring * 8;
      const spin = this.portalSpin * (ring === 0 ? 1 : -0.7);
      for (let i = 0; i < 3; i++) {
        const a = spin + (i * Math.PI * 2) / 3;
        g.arc(x, y, r, a, a + 1.4).stroke({ color: 0x6affdd, width: 3 - ring, alpha: 0.85 });
      }
    }
    g.circle(x, y, 5 + Math.sin(this.portalSpin * 3) * 2).fill({ color: 0xd8fff4, alpha: 0.9 });
  }

  // 시야 판정: 거리 + 벽 차폐(LoS). 시뮬레이션은 이를 모르며 렌더 표시에만 쓴다.
  private isSeen(s: GameState, pos: { x: number; y: number }): boolean {
    if (!this.fogOn) return true;
    const p = s.player;
    const d = Math.hypot(pos.x - p.pos.x, pos.y - p.pos.y);
    return d <= T.visionRange * p.visionMul && hasLineOfSight(this.dungeonRef, p.pos, pos);
  }

  private fogOn = true;

  // 은신처 같은 안전지대는 fog 없이 전부 보여준다 (상인·스테이션 발견성)
  setFog(on: boolean): void {
    this.fogOn = on;
    this.fog.visible = on;
  }

  draw(s: GameState, dtMs: number): void {
    this.updateCamera(s, dtMs);
    // fog·광원 크기를 시야 배율에 맞춰 갱신 — 시야 아이템이 visionMul을 올리면 즉시 반영
    const vision = T.visionRange * s.player.visionMul;
    this.fog.width = vision * 4 * this.zoom;
    this.fog.height = vision * 4 * this.zoom * PROJ;
    this.light.width = this.light.height = vision * 2.4 * this.zoom;
    this.drawPlayer(s, dtMs);
    this.drawAim(s);
    this.drawEnemies(s);
    this.drawProjectiles(s);
    this.drawDrops(s);
    this.drawShadows();
    this.updateCorpses(dtMs);
    this.drawPortal(dtMs);
    for (const glow of this.torchGlows) glow.alpha = 0.8 + Math.random() * 0.2;
    this.effects.tick(dtMs);
  }

  // 조준 링: 바닥 원근(타원)에 눕힌 링 + 커서 방향 하이라이트 호 + 화살촉.
  // 연속 각도로 그려져 16방향 스프라이트가 못 주는 정확한 조준 피드백을 담당한다.
  private drawAim(s: GameState): void {
    const p = s.player;
    const g = this.aimG;
    g.clear();
    const cx = p.pos.x;
    const cy = p.pos.y + 9; // 발밑 그림자 평면과 동일
    const rx = 24;
    const squash = 1; // 월드 압축이 지면 원근을 만들므로 로컬은 정원 — 화면상 sin38° 타원
    const ry = rx * squash;

    g.ellipse(cx, cy, rx, ry).stroke({ color: 0xd8cdb8, width: 1.5, alpha: 0.16 });

    const a = p.facing;
    const span = 0.38;
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const ang = a - span + (2 * span * i) / steps;
      const x = cx + Math.cos(ang) * rx;
      const y = cy + Math.sin(ang) * ry;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke({ color: 0xe6d8b8, width: 2.5, alpha: 0.9 });

    // 화살촉 (타원 바깥으로 살짝 돌출)
    const tipX = cx + Math.cos(a) * (rx + 7);
    const tipY = cy + Math.sin(a) * (ry + 7 * squash);
    const baseX = cx + Math.cos(a) * rx;
    const baseY = cy + Math.sin(a) * ry;
    const perp = a + Math.PI / 2;
    const w = 3.5;
    g.moveTo(tipX, tipY)
      .lineTo(baseX + Math.cos(perp) * w, baseY + Math.sin(perp) * w * squash)
      .lineTo(baseX - Math.cos(perp) * w, baseY - Math.sin(perp) * w * squash)
      .closePath()
      .fill({ color: 0xe6d8b8, alpha: 0.9 });
  }

  private drawProjectiles(s: GameState): void {
    const g = this.projectilesG;
    g.clear();
    for (const pr of s.projectiles) {
      if (!this.isSeen(s, pr.pos)) continue; // 시야 밖 화살은 fog에서 나올 때 나타난다
      const tail = { x: pr.pos.x - pr.vel.x * 0.04, y: pr.pos.y - pr.vel.y * 0.04 };
      g.moveTo(tail.x, tail.y).lineTo(pr.pos.x, pr.pos.y).stroke({ color: 0x6a1d1d, width: 3 });
      g.circle(pr.pos.x, pr.pos.y, pr.radius).fill(0xc03a2a);
    }
  }

  private drawDrops(s: GameState): void {
    const g = this.dropsG;
    g.clear();
    const alive = new Set<number>();
    const pulse = 1 + 0.15 * Math.sin(s.tick * 0.15);
    for (const d of s.drops) {
      alive.add(d.id);
      const seen = this.isSeen(s, d.pos); // 시야 밖 전리품도 숨긴다 — 접근해야 드러난다
      if (d.item) {
        let sp = this.dropSprites.get(d.id);
        if (!sp) {
          sp = new Sprite(this.textures.core);
          sp.anchor.set(0.5);
          sp.scale.set(30 / 256, 30 / 256 / PROJ); // 빌보드 역보정
          sp.tint = RARITY_TINT[d.item.rarity];
          this.world.addChildAt(sp, this.world.getChildIndex(this.dropsG));
          this.dropSprites.set(d.id, sp);
        }
        sp.visible = seen;
        const bob = Math.sin(s.tick * 0.1 + d.id) * 3;
        sp.position.set(d.pos.x, d.pos.y + bob);
        if (seen) this.shadowJobs.push({ x: d.pos.x, y: d.pos.y + 10, r: 8, lift: 3 - bob });
      } else if (seen) {
        g.circle(d.pos.x, d.pos.y, 7 * pulse).fill(0xb08d3e);
        g.circle(d.pos.x, d.pos.y, 3.5 * pulse).fill(0xe6c878);
        this.shadowJobs.push({ x: d.pos.x, y: d.pos.y + 6, r: 6, lift: 0 });
      }
    }
    for (const [id, sp] of this.dropSprites) {
      if (!alive.has(id)) {
        sp.destroy();
        this.dropSprites.delete(id);
      }
    }
  }

  private updateCamera(s: GameState, dtMs: number): void {
    this.shake = Math.max(0, this.shake - dtMs * 0.05);
    // 렌더 전용 난수 — 시뮬레이션 결정론과 무관
    const ox = (Math.random() - 0.5) * this.shake;
    const oy = (Math.random() - 0.5) * this.shake;
    // 줌은 런타임 가변 — 매 프레임 스케일·카메라에 반영
    this.world.scale.set(this.zoom, this.zoom * PROJ);
    this.floor.tileScale.set(0.5 * this.zoom, 0.5 * this.zoom * PROJ);
    const camX = window.innerWidth / 2 - s.player.pos.x * this.zoom + ox;
    const camY = window.innerHeight / 2 - s.player.pos.y * this.zoom * PROJ + oy;
    this.world.position.set(camX, camY);
    this.floor.tilePosition.set(camX, camY);
    // 광원 미세 흔들림(횃불 느낌)
    this.light.alpha = 0.92 + Math.random() * 0.08;
  }

  private drawPlayer(s: GameState, dtMs: number): void {
    const p = s.player;
    const g = this.playerSprite;
    const moving = Math.abs(p.vel.x) + Math.abs(p.vel.y) > 1;
    this.slashMs = Math.max(0, this.slashMs - dtMs);

    const clip: PlayerClip = this.slashMs > 0 ? 'slash' : moving ? 'walk' : 'idle';
    const spec = PLAYER_CLIPS[clip];
    const dir = dirFromAngle(p.facing, this.playerAnim.dirs);
    let frame: number;
    if (clip === 'slash') {
      // 원샷: 남은 시간으로 진행도 계산
      const total = (spec.frames / spec.fps) * 1000;
      frame = Math.min(spec.frames - 1, Math.floor(((total - this.slashMs) / total) * spec.frames));
    } else {
      // 루프: 시뮬레이션 tick 기반 → 히트스톱 때 자동 정지
      frame = Math.floor((s.tick / 60) * spec.fps) % spec.frames;
    }
    const tex = this.playerAnim.tex[clip];
    this.playerChar.texture = tex.char[dir][frame];
    this.playerWeapon.texture = tex.weapon![dir][frame];

    g.position.set(p.pos.x, p.pos.y);
    g.zIndex = p.pos.y; // y-정렬
    const blink = p.invulnTimer > 0 && Math.floor(p.invulnTimer * 20) % 2 === 0;
    g.alpha = p.dashTimer > 0 ? 0.55 : blink ? 0.4 : 1;

    this.shadowJobs.push({ x: p.pos.x, y: p.pos.y + 9, r: p.radius, lift: 0 });
  }

  private drawEnemies(s: GameState): void {
    const alive = new Set<number>();
    const displayScale: Record<EnemyKind, number> = { ghoul: 0.5, archer: 0.5, brute: 0.78 };
    for (const e of s.enemies) {
      alive.add(e.id);
      let entry = this.enemySprites.get(e.id);
      if (!entry) {
        const root = new Container();
        const anim = this.enemyAnim[e.kind];
        const char = new Sprite(anim.tex.idle.char[0][0]);
        char.anchor.set(0.5, 0.72);
        root.addChild(char);
        let weapon: Sprite | null = null;
        if (anim.tex.idle.weapon) {
          weapon = new Sprite(anim.tex.idle.weapon[0][0]);
          weapon.anchor.set(0.5, 0.72);
          root.addChild(weapon);
        }
        root.scale.set(displayScale[e.kind], displayScale[e.kind] / PROJ); // 빌보드 역보정
        this.entityLayer.addChild(root);
        // 초기 방향은 개체별 분산 — 스폰 직후 전원이 3시 방향(행 0)을 보는 인위적 정렬 방지
        entry = {
          root,
          char,
          weapon,
          lastDir: e.id % this.enemyAnim[e.kind].dirs,
          stillFrames: 99,
          striking: false,
        };
        this.enemySprites.set(e.id, entry);
      }
      // 이동 감지: 프레임 간 위치 델타 (넉백·추적 모두 반영)
      // 히스테리시스: 이동 진입은 즉시, 정지 전환은 8프레임 연속 정지 후 —
      // 임계값 근처 진동(배회 저속·분리 밀림·벽 클램프)이 walk↔idle 클립을
      // 고속 교차시켜 잔상처럼 보이는 문제를 차단한다.
      const prev = this.enemyPrevPos.get(e.id) ?? { x: e.pos.x, y: e.pos.y };
      const deltaX = e.pos.x - prev.x;
      const deltaY = e.pos.y - prev.y;
      const movingDist = Math.hypot(deltaX, deltaY);
      this.enemyPrevPos.set(e.id, { x: e.pos.x, y: e.pos.y });
      if (movingDist > 0.25) entry.stillFrames = 0;
      else entry.stillFrames = Math.min(99, entry.stillFrames + 1);
      const moving = entry.stillFrames < 8;

      // 상태 선택: 근접형은 타격 거리, 궁수는 사격 범위에서 공격 클립
      const p = s.player;
      const dist = Math.hypot(p.pos.x - e.pos.x, p.pos.y - e.pos.y);
      // 공격 자세도 히스테리시스: 진입·이탈 경계를 벌려 접촉 거리 진동에 흔들리지 않게
      const enterStrike =
        e.kind === 'archer'
          ? dist <= ENEMIES.archer.preferMax + 60 && !moving
          : dist <= e.radius + p.radius + 26;
      const exitStrike =
        e.kind === 'archer'
          ? dist > ENEMIES.archer.preferMax + 100 || moving
          : dist > e.radius + p.radius + 48;
      if (enterStrike) entry.striking = true;
      else if (exitStrike) entry.striking = false;
      const inStrike = e.aggro && entry.striking;
      const clip: EnemyClip = inStrike ? 'attack' : moving ? 'walk' : 'idle';
      const anim = this.enemyAnim[e.kind];
      const spec = anim.clips[clip];
      // 개체별 위상 오프셋으로 군집 동기화 방지. tick 기반 → 히트스톱 동기
      const frame = Math.floor((s.tick / 60) * spec.fps + e.id * 1.7) % spec.frames;
      // 방향: 걷기=이동 방향(문워크 방지), 공격=플레이어, 정지=어그로면 플레이어·아니면 유지.
      // 피격 넉백으로 밀리는 동안엔 방향을 바꾸지 않는다.
      let dir = entry.lastDir;
      const toPlayerDir = dirFromAngle(
        Math.atan2(p.pos.y - e.pos.y, p.pos.x - e.pos.x),
        anim.dirs,
      );
      if (clip === 'attack') dir = toPlayerDir;
      else if (clip === 'walk' && e.hitFlash === 0 && movingDist > 0.25) {
        // 실제 이동 델타가 있을 때만 방향 갱신 — 델타 0 프레임에서 atan2(0,0)=0(3시 방향)으로
        // 스냅되는 버그 방지. 정지 유예 구간에는 마지막 방향을 유지한다.
        dir = dirFromAngle(Math.atan2(deltaY, deltaX), anim.dirs);
      } else if (clip === 'idle' && e.aggro) dir = toPlayerDir;
      entry.lastDir = dir;
      entry.char.texture = anim.tex[clip].char[dir][frame];
      if (entry.weapon && anim.tex[clip].weapon) {
        entry.weapon.texture = anim.tex[clip].weapon[dir][frame];
      }

      // 피격: 팽창 펄스 + 적색 틴트
      const flash = e.hitFlash > 0 ? e.hitFlash / 0.1 : 0;
      entry.root.position.set(e.pos.x, e.pos.y);
      entry.root.zIndex = e.pos.y; // y-정렬
      const pulse = displayScale[e.kind] * (1 + flash * 0.18);
      entry.root.scale.set(pulse, pulse / PROJ);
      const tint = e.hitFlash > 0 ? 0xff6a5a : 0xffffff;
      entry.char.tint = tint;
      if (entry.weapon) entry.weapon.tint = tint;

      // 시야 게이팅: 시야 밖(거리·벽 차폐) 몬스터는 그리지 않는다 — 시뮬레이션은 계속 돈다
      const seen = this.isSeen(s, e.pos);
      entry.root.visible = seen;
      if (seen) this.shadowJobs.push({ x: e.pos.x, y: e.pos.y + 8, r: e.radius, lift: 0 });
    }
    for (const [id, entry] of this.enemySprites) {
      if (!alive.has(id)) {
        // 시체 페이드: 마지막 프레임 텍스처로 쓰러지는 연출
        const corpse = new Sprite(entry.char.texture);
        corpse.anchor.set(0.5, 0.72);
        corpse.position.copyFrom(entry.root.position);
        corpse.scale.copyFrom(entry.root.scale);
        corpse.visible = entry.root.visible; // 시야 밖에서 죽으면 시체 연출도 생략
        corpse.zIndex = corpse.position.y - 1; // 산 자들보다 살짝 뒤
        this.entityLayer.addChild(corpse);
        this.corpses.push({ sp: corpse, life: 400, spin: 1 });
        entry.root.destroy({ children: true });
        this.enemySprites.delete(id);
        this.enemyPrevPos.delete(id);
      }
    }
  }
}
