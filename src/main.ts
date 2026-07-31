import { Input } from './engine/input';
import { startLoop } from './engine/loop';
import { mulberry32 } from './engine/rng';
import { step } from './game/sim';
import { createEnemy, createState } from './game/state';
import { Renderer } from './render/renderer';

async function boot(): Promise<void> {
  const renderer = new Renderer();
  await renderer.init();

  const input = new Input();
  input.attach(document.body);

  const state = createState();
  // 프로토타입용 시드 스폰. 던전 생성 단계에서 대체된다.
  const rng = mulberry32(2026);
  let nextEnemyId = 0;
  const spawnEnemy = (): void => {
    const angle = rng() * Math.PI * 2;
    const dist = 300 + rng() * 200;
    state.enemies.push(
      createEnemy(nextEnemyId++, {
        x: state.player.pos.x + Math.cos(angle) * dist,
        y: state.player.pos.y + Math.sin(angle) * dist,
      }),
    );
  };
  for (let i = 0; i < 5; i++) spawnEnemy();

  startLoop(
    () => {
      step(state, input.sample(renderer.toWorld));
      while (state.enemies.length < 5) spawnEnemy(); // 프로토타입: 상시 5마리 유지
      for (const ev of state.events) {
        if (ev.type === 'enemyHit') renderer.shake = Math.max(renderer.shake, 6);
        if (ev.type === 'playerHit') renderer.shake = Math.max(renderer.shake, 12);
      }
    },
    (dtMs) => renderer.draw(state, dtMs),
  );
}

void boot();
