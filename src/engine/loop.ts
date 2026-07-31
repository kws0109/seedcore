const TICK_MS = 1000 / 60;
const MAX_FRAME_MS = 250; // 탭 복귀 시 폭주 방지

export function startLoop(update: () => void, render: (dtMs: number) => void): () => void {
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  const frame = (now: number): void => {
    const dt = Math.min(now - last, MAX_FRAME_MS);
    last = now;
    acc += dt;
    while (acc >= TICK_MS) {
      update();
      acc -= TICK_MS;
    }
    render(dt);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
