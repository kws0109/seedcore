# Seedcore 전투 프로토타입 (D1~2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WASD 이동 + 마우스 슬래시 + 대시 + 추적형 몬스터가 있는 결정론적 전투 프로토타입을 웹에 배포한다.

**Architecture:** 게임 로직은 순수 TS 고정 타임스텝 시뮬레이션(`src/game/`, 렌더러 무관·결정론)이고, PixiJS 렌더러(`src/render/`)는 매 프레임 상태를 그리기만 한다. 시뮬레이션이 발생시킨 이벤트 목록을 렌더러가 소비해 이펙트를 만든다.

**Tech Stack:** PixiJS v8, TypeScript, Vite, Vitest

**파일 구조:**

```
src/
  engine/loop.ts      # 고정 타임스텝 루프
  engine/input.ts     # 키보드·마우스 상태 → InputFrame
  engine/rng.ts       # 시드 RNG (mulberry32)
  engine/math.ts      # 벡터·원 충돌·각도
  game/tuning.ts      # 밸런스 상수 (추후 JSON 데이터 테이블로 이전)
  game/state.ts       # GameState·InputFrame·이벤트 타입 + 팩토리
  game/sim.ts         # step(state, input) — 순수 갱신 함수
  render/renderer.ts  # Pixi 초기화·카메라·상태 드로잉
  render/effects.ts   # 슬래시 호·파티클·대시 잔상
  main.ts             # 부트스트랩·배선
tests/
  rng.test.ts  sim.test.ts  combat.test.ts  determinism.test.ts
```

**공통 규칙:** 로직 태스크는 TDD(테스트 먼저). 렌더 태스크는 브라우저 시각 확인으로 검증. 커밋 메시지는 한국어, 본문 없이 짧게.

---

### Task 1: 시드 RNG

**Files:**
- Create: `src/engine/rng.ts`
- Test: `tests/rng.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/rng.test.ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/engine/rng';

describe('mulberry32', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('다른 시드는 다른 수열을 낸다', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toEqual(b());
  });

  it('값은 항상 [0, 1) 범위다', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/rng.test.ts` · Expected: FAIL (`Cannot find module '../src/engine/rng'`)

- [ ] **Step 3: 최소 구현**

```ts
// src/engine/rng.ts
export type Rng = () => number;

// mulberry32: 32비트 상태 하나로 동작하는 결정론적 PRNG.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/rng.test.ts` · Expected: PASS (3 tests)

- [ ] **Step 5: 커밋** — `git add src/engine/rng.ts tests/rng.test.ts && git commit -m "feat: 시드 RNG (mulberry32)"`

---

### Task 2: 수학 유틸 (벡터·원 충돌·각도)

**Files:**
- Create: `src/engine/math.ts`
- Test: `tests/sim.test.ts` (파일 생성, math 테스트부터 시작)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/sim.test.ts
import { describe, expect, it } from 'vitest';
import { angleDiff, circlesOverlap, norm } from '../src/engine/math';

