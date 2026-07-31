# Seedcore 생성기 개편 (D4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RNG 스트림을 분리해 코어 공유의 버전 안정성 기반을 만들고, 유기적 지형과 바이옴 3종으로 맵 생동감을 높인다.

**Architecture:** `deriveSeed(seed, label)`로 시드에서 독립 서브 스트림(layout/spawn/loot/biome)을 파생 — 한 스트림의 생성 로직 변경이 다른 스트림 결과를 흔들지 않는다. 방은 사각형 대신 노이즈 블롭으로, 복도는 랜덤 워크로 조각한다. 바이옴은 생성 프리셋 + 팔레트 + 텍스처만 차등하는 얇은 레이어이며 시드에서 결정된다.

**핵심 결정:**

1. 스트림 분리는 코어 코드가 외부 공유되기 전 마지막 기회 — 이 계획이 코어 시스템에 선행해야 한다.
2. 유기적 캐브는 타임박스 반나절. 플러드필 도달 가능성 테스트가 안전망 (깎다 고립 구역이 생기면 배포 차단).
3. 바이옴 = {생성 파라미터, 팔레트·광원, 바닥·소품 텍스처, 궁수 비중}만. 전용 몬스터·기믹은 백로그.
4. 바이옴 3종: `crypt`(전통 지하묘지·각진 방·횃불 주황) / `cavern`(지하동굴·덩어리 방·이끼 한청록) / `abyss`(해저동굴·넓고 불규칙·심해 청록). 이름은 HUD에 표기.

### Task 1: deriveSeed + 스트림 분리

**Files:** Modify `src/engine/rng.ts`, `src/game/dungeon.ts` · Test `tests/rng.test.ts`, `tests/dungeon.test.ts`

- [ ] 테스트: `deriveSeed(s, 'a') !== deriveSeed(s, 'b')`, 같은 인자는 같은 값, 시드가 다르면 다른 값
- [ ] rng.ts에 FNV-1a 기반 `deriveSeed(seed: number, label: string): number` 추가
- [ ] generateDungeon을 layout/spawn/loot 3개 스트림으로 재배선 (방·복도=layout, 몬스터 배치=spawn, 드롭 롤=loot)
- [ ] 기존 결정론·도달성 테스트 통과 확인, 커밋

### Task 2: 유기적 캐브

**Files:** Modify `src/game/dungeon.ts` · Test `tests/dungeon.test.ts`

- [ ] 방: 사각형 채우기 → 타원 정규화 거리 + 타일별 노이즈 블롭 캐브 (중심부는 항상 바닥 보장)
- [ ] 복도: L자 → 목표 지향 랜덤 워크(2타일 폭, 지터 확률 프리셋화)
- [ ] 스폰·횃불 위치: 블롭 내 실제 바닥 타일에서 결정론적 재시도 선택
- [ ] 테스트 강화: 플러드필 시드 8개로 확대, 방마다 바닥 타일 ≥8개 보장
- [ ] dev 시각 확인 후 커밋

### Task 3: 바이옴 레이어 3종

**Files:** Modify `src/game/dungeon.ts`(Biome·프리셋), `src/render/renderer.ts`(팔레트·텍스처), `assets/manifest.json`(+4), `index.html`·`src/main.ts`(바이옴 표기) · Test `tests/dungeon.test.ts`

- [ ] Biome 타입·프리셋 테이블(방 크기·노이즈 진폭·복도 지터·궁수 확률), `deriveSeed(seed,'biome')`로 결정
- [ ] 에셋 4종 생성: `floor-cave`(이끼 낀 동굴 바위), `floor-abyss`(심해 모래·산호 조각), `prop-mushroom`(발광 버섯 군락), `prop-coral`(발광 산호) — 스타일 템플릿 동일 적용, 축소 포함
- [ ] 렌더러: 바이옴별 바닥 텍스처·틴트, 광원 색(crypt 주황/cavern 한청록/abyss 심해 청록), 소품 텍스처 교체
- [ ] HUD에 바이옴 이름·시드 표기 (코어 공유 UX의 사전 작업)
- [ ] 테스트: 시드→바이옴 결정론, 시드 1~40 범위에서 3종 모두 등장, 전 바이옴 플러드필 통과
- [ ] dev 시각 확인 후 커밋

### Task 4: 배포·검증·회고

- [ ] `npm test && npm run build` → push → CI → 배포 URL 검증 (3개 시드로 바이옴별 부트 확인)
- [ ] 위키 회고(Major Update) + 프롬프트 아카이브·AI 로그 갱신

## 계획 범위 밖

- 코어 인코딩·공유·NPC 시장 (다음 계획, D5~6)
- 바이옴 전용 몬스터·기믹, 4번째 바이옴 (제출 동결 후 백로그)
