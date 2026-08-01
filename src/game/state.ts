import type { Vec } from '../engine/math';
import { T } from './tuning';
import ENEMIES from '../data/enemies.json';
import type { Dungeon, ItemStat, Rarity, RolledDrop } from './dungeon';

export interface InputFrame {
  moveX: number; // -1..1
  moveY: number; // -1..1
  aimX: number; // 월드 좌표
  aimY: number;
  attack: boolean; // 이번 틱에 눌림
  dash: boolean; // 이번 틱에 눌림
}

export interface Player {
  pos: Vec;
  vel: Vec;
  radius: number;
  hp: number;
  maxHp: number;
  facing: number; // 라디안
  dashTimer: number;
  dashCooldown: number;
  attackCooldown: number;
  invulnTimer: number;
  atkMul: number; // 아이템 누적 공격 배율
  speedMul: number; // 아이템 누적 이속 배율
}

export type EnemyKind = 'ghoul' | 'archer' | 'brute';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec;
  vel: Vec; // 넉백 잔여 속도
  radius: number;
  hp: number;
  hitFlash: number;
  speed: number;
  touchDamage: number;
  kbResist: number; // 넉백 배율 (1=그대로, 0.3=저항)
  shootTimer: number; // archer 전용 발사 쿨다운
  drop: RolledDrop | null; // 던전 생성 시 사전 롤링된 드롭
  aggro: boolean; // 플레이어 인지 여부 (시야 또는 경보)
  path: Vec[]; // A* 웨이포인트 (시야가 막혔을 때 추적 경로)
  repathCd: number; // 경로 재탐색 쿨다운(초)
  home: Vec; // 스폰 지점 — 비인지 배회의 기준점
}

export interface Projectile {
  id: number;
  pos: Vec;
  vel: Vec;
  radius: number;
  damage: number;
  ttl: number; // 남은 수명(초)
}

export interface DropEntity {
  id: number;
  pos: Vec;
  gold: number;
  item: RolledDrop['item'];
}

export interface OwnedItem {
  rarity: Rarity;
  stat: ItemStat;
}

export type GameEvent =
  | { type: 'playerAttack'; angle: number }
  | { type: 'enemyHit'; pos: Vec; angle: number }
  | { type: 'enemyDied'; pos: Vec }
  | { type: 'playerHit'; pos: Vec }
  | { type: 'dash'; pos: Vec; angle: number }
  | { type: 'shoot'; pos: Vec }
  | { type: 'dropPicked'; pos: Vec }
  | { type: 'dungeonCleared' }
  | { type: 'playerDied' };

export interface GameState {
  tick: number;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  drops: DropEntity[];
  gold: number;
  items: OwnedItem[];
  cleared: boolean;
  dead: boolean;
  nextProjectileId: number;
  nextDropId: number;
  dungeon: Dungeon | null; // null이면 벽 없는 무한 평면 (테스트용)
  hitstop: number; // 남은 정지 시간(초)
  events: GameEvent[]; // 이번 틱에 발생한 렌더 큐. 매 step 초기화.
}

export function createPlayer(pos: Vec): Player {
  return {
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    radius: T.playerRadius,
    hp: T.playerMaxHp,
    maxHp: T.playerMaxHp,
    facing: 0,
    dashTimer: 0,
    dashCooldown: 0,
    attackCooldown: 0,
    invulnTimer: 0,
    atkMul: 1,
    speedMul: 1,
  };
}

export function createEnemy(id: number, pos: Vec, kind: EnemyKind = 'ghoul'): Enemy {
  const data = ENEMIES[kind];
  return {
    id,
    kind,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    radius: data.radius,
    hp: data.hp,
    hitFlash: 0,
    speed: data.speed,
    touchDamage: data.touchDamage,
    kbResist: data.kbResist,
    shootTimer: 0,
    drop: null,
    aggro: false,
    path: [],
    repathCd: (id % 30) / 60, // 개체별 시차 — 같은 틱에 몰리는 재탐색 방지
    home: { ...pos },
  };
}

export function createState(): GameState {
  return {
    tick: 0,
    player: createPlayer({ x: 0, y: 0 }),
    enemies: [],
    projectiles: [],
    drops: [],
    gold: 0,
    items: [],
    cleared: false,
    dead: false,
    nextProjectileId: 0,
    nextDropId: 0,
    dungeon: null,
    hitstop: 0,
    events: [],
  };
}

export function createStateFromDungeon(d: Dungeon): GameState {
  const s = createState();
  s.dungeon = d;
  s.player = createPlayer(d.spawn);
  d.enemies.forEach((spawn, i) => {
    const e = createEnemy(i, spawn.pos, spawn.kind);
    e.drop = spawn.drop;
    s.enemies.push(e);
  });
  return s;
}

export function idleInput(): InputFrame {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, attack: false, dash: false };
}
