import { Container, Graphics } from 'pixi.js';

interface Fx {
  g: Graphics;
  life: number; // 남은 수명(ms)
  ttl: number;
  update: (g: Graphics, t: number) => void; // t: 1→0 진행도
}

export class Effects {
  private items: Fx[] = [];

  constructor(private layer: Container) {}

  private add(g: Graphics, ttl: number, update: Fx['update']): void {
    this.layer.addChild(g);
    this.items.push({ g, life: ttl, ttl, update });
  }

  // 공격 슬래시: 부채꼴 스트로크가 커지며 사라진다
  slash(x: number, y: number, angle: number, range: number, arc: number): void {
    const g = new Graphics();
    g.position.set(x, y);
    g.rotation = angle;
    this.add(g, 120, (gg, t) => {
      gg.clear();
      gg.arc(0, 0, range * (1.15 - 0.15 * t), -arc, arc).stroke({
        color: 0xe6d8b8, // 뼈·강철 빛 검격
        width: 4 * t,
        alpha: t,
      });
    });
  }

  // 원형 파편 버스트: 피격·사망 연출
  burst(x: number, y: number, color: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const g = new Graphics();
      this.add(g, 260, (gg, t) => {
        const d = speed * (1 - t);
        gg.clear();
        gg.position.set(x + Math.cos(a) * d, y + Math.sin(a) * d);
        gg.circle(0, 0, 3 * t).fill({ color, alpha: t });
      });
    }
  }

  // 대시 잔상: 시작 위치에 옅은 원이 남았다 사라진다
  ghost(x: number, y: number, radius: number): void {
    const g = new Graphics();
    g.position.set(x, y);
    this.add(g, 200, (gg, t) => {
      gg.clear();
      gg.circle(0, 0, radius).stroke({ color: 0xcfc4a8, width: 2, alpha: 0.5 * t });
    });
  }

  tick(dtMs: number): void {
    for (const fx of this.items) {
      fx.life -= dtMs;
      fx.update(fx.g, Math.max(0, fx.life / fx.ttl));
    }
    this.items = this.items.filter((fx) => {
      if (fx.life > 0) return true;
      fx.g.destroy();
      return false;
    });
  }
}
