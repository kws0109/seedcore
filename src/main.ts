import { Input } from './engine/input';
import { startLoop } from './engine/loop';
import { appraise, decodeCore, encodeCore } from './game/core';
import { BIOME_NAMES, generateDungeon } from './game/dungeon';
import { step } from './game/sim';
import { createStateFromDungeon, type GameState } from './game/state';
import { T } from './game/tuning';
import { loadMeta, saveMeta, type MetaState } from './meta/save';
import { buyPrice, MarketPanel, upgradeCost } from './ui/market';
import { Renderer } from './render/renderer';

async function boot(): Promise<void> {
  const renderer = new Renderer();
  await renderer.init();

  const input = new Input();
  input.attach(document.body);

  const hpfill = document.getElementById('hpfill') as HTMLDivElement;
  const goldEl = document.getElementById('gold') as HTMLDivElement;
  const infoEl = document.getElementById('info') as HTMLDivElement;
  const overlay = document.getElementById('overlay') as HTMLDivElement;
  const overlayTitle = document.getElementById('overlay-title') as HTMLHeadingElement;
  const overlayBody = document.getElementById('overlay-body') as HTMLParagraphElement;
  const overlayHint = document.getElementById('overlay-hint') as HTMLParagraphElement;

  const meta: MetaState = loadMeta();
  let seed = 20260810;
  let fromCore = false; // 코어로 연 던전은 재코어화 불가
  let cored = false; // 이번 던전을 이미 응축했는가
  let overlayVisible = false;
  let state: GameState;

  // 런 중 주운 골드·장비를 메타에 반영하고 저장
  const syncMeta = (): void => {
    meta.gold = state.gold;
    meta.items = state.items;
    saveMeta(meta);
  };

  const applyMetaToPlayer = (): void => {
    const p = state.player;
    p.atkMul = 1 + 0.05 * meta.upgrades.atk;
    p.speedMul = 1 + 0.03 * meta.upgrades.speed;
    p.maxHp = T.playerMaxHp + 10 * meta.upgrades.hp;
    for (const item of meta.items) {
      if (item.stat === 'atk') p.atkMul += T.itemAtk[item.rarity];
      else if (item.stat === 'speed') p.speedMul += T.itemSpeed[item.rarity];
      else p.maxHp += T.itemHp[item.rarity];
    }
    p.hp = p.maxHp;
  };

  const enterDungeon = (newSeed: number, viaCore: boolean): void => {
    seed = newSeed;
    fromCore = viaCore;
    cored = false;
    const dungeon = generateDungeon(seed);
    state = createStateFromDungeon(dungeon);
    state.gold = meta.gold;
    state.items = [...meta.items];
    applyMetaToPlayer();
    renderer.setDungeon(dungeon);
    infoEl.textContent = `${BIOME_NAMES[dungeon.biome]} · 시드 ${seed}${viaCore ? ' · 코어 던전' : ''}`;
    hideOverlay();
    market.close();
  };

  const showOverlay = (title: string, body: string, hint: string): void => {
    overlayTitle.textContent = title;
    overlayBody.textContent = body;
    overlayHint.textContent = hint;
    overlay.classList.remove('hidden');
    overlayVisible = true;
  };

  const hideOverlay = (): void => {
    overlay.classList.add('hidden');
    overlayVisible = false;
  };

  const itemSummary = (): string => {
    if (state.items.length === 0) return '획득한 장비 없음';
    const counts = { common: 0, rare: 0, epic: 0 };
    for (const it of state.items) counts[it.rarity]++;
    return `장비 — 일반 ${counts.common} · 희귀 ${counts.rare} · 영웅 ${counts.epic}`;
  };

  const clearHint = (): string =>
    fromCore
      ? 'R — 다음 던전으로 (코어 던전은 재응축 불가)'
      : cored
        ? 'R — 다음 던전으로'
        : 'C — 던전을 코어로 응축 · R — 다음 던전으로';

  const market = new MarketPanel({
    getMeta: () => meta,
    useCore: (coreSeed) => {
      meta.cores = meta.cores.filter((s) => s !== coreSeed); // 입장 시 1회 소모
      meta.gold = state.gold;
      meta.items = state.items;
      saveMeta(meta);
      enterDungeon(coreSeed, true);
    },
    sellCore: (coreSeed) => {
      meta.cores = meta.cores.filter((s) => s !== coreSeed);
      meta.gold += appraise(coreSeed);
      state.gold = meta.gold;
      saveMeta(meta);
    },
    buyCore: (coreSeed) => {
      const price = buyPrice(coreSeed);
      if (meta.gold < price || meta.cores.includes(coreSeed)) return false;
      meta.gold -= price;
      meta.cores.push(coreSeed);
      state.gold = meta.gold;
      saveMeta(meta);
      return true;
    },
    addCoreFromCode: (code) => {
      const decoded = decodeCore(code);
      if (decoded === null) return 'invalid';
      if (meta.cores.includes(decoded)) return 'duplicate';
      meta.cores.push(decoded);
      saveMeta(meta);
      return 'ok';
    },
    buyUpgrade: (kind) => {
      const cost = upgradeCost(meta.upgrades[kind]);
      if (meta.gold < cost) return false;
      meta.gold -= cost;
      meta.upgrades[kind] += 1;
      state.gold = meta.gold;
      const keepHpRatio = state.player.hp / state.player.maxHp;
      applyMetaToPlayer();
      state.player.hp = Math.max(1, Math.round(state.player.maxHp * keepHpRatio));
      saveMeta(meta);
      return true;
    },
    copyCode: (coreSeed) => {
      const code = encodeCore(coreSeed);
      navigator.clipboard?.writeText(code).catch(() => window.prompt('코어 코드', code));
    },
  });
  market.onToggle = () => {
    /* paused는 아래 게이트에서 매 틱 계산 */
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !state.dead) {
      market.toggle();
      return;
    }
    if (e.code === 'KeyC' && overlayVisible && state.cleared && !fromCore && !cored) {
      cored = true;
      meta.cores.push(seed);
      saveMeta(meta);
      showOverlay(
        '던전 정복',
        `코어로 응축했다 — ${encodeCore(seed)}`,
        clearHint(),
      );
      return;
    }
    if (e.code !== 'KeyR' || !overlayVisible) return;
    if (state.dead) enterDungeon(seed, fromCore); // 같은 시드 재도전 — 같은 던전이 그대로 재생성된다
    else enterDungeon(seed + 1, false);
  });

  enterDungeon(seed, false);

  startLoop(
    () => {
      const paused = overlayVisible || market.isOpen;
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
            syncMeta();
            break;
          case 'dungeonCleared':
            syncMeta();
            showOverlay('던전 정복', `${state.gold} G 보유 · ${itemSummary()}`, clearHint());
            break;
          case 'playerDied':
            syncMeta();
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
      get meta() {
        return meta;
      },
      renderer,
      market,
      enterDungeon,
    };
  }
}

void boot();
