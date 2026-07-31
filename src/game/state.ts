import type { Vec } from '../engine/math';
import { T } from './tuning';

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
}

export interface Enemy {
  id: number;
  pos: Vec;
  vel: Vec; // 넉백 잔여 속도
  radius: number;
  hp: number;
  hitFlash: number;
  speed: number;
  touchDamage: number;
}

export type GameEvent =
  | { type: 'playerAttack'; angle: number }
  | { type: 'enemyHit'; pos: Vec; angle: number }
  | { type: 'enemyDied'; pos: Vec }
  | { type: 'playerHit'; pos: Vec }
  | { type: 'dash'; pos: Vec; angle: number };

export interface GameState {
  tick: number;
  player: Player;
  enemies: Enemy[];
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
  };
}

export function createEnemy(id: number, pos: Vec): Enemy {
  return {
    id,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    radius: T.enemyRadius,
    hp: T.enemyHp,
    hitFlash: 0,
    speed: T.enemySpeed,
    touchDamage: T.enemyTouchDamage,
  };
}

export function createState(): GameState {
  return {
    tick: 0,
    player: createPlayer({ x: 0, y: 0 }),
    enemies: [],
    hitstop: 0,
    events: [],
  };
}

export function idleInput(): InputFrame {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, attack: false, dash: false };
}
