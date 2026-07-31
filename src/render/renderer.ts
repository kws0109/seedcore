import { Application, Container, Graphics } from 'pixi.js';
import type { GameState } from '../game/state';

const COLORS = {
  bg: '#08080c',
  player: 0x46f0c8,
  playerDash: 0x9fffe9,
  enemy: 0xf05a6e,
  enemyFlash: 0xffffff,
} as const;

export class Renderer {
  readonly app = new Application();
  readonly world = new Container(); // 카메라 변환 대상
  readonly fx = new Container(); // 이펙트 레이어
  shake = 0; // 남은 흔들림 강도(px)
  private playerG = new Graphics();
  private enemiesG = new Graphics();

  async init(): Promise<void> {
    await this.app.init({ background: COLORS.bg, resizeTo: window, antialias: true });
    document.body.appendChild(this.app.canvas);
    this.world.addChild(this.enemiesG, this.playerG, this.fx);
    this.app.stage.addChild(this.world);
  }

  // 화면 좌표 → 월드 좌표 (입력 에임에 사용)
  toWorld = (sx: number, sy: number): { x: number; y: number } => ({
    x: sx - this.world.position.x,
    y: sy - this.world.position.y,
  });

  draw(s: GameState, dtMs: number): void {
    this.updateCamera(s, dtMs);
    this.drawPlayer(s);
    this.drawEnemies(s);
  }

  private updateCamera(s: GameState, dtMs: number): void {
    this.shake = Math.max(0, this.shake - dtMs * 0.05);
    // 렌더 전용 난수 — 시뮬레이션 결정론과 무관
    const ox = (Math.random() - 0.5) * this.shake;
    const oy = (Math.random() - 0.5) * this.shake;
    this.world.position.set(
      window.innerWidth / 2 - s.player.pos.x + ox,
      window.innerHeight / 2 - s.player.pos.y + oy,
    );
  }

  private drawPlayer(s: GameState): void {
    const p = s.player;
    const g = this.playerG;
    g.clear();
    g.position.set(p.pos.x, p.pos.y);
    g.rotation = p.facing;
    const dashing = p.dashTimer > 0;
    const color = dashing ? COLORS.playerDash : COLORS.player;
    const blink = p.invulnTimer > 0 && Math.floor(p.invulnTimer * 20) % 2 === 0;
    g.alpha = blink ? 0.35 : 1;
    // 본체 + 조준 방향 표시
    g.circle(0, 0, p.radius).stroke({ color, width: 3 });
    g.moveTo(p.radius * 0.4, 0).lineTo(p.radius * 1.3, 0).stroke({ color, width: 3 });
  }

  private drawEnemies(s: GameState): void {
    const g = this.enemiesG;
    g.clear();
    for (const e of s.enemies) {
      const color = e.hitFlash > 0 ? COLORS.enemyFlash : COLORS.enemy;
      // 마름모 실루엣: 플레이어(원)와 즉시 구분되는 형태
      g.moveTo(e.pos.x, e.pos.y - e.radius)
        .lineTo(e.pos.x + e.radius, e.pos.y)
        .lineTo(e.pos.x, e.pos.y + e.radius)
        .lineTo(e.pos.x - e.radius, e.pos.y)
        .closePath()
        .stroke({ color, width: 3 });
    }
  }
}
