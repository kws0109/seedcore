# Seedcore 던전 생성 (D3~4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시드 하나에서 방 배치·몬스터 스폰·드롭까지 전부 결정되는 던전을 만들고, 몬스터 3종·루팅·클리어 루프를 완성한다.

**Architecture:** `generateDungeon(seed)`가 타일맵·스폰·사전 롤링된 드롭을 가진 불변 데이터 구조를 반환하고, 시뮬레이션은 그 데이터로 초기화된다. 드롭은 생성 시점에 확정(사전 롤링)되어 "던전의 총 전리품이 시드에 고정"이라는 핵심 규칙을 구조적으로 보장한다. 몬스터 스탯은 JSON 데이터 테이블로 분리한다.

**Tech Stack:** 기존과 동일 (PixiJS v8, TS, Vitest)

**파일 구조:**

```
src/game/dungeon.ts     # 생성기: 타일맵(64px 그리드)·방·복도·스폰·드롭 사전 롤링
src/data/enemies.json   # 몬스터 3종 스탯 테이블 (kind별)
src/game/state.ts       # 확장: Enemy.kind, projectiles, drops, gold, items, cleared
src/game/sim.ts         # 확장: 벽 충돌, 궁수·브루트 AI, 투사체, 드롭 픽업, 클리어 판정
src/render/renderer.ts  # 확장: 벽·횃불·몬스터 종별 스프라이트·투사체·드롭
src/main.ts             # 던전 생명주기: 클리어/사망 오버레이, R 키 재시작
tests/dungeon.test.ts   # 결정론·도달 가능성·충돌
tests/combat.test.ts    # 확장: 궁수·투사체·드롭·클리어
```

**핵심 설계 결정 (코드로 고정할 것):**

1. **타일**: `TILE = 64` 월드 단위, `0=벽, 1=바닥`인 `Uint8Array` 48×48.
2. **생성 알고리즘**: 겹침 없는 방 7~9개 무작위 배치(마진 1타일, 시드 RNG) → 배치 순서대로 이전 방과 L자 복도(2타일 폭) 연결 → 시작 방 = 첫 방, 최심방(시작에서 중심 거리 최대) = 브루트 방.
3. **스폰 규칙**: 시작 방 제외 각 방에 구울 2~3, 40% 확률 궁수 1. 최심방에 브루트 1 + 구울 2.
4. **드롭 사전 롤링**: 생성 시점에 적마다 골드량·아이템(확률: 구울 10%/궁수 20%/브루트 100%, 희귀도 common 70/rare 25/epic 5, 스탯: atk|hp|speed)을 확정해 `EnemySpawn.drop`에 저장. 플레이 중 롤 없음.
5. **벽 충돌**: 축 분리 이동(x 이동→충돌 해소, y 이동→충돌 해소). 원 vs 타일 AABB.
6. **궁수 AI**: 플레이어와 거리 200~300 유지(멀면 접근, 가까우면 후퇴), 1.8초마다 투사체 발사. 투사체는 벽·플레이어 충돌 시 소멸, ttl 3초.
7. **브루트**: 저속·고체력·넉백 저항(×0.3)·큰 접촉 피해. 전부 JSON 테이블 수치.
8. **클리어**: 적 전멸 → `cleared=true` + `dungeonCleared` 이벤트 1회. 사망 → `playerDied` 이벤트, 같은 시드로 재생성(결정론 시연). 클리어 후 R → 새 시드.
9. **필수 불변식 테스트**: (a) 같은 시드 → 타일·스폰·드롭 완전 동일, (b) **모든 바닥 타일이 시작점에서 도달 가능**(플러드필) — 클리어 불가능 던전 차단, (c) 벽 관통 불가.

---

### Task 1: 몬스터 데이터 테이블 (JSON 분리)

**Files:** Create `src/data/enemies.json` · Modify `tsconfig.json`(`resolveJsonModule`), `src/game/state.ts`(Enemy.kind), `src/game/sim.ts`(테이블 참조)

- [ ] enemies.json: kind별 `{ radius, hp, speed, touchDamage, kbResist }` + archer 전용 `{ preferRange: [200,300], shootCooldown: 1.8, projectileSpeed: 320, projectileDamage: 14 }`
- [ ] `createEnemy(id, pos, kind)`로 시그니처 변경, 기존 테스트의 createEnemy 호출은 `'ghoul'` 명시로 갱신
- [ ] `npm test` 통과 확인 후 커밋

### Task 2: 던전 생성기 + 결정론·도달 가능성 테스트

**Files:** Create `src/game/dungeon.ts`, `tests/dungeon.test.ts`

- [ ] 테스트 먼저: 같은 시드 2회 생성 → `JSON.stringify` 동일 / 다른 시드 → 상이 / 플러드필로 전 바닥 타일 도달 가능 / 방 개수 7~9 / 시작 방에 스폰 없음
- [ ] 구현 핵심 시그니처:

