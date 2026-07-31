import { Application, Assets, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { isWall, TILE, type Biome, type Dungeon } from '../game/dungeon';
import type { EnemyKind, GameState } from '../game/state';
import { Effects } from './effects';

const RARITY_TINT = { common: 0xcfc4a8, rare: 0x6a9ad0, epic: 0xb060d0 } as const;

const BASE = import.meta.env.BASE_URL;

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
} as const;

// 바이옴별 팔레트·텍스처. 지형 프리셋은 dungeon.ts, 시각 연출은 여기.
interface BiomeVisual {
  floorKey: 'floor' | 'floorCave' | 'floorAbyss';
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
  private vignette!: Sprite;
  private playerSprite!: Sprite;
  private enemySprites = new Map<number, Sprite>();
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
      entries.map(async ([key, name]) => [key, await Assets.load(`${BASE}assets/${name}.png`)]),
    );
    this.textures = Object.fromEntries(loaded) as Record<keyof typeof TEXTURES, Texture>;

    // 바닥: 화면 고정 타일링, 카메라 오프셋으로 스크롤
    this.floor = new TilingSprite({ texture: this.textures.floor });
    this.floor.tileScale.set(0.5); // 512px 원본 → 256px 타일
    this.floor.tint = 0x9a938a; // 살짝 어둡게
    this.app.stage.addChild(this.floor);

    this.app.stage.addChild(this.world);

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

    // 월드 레이어 순서: 벽 → 횃불 → 그림자 → 드롭 → 적 → 플레이어 → 투사체 → 이펙트
    this.world.addChild(this.walls);
    this.world.addChild(this.torchLayer);
    this.world.addChild(this.shadowsG);
    this.world.addChild(this.dropsG);
    this.playerSprite = new Sprite(this.textures.player);
    this.playerSprite.anchor.set(0.5, 0.62); // 발 밑 그림자 부근이 논리 위치에 오도록
    this.world.addChild(this.playerSprite);
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
    this.vignette.position.set(w / 2, h / 2);
    const cover = Math.max(w, h) * 1.45;
    this.vignette.width = cover;
    this.vignette.height = cover;
  }

  toWorld = (sx: number, sy: number): { x: number; y: number } => ({
    x: sx - this.world.position.x,
    y: sy - this.world.position.y,
  });

  private lightTexCache = new Map<Biome, Texture>();
  private glowTexCache = new Map<Biome, Texture>();

  // 던전 교체 시 정적 지형·소품·팔레트 재구축, 엔티티 스프라이트 초기화
  setDungeon(d: Dungeon): void {
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
      .rect(-M, H, W + M * 2, M) // 하
      .rect(-M, 0, M, H) // 좌
      .rect(W, 0, M, H) // 우
      .fill(0x0c0a08);
    for (let ty = 0; ty < d.h; ty++) {
      for (let tx = 0; tx < d.w; tx++) {
        if (!isWall(d, tx, ty)) continue;
        g.rect(tx * TILE, ty * TILE, TILE, TILE).fill(vis.wallFill);
        if (!isWall(d, tx, ty + 1)) {
          // 아래가 바닥이면 벽면 하이라이트
          g.rect(tx * TILE, ty * TILE + TILE - 5, TILE, 5).fill(vis.wallHighlight);
        }
      }
    }

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
      prop.scale.set(44 / 256);
      prop.position.set(t.x, t.y);
      this.torchLayer.addChild(prop);
    }

    for (const sp of this.enemySprites.values()) sp.destroy();
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

  private propsLayer = new Container();
  private portalG = new Graphics();
  private portalPos: { x: number; y: number } | null = null;
  private portalSpin = 0;

  // 프로시저럴 애니메이션 상태 (전부 렌더 전용 — 시뮬레이션 무관)
  private shadowsG = new Graphics();
  private shadowJobs: Array<{ x: number; y: number; r: number; lift: number }> = [];
  private lungeMs = 0; // 공격 런지 잔여(ms)
  private enemyPrevPos = new Map<number, { x: number; y: number }>();
  private corpses: Array<{ sp: Sprite; life: number; spin: number }> = [];

  // 공격 순간 호출 (main의 이벤트 배선에서)
  playerLunge(): void {
    this.lungeMs = 120;
  }

  private drawShadows(): void {
    const g = this.shadowsG;
    g.clear();
    for (const s of this.shadowJobs) {
      const shrink = 1 - Math.min(0.4, s.lift * 0.06); // 떠 있을수록 그림자 축소
      g.ellipse(s.x, s.y, s.r * 1.05 * shrink, s.r * 0.42 * shrink).fill({
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
  setProps(props: Array<{ texKey: keyof typeof TEXTURES; pos: { x: number; y: number } }>): void {
    this.propsLayer.removeChildren().forEach((c) => c.destroy());
    if (!this.propsLayer.parent) {
      this.world.addChildAt(this.propsLayer, this.world.getChildIndex(this.playerSprite));
      this.world.addChildAt(this.portalG, this.world.getChildIndex(this.playerSprite));
    }
    for (const p of props) {
      const sp = new Sprite(this.textures[p.texKey]);
      sp.anchor.set(0.5, 0.7);
      sp.scale.set(84 / 256);
      sp.position.set(p.pos.x, p.pos.y);
      this.propsLayer.addChild(sp);
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

  draw(s: GameState, dtMs: number): void {
    this.updateCamera(s, dtMs);
    this.drawPlayer(s, dtMs);
    this.drawEnemies(s);
    this.drawProjectiles(s);
    this.drawDrops(s);
    this.drawShadows();
    this.updateCorpses(dtMs);
    this.drawPortal(dtMs);
    for (const glow of this.torchGlows) glow.alpha = 0.8 + Math.random() * 0.2;
    this.effects.tick(dtMs);
  }

  private drawProjectiles(s: GameState): void {
    const g = this.projectilesG;
    g.clear();
    for (const pr of s.projectiles) {
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
      if (d.item) {
        let sp = this.dropSprites.get(d.id);
        if (!sp) {
          sp = new Sprite(this.textures.core);
          sp.anchor.set(0.5);
          sp.scale.set(30 / 256);
          sp.tint = RARITY_TINT[d.item.rarity];
          this.world.addChildAt(sp, this.world.getChildIndex(this.dropsG));
          this.dropSprites.set(d.id, sp);
        }
        const bob = Math.sin(s.tick * 0.1 + d.id) * 3;
        sp.position.set(d.pos.x, d.pos.y + bob);
        this.shadowJobs.push({ x: d.pos.x, y: d.pos.y + 10, r: 8, lift: 3 - bob });
      } else {
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
    const camX = window.innerWidth / 2 - s.player.pos.x + ox;
    const camY = window.innerHeight / 2 - s.player.pos.y + oy;
    this.world.position.set(camX, camY);
    this.floor.tilePosition.set(camX, camY);
    // 광원 미세 흔들림(횃불 느낌)
    this.light.alpha = 0.92 + Math.random() * 0.08;
  }

  private drawPlayer(s: GameState, dtMs: number): void {
    const p = s.player;
    const g = this.playerSprite;
    const scale = 64 / 256; // 표시 높이 약 64px
    const faceLeft = Math.cos(p.facing) < 0;
    const moving = Math.abs(p.vel.x) + Math.abs(p.vel.y) > 1;
    const dashing = p.dashTimer > 0;

    // 걸음 위상은 시뮬레이션 tick 기반 — 히트스톱 때 자동으로 함께 멈춘다
    const phase = s.tick * 0.3;
    const hop = moving && !dashing ? Math.abs(Math.sin(phase)) * 3.5 : 0;
    // 착지 스쿼시(이동) / 호흡(정지) — 부피 보존을 위해 x·y 역보정
    const squash = moving
      ? 1 + Math.sin(phase * 2) * 0.05
      : 1 + Math.sin(s.tick * 0.05) * 0.015;
    let sx = scale * (2 - squash);
    let sy = scale * squash;
    if (dashing) {
      sx *= 1.18;
      sy *= 0.85;
    }
    g.scale.set(faceLeft ? -sx : sx, sy);

    // 공격 런지: 조준 방향으로 짧게 전진 + 회전 킥
    this.lungeMs = Math.max(0, this.lungeMs - dtMs);
    const lunge = this.lungeMs / 120; // 1→0
    const lx = Math.cos(p.facing) * lunge * 9;
    const ly = Math.sin(p.facing) * lunge * 9;

    g.position.set(p.pos.x + lx, p.pos.y - hop + ly);
    g.rotation =
      (faceLeft ? -1 : 1) * ((moving ? Math.sin(phase) * 0.055 : 0) + lunge * 0.12);

    const blink = p.invulnTimer > 0 && Math.floor(p.invulnTimer * 20) % 2 === 0;
    g.alpha = dashing ? 0.55 : blink ? 0.4 : 1;

    this.shadowJobs.push({ x: p.pos.x, y: p.pos.y + 9, r: p.radius, lift: hop });
  }

  private drawEnemies(s: GameState): void {
    const alive = new Set<number>();
    const tex: Record<EnemyKind, Texture> = {
      ghoul: this.textures.ghoul,
      archer: this.textures.archer,
      brute: this.textures.brute,
    };
    const displaySize: Record<EnemyKind, number> = { ghoul: 56, archer: 56, brute: 92 };
    for (const e of s.enemies) {
      alive.add(e.id);
      let sp = this.enemySprites.get(e.id);
      if (!sp) {
        sp = new Sprite(tex[e.kind]);
        sp.anchor.set(0.5, 0.62);
        // 플레이어 스프라이트 바로 아래 레이어에 삽입
        this.world.addChildAt(sp, this.world.getChildIndex(this.playerSprite));
        this.enemySprites.set(e.id, sp);
      }
      // 이동 감지: 프레임 간 위치 델타 (넉백·추적 모두 반영)
      const prev = this.enemyPrevPos.get(e.id) ?? { x: e.pos.x, y: e.pos.y };
      const movingDist = Math.hypot(e.pos.x - prev.x, e.pos.y - prev.y);
      this.enemyPrevPos.set(e.id, { x: e.pos.x, y: e.pos.y });
      const moving = movingDist > 0.15;

      const phase = s.tick * 0.24 + e.id * 1.7;
      const hop = moving ? Math.abs(Math.sin(phase)) * 2.5 : 0;
      const wobble = moving ? Math.sin(phase) * 0.09 : Math.sin(s.tick * 0.04 + e.id) * 0.02;

      const scale = displaySize[e.kind] / 256;
      const faceLeft = s.player.pos.x < e.pos.x;
      // 피격: 방향성 스쿼시(납작+팽창) — 단순 팽창보다 타격이 실린 느낌
      const flash = e.hitFlash > 0 ? e.hitFlash / 0.1 : 0;
      const sx = scale * (1 + flash * 0.35);
      const sy = scale * (1 - flash * 0.22);
      sp.position.set(e.pos.x, e.pos.y - hop);
      sp.scale.set(faceLeft ? -sx : sx, sy);
      sp.rotation = wobble;
      sp.tint = e.hitFlash > 0 ? 0xff6a5a : 0xffffff;

      this.shadowJobs.push({ x: e.pos.x, y: e.pos.y + 8, r: e.radius, lift: hop });
    }
    for (const [id, sp] of this.enemySprites) {
      if (!alive.has(id)) {
        // 시체 페이드: 같은 텍스처·변환으로 쓰러지는 연출
        const corpse = new Sprite(sp.texture);
        corpse.anchor.set(0.5, 0.62);
        corpse.position.copyFrom(sp.position);
        corpse.scale.copyFrom(sp.scale);
        corpse.rotation = sp.rotation;
        this.world.addChildAt(corpse, this.world.getChildIndex(this.playerSprite));
        this.corpses.push({ sp: corpse, life: 400, spin: sp.scale.x >= 0 ? 1 : -1 });
        sp.destroy();
        this.enemySprites.delete(id);
        this.enemyPrevPos.delete(id);
      }
    }
  }
}
