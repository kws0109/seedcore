import { Input } from './engine/input';
import { startLoop } from './engine/loop';
import { generateDungeon } from './game/dungeon';
import { step } from './game/sim';
import { createStateFromDungeon, type GameState } from './game/state';
import { T } from './game/tuning';
import { Renderer } from './render/renderer';

async function boot(): Promise<void> {
  const renderer = new Renderer();
  await renderer.init();

  const input = new Input();
  input.attach(document.body);

  const hpfill = document.getElementById('hpfill') as HTMLDivElement;
  const goldEl = document.getElementById('gold') as HTMLDivElement;
  const overlay = document.getElementById('overlay') as HTMLDivElement;
  const overlayTitle = document.getElementById('overlay-title') as HTMLHeadingElement;
  const overlayBody = document.getElementById('overlay-body') as HTMLParagraphElement;
  const overlayHint = document.getElementById('overlay-hint') as HTMLParagraphElement;

  let seed = 20260810;
  let state: GameState;
  let paused = false;

  const enterDungeon = (newSeed: number): void => {
    seed = newSeed;
    const dungeon = generateDungeon(seed);
    const carried = state ? { gold: state.gold, items: state.items } : null;
    state = createStateFromDungeon(dungeon);
    if (carried) {
      // 골드·아이템은 런을 넘어 유지 (아이템 효과 재적용)
      state.gold = carried.gold;
      for (const item of carried.items) {
        state.items.push(item);
        if (item.stat === 'atk') state.player.atkMul += T.itemAtk[item.rarity];
        else if (item.stat === 'speed') state.player.speedMul += T.itemSpeed[item.rarity];
        else state.player.maxHp += T.itemHp[item.rarity];
      }
      state.player.hp = state.player.maxHp;
    }
    renderer.setDungeon(dungeon);
    overlay.classList.add('hidden');
    paused = false;
  };

  const showOverlay = (title: string, body: string, hint: string): void => {
    overlayTitle.textContent = title;
    overlayBody.textContent = body;
    overlayHint.textContent = hint;
    overlay.classList.remove('hidden');
    paused = true;
  };

  const itemSummary = (): string => {
    if (state.items.length === 0) return '획득한 장비 없음';
    const counts = { common: 0, rare: 0, epic: 0 };
    for (const it of state.items) counts[it.rarity]++;
    return `장비 — 일반 ${counts.common} · 희귀 ${counts.rare} · 영웅 ${counts.epic}`;
  };

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyR' || !paused) return;
    if (state.dead) enterDungeon(seed); // 같은 시드 재도전 — 같은 던전이 그대로 재생성된다
    else enterDungeon(seed + 1);
  });

  enterDungeon(seed);

  startLoop(
    () => {
      if (paused) return;
      step(state, input.sample(renderer.toWorld));
      for (const ev of state.events) {
        const fx = renderer.effects;
        const p = state.player;
        switch (ev.type) {
          case 'playerAttack':
            fx.slash(p.pos.x, p.pos.y, ev.angle, T.attackRange, T.attackArc);
            break;
          case 'enemyHit':
            fx.burst(ev.pos.x, ev.pos.y, 0x8a2424, 6, 40);
            renderer.shake = Math.max(renderer.shake, 6);
            break;
          case 'enemyDied':
            fx.burst(ev.pos.x, ev.pos.y, 0xcfc4a8, 14, 80);
            renderer.shake = Math.max(renderer.shake, 10);
            break;
          case 'playerHit':
            fx.burst(ev.pos.x, ev.pos.y, 0xa03030, 10, 60);
            renderer.shake = Math.max(renderer.shake, 12);
            break;
          case 'dash':
            fx.ghost(ev.pos.x, ev.pos.y, p.radius);
            break;
          case 'shoot':
            break;
          case 'dropPicked':
            fx.burst(ev.pos.x, ev.pos.y, 0xc9a95c, 5, 30);
            break;
          case 'dungeonCleared':
            showOverlay(
              '던전 정복',
              `${state.gold} G 보유 · ${itemSummary()}`,
              'R — 다음 던전으로',
            );
            break;
          case 'playerDied':
            showOverlay('전사', '어둠이 그대를 삼켰다.', 'R — 같은 던전에 재도전');
            break;
        }
      }
      hpfill.style.width = `${Math.max(0, (state.player.hp / state.player.maxHp) * 100)}%`;
      goldEl.textContent = `${state.gold} G`;
    },
    (dtMs) => renderer.draw(state, dtMs),
  );

  if (import.meta.env.DEV) {
    // 개발 전용 디버그 훅: 브라우저 자동 검증에서 부트 완료·상태 확인용
    (window as unknown as Record<string, unknown>).__seedcore = {
      get state() {
        return state;
      },
      renderer,
      enterDungeon,
    };
  }
}

void boot();
