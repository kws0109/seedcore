import type { InputFrame } from '../game/state';

// 키·마우스 원시 상태를 모아 InputFrame으로 샘플링한다.
// attack/dash는 엣지 트리거: 틱 샘플링 시 1회만 true.
export class Input {
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0 };
  private attackPressed = false;
  private dashPressed = false;

  attach(target: HTMLElement): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) this.dashPressed = true;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    target.addEventListener('pointerdown', () => {
      this.attackPressed = true;
    });
  }

  // toWorld: 화면 좌표 → 월드 좌표 (렌더러의 카메라 변환 역적용)
  sample(toWorld: (sx: number, sy: number) => { x: number; y: number }): InputFrame {
    const aim = toWorld(this.mouse.x, this.mouse.y);
    const frame: InputFrame = {
      moveX: (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      moveY: (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0),
      aimX: aim.x,
      aimY: aim.y,
      attack: this.attackPressed,
      dash: this.dashPressed,
    };
    this.attackPressed = false;
    this.dashPressed = false;
    return frame;
  }
}
