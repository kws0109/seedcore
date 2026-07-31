import { Application, Assets, Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { GameState } from '../game/state';
import { Effects } from './effects';

const BASE = import.meta.env.BASE_URL;

const TEXTURES = {
  player: 'player-knight',
  ghoul: 'enemy-ghoul',
  archer: 'enemy-archer',
  brute: 'enemy-brute',
  floor: 'floor-stone',
  torch: 'prop-torch',
  core: 'core-crystal',
} as const;

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

    this.playerSprite = new Sprite(this.textures.player);
    this.playerSprite.anchor.set(0.5, 0.62); // 발 밑 그림자 부근이 논리 위치에 오도록
    this.world.addChild(this.playerSprite);
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

  draw(s: GameState, dtMs: number): void {
    this.updateCamera(s, dtMs);
    this.drawPlayer(s);
    this.drawEnemies(s);
    this.effects.tick(dtMs);
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

  private drawPlayer(s: GameState): void {
    const p = s.player;
    const g = this.playerSprite;
    g.position.set(p.pos.x, p.pos.y);
    const scale = 64 / 256; // 표시 높이 약 64px
    const faceLeft = Math.cos(p.facing) < 0;
    g.scale.set(faceLeft ? -scale : scale, scale);
    // 이동 기울임 + 걸음 바운스 (틱 기반이라 히트스톱 때 자연히 멈춘다)
    const moving = Math.abs(p.vel.x) + Math.abs(p.vel.y) > 1;
    g.rotation = (faceLeft ? -1 : 1) * (moving ? 0.05 : 0);
    g.position.y += moving ? Math.sin(s.tick * 0.35) * 1.6 : 0;
    const blink = p.invulnTimer > 0 && Math.floor(p.invulnTimer * 20) % 2 === 0;
    g.alpha = p.dashTimer > 0 ? 0.55 : blink ? 0.4 : 1;
  }

  private drawEnemies(s: GameState): void {
    const alive = new Set<number>();
    for (const e of s.enemies) {
      alive.add(e.id);
      let sp = this.enemySprites.get(e.id);
      if (!sp) {
        sp = new Sprite(this.textures.ghoul);
        sp.anchor.set(0.5, 0.62);
        this.world.addChildAt(sp, 0); // 플레이어 뒤에
        this.enemySprites.set(e.id, sp);
      }
      sp.position.set(e.pos.x, e.pos.y + Math.sin(s.tick * 0.2 + e.id) * 1.2);
      const scale = 56 / 256;
      const faceLeft = s.player.pos.x < e.pos.x;
      const pop = 1 + e.hitFlash * 2; // 피격 순간 살짝 커졌다 복귀
      sp.scale.set((faceLeft ? -scale : scale) * pop, scale * pop);
      sp.tint = e.hitFlash > 0 ? 0xff6a5a : 0xffffff;
    }
    for (const [id, sp] of this.enemySprites) {
      if (!alive.has(id)) {
        sp.destroy();
        this.enemySprites.delete(id);
      }
    }
  }
}
