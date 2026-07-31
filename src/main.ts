import { Input } from './engine/input';
import { startLoop } from './engine/loop';
import { appraise, decodeCore, encodeCore, rollMarketSeed } from './game/core';
import { BIOME_NAMES, generateDungeon } from './game/dungeon';
import { createHideout, HIDEOUT_STATIONS, PORTAL_POS, type StationKind } from './game/hideout';
import { step } from './game/sim';
import { createStateFromDungeon, type GameState } from './game/state';
import { T } from './game/tuning';
import { loadMeta, saveMeta, type MetaState } from './meta/save';
import { buyPrice, MarketPanel, upgradeCost, type PanelMode } from './ui/market';
import { Renderer } from './render/renderer';

const STATION_TO_MODE: Record<StationKind, PanelMode> = {
  device: 'device',
  merchant: 'merchant',
  storage: 'storage',
  anvil: 'anvil',
};

async function boot(): Promise<void> {
  const renderer = new Renderer();
  await renderer.init();

  const input = new Input();
  input.attach(document.body);

  const hpfill = document.getElementById('hpfill') as HTMLDivElement;
  const goldEl = document.getElementById('gold') as HTMLDivElement;
  const infoEl = document.getElementById('info') as HTMLDivElement;
  const promptEl = document.getElementById('prompt') as HTMLDivElement;
  const overlay = document.getElementById('overlay') as HTMLDivElement;
  const overlayTitle = document.getElementById('overlay-title') as HTMLHeadingElement;
  const overlayBody = document.getElementById('overlay-body') as HTMLParagraphElement;
  const overlayHint = document.getElementById('overlay-hint') as HTMLParagraphElement;

  const meta: MetaState = loadMeta();
  let mode: 'hub' | 'dungeon' = 'hub';
  let seed = 0;
  let fromCore = false; // 코어로 연 던전은 재응축 불가
  let cored = false; // 이번 던전을 이미 응축했는가
  let overlayVisible = false;
  let pendingPortal: { seed: number; viaCore: boolean } | null = null;
  let nearStation: StationKind | null = null;
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

  const enterHideout = (): void => {
    mode = 'hub';
    pendingPortal = null;
    const hideout = createHideout();
    state = createStateFromDungeon(hideout);
    state.gold = meta.gold;
    state.items = [...meta.items];
    applyMetaToPlayer();
    renderer.setDungeon(hideout);
    renderer.setProps(HIDEOUT_STATIONS.map((s) => ({ texKey: s.texKey, pos: s.pos })));
    renderer.setPortal(null);
    infoEl.textContent = '은신처';
    hideOverlay();
    market.close();
  };

  const enterDungeon = (newSeed: number, viaCore: boolean): void => {
    mode = 'dungeon';
    seed = newSeed;
    fromCore = viaCore;
    cored = false;
    pendingPortal = null;
    const dungeon = generateDungeon(seed);
    state = createStateFromDungeon(dungeon);
    state.gold = meta.gold;
    state.items = [...meta.items];
    applyMetaToPlayer();
    renderer.setDungeon(dungeon);
    renderer.setProps([]);
    renderer.setPortal(null);
    infoEl.textContent = `${BIOME_NAMES[dungeon.biome]} · 시드 ${seed}${viaCore ? ' · 코어 던전' : ''}`;
    hideOverlay();
    market.close();
  };

  const itemSummary = (): string => {
    if (state.items.length === 0) return '획득한 장비 없음';
    const counts = { common: 0, rare: 0, epic: 0 };
    for (const it of state.items) counts[it.rarity]++;
    return `장비 — 일반 ${counts.common} · 희귀 ${counts.rare} · 영웅 ${counts.epic}`;
  };

  const clearHint = (): string =>
    fromCore
      ? 'R — 은신처로 (코어 던전은 재응축 불가)'
      : cored
        ? 'R — 은신처로'
        : 'C — 던전을 코어로 응축 · R — 은신처로';

  const openPortal = (portalSeed: number, viaCore: boolean): void => {
    pendingPortal = { seed: portalSeed, viaCore };
    renderer.setPortal(PORTAL_POS);
    market.close();
  };

  const market = new MarketPanel({
    getMeta: () => meta,
    insertCore: (coreSeed) => {
      meta.cores = meta.cores.filter((s) => s !== coreSeed); // 삽입 즉시 소모
      saveMeta(meta);
      openPortal(coreSeed, true);
    },
    explore: () => {
      openPortal(rollMarketSeed(), false);
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

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && mode === 'hub' && nearStation && !market.isOpen) {
      market.open(STATION_TO_MODE[nearStation]);
      return;
    }
    if (e.code === 'KeyM' && mode === 'hub') {
      if (market.isOpen) market.close();
      else market.open('merchant');
      return;
    }
    if (e.code === 'Escape' && market.isOpen) {
      market.close();
      return;
    }
    if (e.code === 'KeyC' && overlayVisible && state.cleared && !fromCore && !cored) {
      cored = true;
      meta.cores.push(seed);
      saveMeta(meta);
      showOverlay('던전 정복', `코어로 응축했다 — ${encodeCore(seed)}`, clearHint());
      return;
    }
    if (e.code === 'KeyH' && overlayVisible && state.dead) {
      enterHideout();
      return;
    }
    if (e.code !== 'KeyR' || !overlayVisible) return;
    if (state.dead) enterDungeon(seed, fromCore); // 같은 시드 재도전 — 같은 던전이 그대로 재생성된다
    else enterHideout();
  });

  enterHideout();

  startLoop(
    () => {
      const paused = overlayVisible || market.isOpen;
      if (paused) return;
      step(state, input.sample(renderer.toWorld));

      if (mode === 'hub') {
        // 스테이션 근접 판정 + 포탈 진입
        const p = state.player.pos;
        nearStation = null;
        for (const st of HIDEOUT_STATIONS) {
          const d = Math.hypot(st.pos.x - p.x, st.pos.y - p.y);
          if (d < 58) {
            nearStation = st.kind;
            promptEl.textContent = `E — ${st.label}`;
            break;
          }
        }
        promptEl.classList.toggle('hidden', nearStation === null);
        if (pendingPortal && Math.hypot(PORTAL_POS.x - p.x, PORTAL_POS.y - p.y) < 30) {
          enterDungeon(pendingPortal.seed, pendingPortal.viaCore);
          return;
        }
      } else {
        promptEl.classList.add('hidden');
      }

      for (const ev of state.events) {
        const fx = renderer.effects;
        const p = state.player;
        switch (ev.type) {
          case 'playerAttack':
            fx.slash(p.pos.x, p.pos.y, ev.angle, T.attackRange, T.attackArc);
            renderer.playerLunge();
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
            showOverlay('전사', '어둠이 그대를 삼켰다.', 'R — 재도전 · H — 은신처로');
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
      get mode() {
        return mode;
      },
      get pendingPortal() {
        return pendingPortal;
      },
      renderer,
      market,
      enterDungeon,
      enterHideout,
    };
  }
}

void boot();
