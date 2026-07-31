import { appraise, rollMarketSeed, summarizeDungeon, type DungeonSummary } from '../game/core';
import { BIOME_NAMES } from '../game/dungeon';
import type { MetaState } from '../meta/save';

const STAT_NAMES = { atk: '공격', hp: '체력', speed: '이속' } as const;
const RARITY_NAMES = { common: '일반', rare: '희귀', epic: '영웅' } as const;
const RARITY_CLASS = { common: 'r-common', rare: 'r-rare', epic: 'r-epic' } as const;

export function upgradeCost(level: number): number {
  return Math.floor(40 * Math.pow(level + 1, 1.5));
}

export function buyPrice(seed: number): number {
  return Math.floor(appraise(seed) * 1.6 + 20);
}

export type PanelMode = 'device' | 'merchant' | 'storage' | 'anvil';

export const PANEL_TITLES: Record<PanelMode, string> = {
  device: '코어 삽입 장치',
  merchant: '코어 상인',
  storage: '보관함',
  anvil: '대장간',
};

// 메타 상태를 소유한 쪽(main)이 실제 행동을 구현한다. 패널은 표시·입력만 담당.
export interface MarketActions {
  getMeta(): MetaState;
  insertCore(seed: number): void; // 장치: 삽입 즉시 소모, 포탈 생성
  explore(): void; // 장치: 무작위 던전 포탈
  sellCore(seed: number): void;
  buyCore(seed: number): boolean;
  addCoreFromCode(code: string): 'ok' | 'invalid' | 'duplicate';
  buyUpgrade(kind: 'atk' | 'hp' | 'speed'): boolean;
  copyCode(seed: number): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function coreInfo(seed: number): [HTMLDivElement, HTMLDivElement] {
  const s: DungeonSummary = summarizeDungeon(seed);
  const title = el('div', 'core-title', `${BIOME_NAMES[s.biome]} `);
  title.appendChild(el('span', 'dim', `· 몬스터 ${s.enemyCount} · ${s.totalGold}G 봉인`));
  const items = el('div', 'core-items');
  if (s.items.length === 0) {
    items.appendChild(el('span', 'dim', '장비 없음'));
  } else {
    s.items.forEach((it, i) => {
      if (i > 0) items.appendChild(document.createTextNode(', '));
      items.appendChild(
        el('span', RARITY_CLASS[it.rarity], `${RARITY_NAMES[it.rarity]} ${STAT_NAMES[it.stat]}`),
      );
    });
  }
  return [title, items];
}

function row(seed: number | null, buttons: HTMLButtonElement[], titleOverride?: HTMLElement[]): HTMLDivElement {
  const r = el('div', 'row');
  if (seed !== null) r.append(...coreInfo(seed));
  if (titleOverride) r.append(...titleOverride);
  const actions = el('div', 'actions');
  actions.append(...buttons);
  r.appendChild(actions);
  return r;
}

function button(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', '', label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

export class MarketPanel {
  isOpen = false;
  mode: PanelMode = 'merchant';
  stock: number[] = [rollMarketSeed(), rollMarketSeed(), rollMarketSeed(), rollMarketSeed()];
  onToggle: (open: boolean) => void = () => {};

  private root = document.getElementById('market') as HTMLDivElement;
  private title = document.querySelector('#market-header h1') as HTMLHeadingElement;
  private secCores = document.getElementById('sec-cores') as HTMLElement;
  private secStock = document.getElementById('sec-stock') as HTMLElement;
  private secUpgrade = document.getElementById('sec-upgrade') as HTMLElement;
  private codeEntry = document.getElementById('code-entry') as HTMLDivElement;
  private coresList = document.getElementById('cores-list') as HTMLDivElement;
  private stockList = document.getElementById('stock-list') as HTMLDivElement;
  private upgradeList = document.getElementById('upgrade-list') as HTMLDivElement;
  private codeInput = document.getElementById('code-input') as HTMLInputElement;
  private codeMsg = document.getElementById('code-msg') as HTMLSpanElement;
  private goldLabel = document.getElementById('market-gold') as HTMLSpanElement;

  constructor(private actions: MarketActions) {
    (document.getElementById('market-close') as HTMLButtonElement).addEventListener('click', () =>
      this.close(),
    );
    (document.getElementById('code-add') as HTMLButtonElement).addEventListener('click', () => {
      const result = this.actions.addCoreFromCode(this.codeInput.value);
      if (result === 'ok') {
        this.codeMsg.textContent = '코어를 받았다.';
        this.codeInput.value = '';
      } else if (result === 'duplicate') {
        this.codeMsg.textContent = '이미 보유한 코어다.';
      } else {
        this.codeMsg.textContent = '유효하지 않은 코드.';
      }
      this.refresh();
    });
  }

  open(mode: PanelMode): void {
    this.mode = mode;
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.refresh();
    this.onToggle(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.onToggle(false);
  }

  refresh(): void {
    const meta = this.actions.getMeta();
    const mode = this.mode;
    this.title.textContent = PANEL_TITLES[mode];
    this.goldLabel.textContent = `${meta.gold} G`;
    this.secCores.classList.toggle('hidden', mode === 'anvil');
    this.secStock.classList.toggle('hidden', mode !== 'merchant');
    this.secUpgrade.classList.toggle('hidden', mode !== 'anvil');
    this.codeEntry.classList.toggle('hidden', mode !== 'merchant');

    // 보유 코어 — 모드별 행동이 다르다
    this.coresList.replaceChildren();
    if (mode === 'device') {
      this.coresList.appendChild(
        row(null, [button('탐사 — 미지의 던전으로', () => this.actions.explore())], [
          el('div', 'core-title', '빈 소켓 가동'),
        ]),
      );
    }
    if (meta.cores.length === 0) {
      if (mode !== 'device') {
        this.coresList.appendChild(
          el('div', 'dim', '보유한 코어가 없다. 던전을 정복하고 C로 응축하라.'),
        );
      }
    } else {
      for (const seed of meta.cores) {
        const buttons: HTMLButtonElement[] = [];
        if (mode === 'device') {
          buttons.push(button('삽입 (코어 소모)', () => this.actions.insertCore(seed)));
        }
        if (mode === 'merchant') {
          buttons.push(
            button(`판매 ${appraise(seed)}G`, () => {
              this.actions.sellCore(seed);
              this.refresh();
            }),
          );
        }
        if (mode === 'storage' || mode === 'merchant') {
          buttons.push(button('코드 복사', () => this.actions.copyCode(seed)));
        }
        this.coresList.appendChild(row(seed, buttons));
      }
    }

    // 시장 재고 (상인 전용) — 드롭 목록 전체 공개가 이 게임의 셀링 포인트
    this.stockList.replaceChildren();
    if (mode === 'merchant') {
      this.stock.forEach((seed, i) => {
        const price = buyPrice(seed);
        this.stockList.appendChild(
          row(seed, [
            button(
              `구매 ${price}G`,
              () => {
                if (this.actions.buyCore(seed)) {
                  this.stock[i] = rollMarketSeed(); // 팔린 슬롯은 새 재고로
                  this.refresh();
                }
              },
              meta.gold < price,
            ),
          ]),
        );
      });
    }

    // 강화 (대장간 전용)
    this.upgradeList.replaceChildren();
    if (mode === 'anvil') {
      const specs: Array<{ kind: 'atk' | 'hp' | 'speed'; label: string }> = [
        { kind: 'atk', label: '공격 +5%' },
        { kind: 'hp', label: '체력 +10' },
        { kind: 'speed', label: '이속 +3%' },
      ];
      for (const spec of specs) {
        const level = meta.upgrades[spec.kind];
        const cost = upgradeCost(level);
        const title = el('div', 'core-title', `${spec.label} `);
        title.appendChild(el('span', 'dim', `· 현재 Lv.${level}`));
        this.upgradeList.appendChild(
          row(null, [
            button(`강화 ${cost}G`, () => {
              if (this.actions.buyUpgrade(spec.kind)) this.refresh();
            }, meta.gold < cost),
          ], [title]),
        );
      }
    }
  }
}