describe('math', () => {
  it('norm은 단위 벡터를 만들고 영벡터는 그대로 둔다', () => {
    expect(norm({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(norm({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('circlesOverlap은 반지름 합 기준으로 판정한다', () => {
    expect(circlesOverlap({ x: 0, y: 0 }, 5, { x: 9, y: 0 }, 5)).toBe(true);
    expect(circlesOverlap({ x: 0, y: 0 }, 5, { x: 11, y: 0 }, 5)).toBe(false);
  });

  it('angleDiff는 2π 랩어라운드를 처리한다', () => {
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 5);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/sim.test.ts` · Expected: FAIL (module not found)

- [ ] **Step 3: 최소 구현**

```ts
// src/engine/math.ts
export interface Vec {
  x: number;
  y: number;
}

export function len(v: Vec): number {
  return Math.hypot(v.x, v.y);
}

export function norm(v: Vec): Vec {
  const l = len(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}

export function circlesOverlap(a: Vec, ra: number, b: Vec, rb: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = ra + rb;
  return dx * dx + dy * dy <= r * r;
}

export function angleTo(from: Vec, to: Vec): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

// 두 각도의 최소 차이 (라디안, 항상 0..π)
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/sim.test.ts` · Expected: PASS

- [ ] **Step 5: 커밋** — `git add src/engine/math.ts tests/sim.test.ts && git commit -m "feat: 벡터·충돌·각도 유틸"`

---

### Task 3: 게임 상태 타입과 튜닝 상수

**Files:**
- Create: `src/game/tuning.ts`, `src/game/state.ts`

타입 정의라 테스트 없음. 컴파일 통과가 검증.

- [ ] **Step 1: 튜닝 상수 작성**

```ts
// src/game/tuning.ts
// 밸런스 상수. 던전 생성 단계에서 JSON 데이터 테이블로 이전 예정.
export const T = {
  playerSpeed: 220,
  playerRadius: 14,
  playerMaxHp: 100,
  dashSpeed: 640,
  dashDuration: 0.15,
  dashCooldown: 0.5,
  attackRange: 70,
  attackArc: 1.1,
  attackDamage: 34,
  attackCooldown: 0.25,
  attackKnockback: 260,
  hitstopSec: 0.05,
  enemyRadius: 13,
  enemyHp: 100,
  enemySpeed: 120,
  enemyTouchDamage: 10,
  playerInvulnAfterHit: 0.6,
} as const;
```

- [ ] **Step 2: 상태·이벤트 타입 작성**

```ts
// src/game/state.ts
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
```

- [ ] **Step 3: 컴파일 확인** — Run: `npx tsc --noEmit` · Expected: 에러 없음

- [ ] **Step 4: 커밋** — `git add src/game/tuning.ts src/game/state.ts && git commit -m "feat: 게임 상태 타입·튜닝 상수"`

---

### Task 4: 시뮬레이션 — 이동

**Files:**
- Create: `src/game/sim.ts`
- Modify: `tests/sim.test.ts` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가** (`tests/sim.test.ts`에 append)

```ts
import { createState, idleInput } from '../src/game/state';
import { step } from '../src/game/sim';
import { T } from '../src/game/tuning';

describe('sim: 이동', () => {
  it('오른쪽 입력 1초면 playerSpeed만큼 이동한다', () => {
    const s = createState();
    const inp = { ...idleInput(), moveX: 1 };
    for (let i = 0; i < 60; i++) step(s, inp);
    expect(s.player.pos.x).toBeCloseTo(T.playerSpeed, 1);
    expect(s.player.pos.y).toBeCloseTo(0, 5);
  });

  it('facing은 에임 방향을 향한다', () => {
    const s = createState();
    step(s, { ...idleInput(), aimX: 0, aimY: 100 });
    expect(s.player.facing).toBeCloseTo(Math.PI / 2, 5);
  });

  it('tick이 증가한다', () => {
    const s = createState();
    step(s, idleInput());
    expect(s.tick).toBe(1);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/sim.test.ts` · Expected: FAIL (`sim` module not found)

- [ ] **Step 3: 최소 구현**

```ts
// src/game/sim.ts
import { angleDiff, angleTo, circlesOverlap, norm } from '../engine/math';
import type { GameState, InputFrame } from './state';
import { T } from './tuning';

export const DT = 1 / 60;

export function step(s: GameState, inp: InputFrame): void {
  s.events = [];
  if (s.hitstop > 0) {
    s.hitstop = Math.max(0, s.hitstop - DT);
    return;
  }
  s.tick += 1;
  const p = s.player;

  // 타이머 감소
  p.dashCooldown = Math.max(0, p.dashCooldown - DT);
  p.attackCooldown = Math.max(0, p.attackCooldown - DT);
  p.invulnTimer = Math.max(0, p.invulnTimer - DT);
  p.dashTimer = Math.max(0, p.dashTimer - DT);

  stepDash(s, inp);
  stepMove(s, inp);
  stepAttack(s, inp);
  stepEnemies(s);
}

function stepDash(s: GameState, inp: InputFrame): void {
  const p = s.player;
  if (!inp.dash || p.dashCooldown > 0) return;
  p.dashTimer = T.dashDuration;
  p.dashCooldown = T.dashCooldown;
  const hasMove = inp.moveX !== 0 || inp.moveY !== 0;
  const dir = hasMove
    ? norm({ x: inp.moveX, y: inp.moveY })
    : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
  p.vel = { x: dir.x * T.dashSpeed, y: dir.y * T.dashSpeed };
  s.events.push({ type: 'dash', pos: { ...p.pos }, angle: Math.atan2(dir.y, dir.x) });
}

function stepMove(s: GameState, inp: InputFrame): void {
  const p = s.player;
  if (p.dashTimer === 0) {
    const dir = norm({ x: inp.moveX, y: inp.moveY });
    p.vel = { x: dir.x * T.playerSpeed, y: dir.y * T.playerSpeed };
  }
  p.pos.x += p.vel.x * DT;
  p.pos.y += p.vel.y * DT;
  p.facing = angleTo(p.pos, { x: inp.aimX, y: inp.aimY });
}

function stepAttack(s: GameState, inp: InputFrame): void {
  const p = s.player;
  if (!inp.attack || p.attackCooldown > 0) return;
  p.attackCooldown = T.attackCooldown;
  s.events.push({ type: 'playerAttack', angle: p.facing });
  for (const e of s.enemies) {
    const dx = e.pos.x - p.pos.x;
    const dy = e.pos.y - p.pos.y;
    const dist = Math.hypot(dx, dy);
    const inRange = dist <= T.attackRange + e.radius;
    const inArc = angleDiff(angleTo(p.pos, e.pos), p.facing) <= T.attackArc;
    if (!inRange || !inArc) continue;
    e.hp -= T.attackDamage;
    e.hitFlash = 0.1;
    const kb = norm({ x: dx, y: dy });
    e.vel.x += kb.x * T.attackKnockback;
    e.vel.y += kb.y * T.attackKnockback;
    s.hitstop = T.hitstopSec;
    s.events.push({ type: 'enemyHit', pos: { ...e.pos }, angle: p.facing });
  }
}

function stepEnemies(s: GameState): void {
  const p = s.player;
  for (const e of s.enemies) {
    e.hitFlash = Math.max(0, e.hitFlash - DT);
    // 넉백 감쇠 + 추적
    e.vel.x *= 0.85;
    e.vel.y *= 0.85;
    const dir = norm({ x: p.pos.x - e.pos.x, y: p.pos.y - e.pos.y });
    e.pos.x += (e.vel.x + dir.x * e.speed) * DT;
    e.pos.y += (e.vel.y + dir.y * e.speed) * DT;
    const canHit = p.invulnTimer === 0 && p.dashTimer === 0;
    if (canHit && circlesOverlap(p.pos, p.radius, e.pos, e.radius)) {
      p.hp -= e.touchDamage;
      p.invulnTimer = T.playerInvulnAfterHit;
      s.events.push({ type: 'playerHit', pos: { ...p.pos } });
    }
  }
  for (const e of s.enemies) {
    if (e.hp <= 0) s.events.push({ type: 'enemyDied', pos: { ...e.pos } });
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/sim.test.ts` · Expected: PASS

- [ ] **Step 5: 커밋** — `git add src/game/sim.ts tests/sim.test.ts && git commit -m "feat: 고정 타임스텝 시뮬레이션 코어"`

---

### Task 5: 전투 규칙 테스트 (대시·공격·접촉 피해·히트스톱)

**Files:**
- Create: `tests/combat.test.ts`

sim.ts는 Task 4에서 전투 로직까지 구현했으므로, 이 태스크는 규칙이 실제로 성립하는지 검증 테스트를 추가한다. 실패하는 테스트가 나오면 sim.ts를 수정한다.

- [ ] **Step 1: 테스트 작성**

```ts
// tests/combat.test.ts
import { describe, expect, it } from 'vitest';
import { step } from '../src/game/sim';
import { createEnemy, createState, idleInput } from '../src/game/state';
import { T } from '../src/game/tuning';

describe('combat: 대시', () => {
  it('대시 중에는 접촉 피해를 받지 않는다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 5, y: 0 })); // 즉시 겹침
    step(s, { ...idleInput(), dash: true, moveX: 1 });
    expect(s.player.hp).toBe(T.playerMaxHp);
  });

  it('쿨다운 중에는 대시가 다시 발동하지 않는다', () => {
    const s = createState();
    step(s, { ...idleInput(), dash: true, moveX: 1 });
    const t1 = s.player.dashCooldown;
    step(s, { ...idleInput(), dash: true, moveX: 1 });
    expect(s.player.dashCooldown).toBeLessThan(t1); // 재발동 없이 감소만
  });
});

describe('combat: 공격', () => {
  it('전방 부채꼴 안의 적만 피해를 입는다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 50, y: 0 })); // 전방
    s.enemies.push(createEnemy(2, { x: -50, y: 0 })); // 후방
    step(s, { ...idleInput(), attack: true, aimX: 100, aimY: 0 });
    const front = s.enemies.find((e) => e.id === 1)!;
    const back = s.enemies.find((e) => e.id === 2)!;
    expect(front.hp).toBe(T.enemyHp - T.attackDamage);
    expect(back.hp).toBe(T.enemyHp);
  });

  it('적 처치 시 목록에서 제거되고 enemyDied 이벤트가 남는다', () => {
    const s = createState();
    const e = createEnemy(1, { x: 50, y: 0 });
    e.hp = T.attackDamage; // 한 방
    s.enemies.push(e);
    step(s, { ...idleInput(), attack: true, aimX: 100, aimY: 0 });
    expect(s.enemies).toHaveLength(0);
    expect(s.events.some((ev) => ev.type === 'enemyDied')).toBe(true);
  });

  it('명중 시 히트스톱이 걸리고 다음 틱은 소모된다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 50, y: 0 }));
    step(s, { ...idleInput(), attack: true, aimX: 100, aimY: 0 });
    expect(s.hitstop).toBeGreaterThan(0);
    const tick = s.tick;
    step(s, idleInput());
    expect(s.tick).toBe(tick); // 히트스톱이 틱을 멈춘다
  });
});

describe('combat: 접촉 피해', () => {
  it('피격 직후 무적 시간 동안 연속 피해가 없다', () => {
    const s = createState();
    s.enemies.push(createEnemy(1, { x: 0, y: 0 }));
    step(s, idleInput());
    expect(s.player.hp).toBe(T.playerMaxHp - T.enemyTouchDamage);
    step(s, idleInput());
    expect(s.player.hp).toBe(T.playerMaxHp - T.enemyTouchDamage);
  });
});
```

- [ ] **Step 2: 실행** — Run: `npx vitest run tests/combat.test.ts` · Expected: PASS (Task 4 구현이 규칙을 만족하면 통과. 실패 시 sim.ts를 고치고 재실행 — 테스트를 고치지 말 것)

- [ ] **Step 3: 커밋** — `git add tests/combat.test.ts && git commit -m "test: 전투 규칙 검증 (대시 무적·부채꼴 판정·히트스톱·접촉 무적)"`

---

### Task 6: 결정론 보증 테스트

**Files:**
- Create: `tests/determinism.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
// tests/determinism.test.ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/engine/rng';
import { step } from '../src/game/sim';
import { createEnemy, createState, idleInput, type GameState, type InputFrame } from '../src/game/state';

// 시드 RNG로 입력 스크립트를 만들어 300틱을 돌린다.
function makeWorld(seed: number): { state: GameState; script: InputFrame[] } {
  const rng = mulberry32(seed);
  const state = createState();
  for (let i = 0; i < 5; i++) {
    state.enemies.push(
      createEnemy(i, { x: (rng() - 0.5) * 600, y: (rng() - 0.5) * 600 }),
    );
  }
  const script: InputFrame[] = Array.from({ length: 300 }, () => ({
    ...idleInput(),
    moveX: Math.round(rng() * 2 - 1),
    moveY: Math.round(rng() * 2 - 1),
    aimX: (rng() - 0.5) * 400,
    aimY: (rng() - 0.5) * 400,
    attack: rng() < 0.15,
    dash: rng() < 0.05,
  }));
  return { state, script };
}

describe('결정론', () => {
  it('같은 시드·같은 입력이면 300틱 후 상태가 완전히 같다', () => {
    const a = makeWorld(777);
    const b = makeWorld(777);
    for (let i = 0; i < 300; i++) {
      step(a.state, a.script[i]);
      step(b.state, b.script[i]);
    }
    expect(JSON.stringify(a.state)).toEqual(JSON.stringify(b.state));
  });

  it('다른 시드면 상태가 달라진다', () => {
    const a = makeWorld(1);
    const b = makeWorld(2);
    for (let i = 0; i < 300; i++) {
      step(a.state, a.script[i]);
      step(b.state, b.script[i]);
    }
    expect(JSON.stringify(a.state)).not.toEqual(JSON.stringify(b.state));
  });
});
```

- [ ] **Step 2: 실행** — Run: `npx vitest run tests/determinism.test.ts` · Expected: PASS (실패하면 sim에 비결정 요소가 섞인 것 — `Math.random`·시간 의존 코드를 찾아 제거)

- [ ] **Step 3: 전체 테스트** — Run: `npm test` · Expected: 전부 PASS

- [ ] **Step 4: 커밋** — `git add tests/determinism.test.ts && git commit -m "test: 시뮬레이션 결정론 보증"`

---

### Task 7: 게임 루프와 입력

**Files:**
- Create: `src/engine/loop.ts`, `src/engine/input.ts`

브라우저 API 의존이라 유닛 테스트 없음. Task 8에서 시각 검증.

- [ ] **Step 1: 고정 타임스텝 루프**

```ts
// src/engine/loop.ts
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
```

- [ ] **Step 2: 입력 수집기**

```ts
// src/engine/input.ts
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
  sample(toWorld: (sx: number, sy: number) => { x: number; y: number }) {
    const aim = toWorld(this.mouse.x, this.mouse.y);
    const frame = {
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
```

- [ ] **Step 3: 컴파일 확인** — Run: `npx tsc --noEmit` · Expected: 에러 없음

- [ ] **Step 4: 커밋** — `git add src/engine/loop.ts src/engine/input.ts && git commit -m "feat: 고정 타임스텝 루프·입력 수집기"`

---

### Task 8: 렌더러와 배선 (플레이 가능 상태)

**Files:**
- Create: `src/render/renderer.ts`
- Modify: `src/main.ts` (전면 교체)

- [ ] **Step 1: 렌더러 작성**

```ts
// src/render/renderer.ts
import { Application, Container, Graphics } from 'pixi.js';
import type { GameState } from '../game/state';

const COLORS = {
  bg: '#08080c',
  player: 0x46f0c8,
  playerDash: 0x9fffe9,
  enemy: 0xf05a6e,
  enemyFlash: 0xffffff,
} as const;

export class Renderer {
  readonly app = new Application();
  readonly world = new Container(); // 카메라 변환 대상
  readonly fx = new Container(); // 이펙트 레이어 (Task 9)
  shake = 0; // 남은 흔들림 강도(px)
  private playerG = new Graphics();
  private enemiesG = new Graphics();
  private shakeOffset = { x: 0, y: 0 };

  async init(): Promise<void> {
    await this.app.init({ background: COLORS.bg, resizeTo: window, antialias: true });
    document.body.appendChild(this.app.canvas);
    this.world.addChild(this.enemiesG, this.playerG, this.fx);
    this.app.stage.addChild(this.world);
  }

  // 화면 좌표 → 월드 좌표 (입력 에임에 사용)
  toWorld = (sx: number, sy: number): { x: number; y: number } => ({
    x: sx - this.world.position.x,
    y: sy - this.world.position.y,
  });

  draw(s: GameState, dtMs: number): void {
    this.updateCamera(s, dtMs);
    this.drawPlayer(s);
    this.drawEnemies(s);
  }

  private updateCamera(s: GameState, dtMs: number): void {
    this.shake = Math.max(0, this.shake - dtMs * 0.05);
    this.shakeOffset = {
      x: (Math.random() - 0.5) * this.shake, // 렌더 전용 난수 — 시뮬레이션 결정론과 무관
      y: (Math.random() - 0.5) * this.shake,
    };
    this.world.position.set(
      window.innerWidth / 2 - s.player.pos.x + this.shakeOffset.x,
      window.innerHeight / 2 - s.player.pos.y + this.shakeOffset.y,
    );
  }

  private drawPlayer(s: GameState): void {
    const p = s.player;
    const g = this.playerG;
    g.clear();
    g.position.set(p.pos.x, p.pos.y);
    g.rotation = p.facing;
    const dashing = p.dashTimer > 0;
    const color = dashing ? COLORS.playerDash : COLORS.player;
    const blink = p.invulnTimer > 0 && Math.floor(p.invulnTimer * 20) % 2 === 0;
    g.alpha = blink ? 0.35 : 1;
    // 본체 + 조준 방향 표시
    g.circle(0, 0, p.radius).stroke({ color, width: 3 });
    g.moveTo(p.radius * 0.4, 0).lineTo(p.radius * 1.3, 0).stroke({ color, width: 3 });
  }

  private drawEnemies(s: GameState): void {
    const g = this.enemiesG;
    g.clear();
    g.position.set(0, 0);
    for (const e of s.enemies) {
      const color = e.hitFlash > 0 ? COLORS.enemyFlash : COLORS.enemy;
      // 마름모 실루엣: 플레이어(원)와 즉시 구분되는 형태
      g.moveTo(e.pos.x, e.pos.y - e.radius)
        .lineTo(e.pos.x + e.radius, e.pos.y)
        .lineTo(e.pos.x, e.pos.y + e.radius)
        .lineTo(e.pos.x - e.radius, e.pos.y)
        .closePath()
        .stroke({ color, width: 3 });
    }
  }
}
```

- [ ] **Step 2: main.ts 교체**

```ts
// src/main.ts
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
```

- [ ] **Step 3: 시각 검증** — Run: `npm run dev` 후 브라우저에서 확인. Expected: WASD 이동, 마우스 방향으로 캐릭터 회전, 클릭 시 마름모 적이 밀려나며 3타에 소멸, 스페이스 대시, 적 접촉 시 깜빡임+화면 흔들림, 적은 항상 5마리 유지.

- [ ] **Step 4: 품질 게이트** — Run: `npm test && npm run build` · Expected: 전부 통과

- [ ] **Step 5: 커밋** — `git add -A && git commit -m "feat: 렌더러·입력 배선 — 플레이 가능한 전투 루프"`

---

### Task 9: 타격감 이펙트 (슬래시 호·파티클·대시 잔상)

**Files:**
- Create: `src/render/effects.ts`
- Modify: `src/render/renderer.ts`, `src/main.ts`

- [ ] **Step 1: 이펙트 모듈 작성**

```ts
// src/render/effects.ts
import { Container, Graphics } from 'pixi.js';

interface Fx {
  g: Graphics;
  life: number; // 남은 수명(ms)
  ttl: number;
  update: (g: Graphics, t: number) => void; // t: 1→0 진행도
}

export class Effects {
  private items: Fx[] = [];

  constructor(private layer: Container) {}

  private add(g: Graphics, ttl: number, update: Fx['update']): void {
    this.layer.addChild(g);
    this.items.push({ g, life: ttl, ttl, update });
  }

  // 공격 슬래시: 부채꼴 스트로크가 커지며 사라진다
  slash(x: number, y: number, angle: number, range: number, arc: number): void {
    const g = new Graphics();
    g.position.set(x, y);
    g.rotation = angle;
    this.add(g, 120, (gg, t) => {
      gg.clear();
      gg.arc(0, 0, range * (1.15 - 0.15 * t), -arc, arc)
        .stroke({ color: 0xd8fff4, width: 4 * t, alpha: t });
    });
  }

  // 원형 파편 버스트: 피격·사망 연출
  burst(x: number, y: number, color: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const g = new Graphics();
      this.add(g, 260, (gg, t) => {
        const d = speed * (1 - t);
        gg.clear();
        gg.position.set(x + Math.cos(a) * d, y + Math.sin(a) * d);
        gg.circle(0, 0, 3 * t).fill({ color, alpha: t });
      });
    }
  }

  // 대시 잔상: 시작 위치에 옅은 원이 남았다 사라진다
  ghost(x: number, y: number, radius: number): void {
    const g = new Graphics();
    g.position.set(x, y);
    this.add(g, 200, (gg, t) => {
      gg.clear();
      gg.circle(0, 0, radius).stroke({ color: 0x46f0c8, width: 2, alpha: 0.5 * t });
    });
  }

  tick(dtMs: number): void {
    for (const fx of this.items) {
      fx.life -= dtMs;
      fx.update(fx.g, Math.max(0, fx.life / fx.ttl));
    }
    this.items = this.items.filter((fx) => {
      if (fx.life > 0) return true;
      fx.g.destroy();
      return false;
    });
  }
}
```

- [ ] **Step 2: 렌더러에 연결** — `renderer.ts`에 필드 `readonly effects = new Effects(this.fx);` 추가 (import 포함), `draw()` 끝에 `this.effects.tick(dtMs);` 추가.

- [ ] **Step 3: 이벤트를 이펙트로 변환** — `main.ts`의 이벤트 루프를 다음으로 교체:

```ts
import { T } from './game/tuning';
// ... startLoop update 내부:
for (const ev of state.events) {
  const fx = renderer.effects;
  const p = state.player;
  switch (ev.type) {
    case 'playerAttack':
      fx.slash(p.pos.x, p.pos.y, ev.angle, T.attackRange, T.attackArc);
      break;
    case 'enemyHit':
      fx.burst(ev.pos.x, ev.pos.y, 0xf05a6e, 6, 40);
      renderer.shake = Math.max(renderer.shake, 6);
      break;
    case 'enemyDied':
      fx.burst(ev.pos.x, ev.pos.y, 0xffb4c0, 14, 80);
      renderer.shake = Math.max(renderer.shake, 10);
      break;
    case 'playerHit':
      fx.burst(ev.pos.x, ev.pos.y, 0x46f0c8, 10, 60);
      renderer.shake = Math.max(renderer.shake, 12);
      break;
    case 'dash':
      fx.ghost(ev.pos.x, ev.pos.y, p.radius);
      break;
  }
}
```

- [ ] **Step 4: 시각 검증** — Run: `npm run dev`. Expected: 공격 시 부채꼴 슬래시 호, 명중 시 파편+흔들림+히트스톱의 "멈칫", 처치 시 큰 버스트, 대시 시 잔상.

- [ ] **Step 5: 품질 게이트** — Run: `npm test && npm run build` · Expected: 통과

- [ ] **Step 6: 커밋** — `git add -A && git commit -m "feat: 타격감 이펙트 (슬래시·파티클·잔상·흔들림)"`

---

### Task 10: HP HUD (HTML 오버레이)

**Files:**
- Modify: `index.html`, `src/main.ts`

- [ ] **Step 1: HUD 마크업·스타일 추가** — `index.html`의 `<body>` 안, script 태그 위에:

```html
<div id="hud">
  <div id="hpbar"><div id="hpfill"></div></div>
</div>
<style>
  #hud {
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 10;
    font-family: monospace;
  }
  #hpbar {
    width: 220px;
    height: 14px;
    border: 2px solid #46f0c8;
    background: rgba(8, 8, 12, 0.7);
  }
  #hpfill {
    height: 100%;
    width: 100%;
    background: #46f0c8;
    transition: width 80ms linear;
  }
</style>
```

- [ ] **Step 2: main.ts에서 갱신** — startLoop의 update 끝에:

```ts
const hpfill = document.getElementById('hpfill') as HTMLDivElement;
// (boot 상단에서 1회 조회해 두고, update에서:)
hpfill.style.width = `${Math.max(0, (state.player.hp / state.player.maxHp) * 100)}%`;
```

- [ ] **Step 3: 시각 검증** — Run: `npm run dev`. Expected: 좌상단 네온 HP바, 피격 시 감소.

- [ ] **Step 4: 커밋** — `git add index.html src/main.ts && git commit -m "feat: HP HUD 오버레이"`

---

### Task 11: 배포·검증·섹션 마감

- [ ] **Step 1: 최종 품질 게이트** — Run: `npm test && npm run build` · Expected: 전부 통과

- [ ] **Step 2: 푸시** — `git push` · Expected: CI(테스트+빌드+배포) 성공

- [ ] **Step 3: 배포 검증** — https://kws0109.github.io/seedcore/ 접속, Task 8·9의 시각 검증 항목 재확인 + 콘솔 에러 0건

- [ ] **Step 4: 위키 회고 작성** — wiki-retrospective 스킬 발동 (분류: 기능 추가). 프롬프트 아카이브도 갱신 (CLAUDE.md 3-2)

- [ ] **Step 5: 아트 체크포인트** — 배포 링크를 사용자와 함께 보며 아트 방향 재정리 논의. 결과에 따라 다음 계획(던전 생성) 수립

---

## 계획 범위 밖 (다음 계획으로 이월)

- 던전 생성기(방 배치·시드 스폰), 원거리·엘리트 몬스터, 루팅·장비
- 코어 시스템(인코딩·공유 코드), NPC 시장, 성장
- 튜닝 상수의 JSON 데이터 테이블 이전
- pixi-filters 도입(블룸·글로우) — 아트 체크포인트 결정에 종속
