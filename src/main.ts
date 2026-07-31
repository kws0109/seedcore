import { Application, Graphics, Text } from 'pixi.js';

// 루프 세팅 검증용 최소 씬. 본 구현이 시작되면 로직/렌더 분리 구조로 대체된다.
async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    background: '#08080c',
    resizeTo: window,
    antialias: true,
  });
  document.body.appendChild(app.canvas);

  const core = new Graphics().circle(0, 0, 48).stroke({ color: 0x46f0c8, width: 3 });
  core.position.set(window.innerWidth / 2, window.innerHeight / 2);
  app.stage.addChild(core);

  const title = new Text({
    text: 'SEEDCORE',
    style: { fill: 0xe8fff8, fontSize: 28, letterSpacing: 14, fontFamily: 'monospace' },
  });
  title.anchor.set(0.5);
  title.position.set(window.innerWidth / 2, window.innerHeight / 2 + 110);
  app.stage.addChild(title);

  app.ticker.add((ticker) => {
    core.rotation += 0.01 * ticker.deltaTime;
    const pulse = 1 + 0.06 * Math.sin(performance.now() / 400);
    core.scale.set(pulse);
  });
}

void boot();