```ts
export const TILE = 64;
export interface RolledDrop { gold: number; item: { rarity: 'common'|'rare'|'epic'; stat: 'atk'|'hp'|'speed' } | null; }
export interface EnemySpawn { kind: EnemyKind; pos: Vec; drop: RolledDrop; }
export interface Dungeon {
  seed: number; w: number; h: number; tiles: Uint8Array;
  spawn: Vec; enemies: EnemySpawn[]; torches: Vec[];
}
export function generateDungeon(seed: number): Dungeon;
export function isWall(d: Dungeon, tx: number, ty: number): boolean; // 경계 밖=벽
```

- [ ] 방 배치 rejection sampling(최대 200회 시도), L자 복도 캐브, 스폰·드롭 사전 롤링, 방마다 횃불 1개(벽에 인접한 바닥 타일)
- [ ] 커밋

### Task 3: 벽 충돌

**Files:** Modify `src/game/sim.ts`, `src/game/state.ts`(GameState.dungeon), Test `tests/dungeon.test.ts`

- [ ] 테스트 먼저: 시작점에서 한 방향으로 600틱 이동해도 어떤 틱에서도 원이 벽 타일과 겹치지 않는다 (모든 틱 검사)
- [ ] `createStateFromDungeon(d)`: 플레이어를 spawn에, EnemySpawn → Enemy 인스턴스화(드롭 연결)
- [ ] 이동을 축 분리로 변경: x 적용→`resolveCircleVsWalls`, y 적용→동일. 적·투사체에도 동일 적용
- [ ] 커밋

### Task 4: 궁수·투사체·브루트

**Files:** Modify `src/game/sim.ts`, `src/game/state.ts`(Projectile), Test `tests/combat.test.ts`

- [ ] 테스트 먼저: 사거리 내 궁수가 쿨다운마다 투사체 생성 / 투사체가 플레이어에 닿으면 1회 피해 후 소멸 / 대시 중엔 무시 / 브루트 넉백이 구울보다 작다
- [ ] Projectile `{ id, pos, vel, radius: 5, damage, ttl }`, 벽 충돌 시 소멸
- [ ] kind별 AI 분기: ghoul=추적(기존), archer=거리 유지+발사, brute=저속 추적
- [ ] 커밋

### Task 5: 드롭·픽업·클리어 판정

**Files:** Modify `src/game/sim.ts`, `src/game/state.ts`(Drop, gold, items, cleared), Test `tests/combat.test.ts`

- [ ] 테스트 먼저: 적 처치 → 사전 롤링된 드롭 스폰 / 접근 시 골드 증가·아이템 스탯 즉시 적용(atk는 공격력 배율, hp는 최대·현재 체력, speed는 이속) / 전멸 → `dungeonCleared` 이벤트 정확히 1회
- [ ] 픽업 반경 26, 이벤트 `dropPicked`·`dungeonCleared`·`playerDied` 추가
- [ ] 커밋

### Task 6: 렌더링 (벽·횃불·종별 스프라이트·투사체·드롭)

**Files:** Modify `src/render/renderer.ts`

- [ ] 벽: 던전 로드 시 1회 빌드하는 정적 Graphics(비바닥 타일 사각형 + 외곽 4개 대형 사각형), 짙은 색 + 상단 하이라이트 1px
- [ ] 횃불: 스프라이트 + 가산 글로우(깜빡임), 방당 1개
- [ ] 몬스터: kind→텍스처 매핑(ghoul/archer/brute), 브루트는 스케일 1.4배
- [ ] 투사체: 프레임마다 다시 그리는 Graphics(핏빛 볼트 + 잔광)
- [ ] 드롭: 골드=황동 원 글로우, 아이템=core-crystal 스프라이트를 희귀도 색으로 틴트
- [ ] `setDungeon(d)` 메서드로 던전 교체 시 벽·횃불 재구축
- [ ] 시각 검증(dev) 후 커밋

### Task 7: 던전 생명주기 (오버레이·재시작)

**Files:** Modify `src/main.ts`, `index.html`

- [ ] index.html에 `#overlay`(중앙 패널: 제목·골드·아이템 목록·안내문)와 `#gold` HUD 추가, 다크 톤 스타일
- [ ] main: 시드 관리(초기 시드 → 클리어 후 R=새 시드, 사망 후 R=같은 시드 재생성), `dungeonCleared`/`playerDied` 이벤트 시 오버레이 표시·입력 시 재개
- [ ] 프로토타입용 "상시 5마리 유지" 스포너 제거
- [ ] 시각 검증 후 커밋

### Task 8: 배포·검증·섹션 마감

- [ ] `npm test && npm run build` → push → CI 성공 → 배포 URL 콘솔·부트 검증
- [ ] 위키 회고(기능 추가) + 프롬프트 아카이브 갱신
- [ ] 다음 계획(코어 시스템·시장) 착수 판단

## 계획 범위 밖

- 코어 인코딩·공유 코드, NPC 시장, 스탯 상점 (다음 계획)
- 미니맵, 사운드, 보스
