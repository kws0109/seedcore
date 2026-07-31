# Seedcore 코어 시스템 (D5~6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 클리어한 던전을 코어로 응축해 시드 코드로 공유하고, 드롭 목록이 공개된 코어를 NPC 시장에서 사고팔며, 골드로 스탯을 강화하는 메타 루프를 완성한다.

**Architecture:** 코어 코드 = `SC1-<시드hex>-<체크섬>` — 시드만 있으면 던전 전체(바이옴·배치·확정 드롭)가 재현되므로 코드가 극도로 짧다. 드롭 목록·감정가는 `generateDungeon(seed)`를 로컬 재생성해 파생한다. 메타 상태(골드·장비·코어·강화)는 localStorage에 저장한다.

**게임 규칙 (설계 확정 사항 재확인):**

- 클리어한 던전은 **루팅과 무관하게** 코어로 응축 가능 (경험의 녹화본 철학)
- 코어는 **입장 시 1회 소모**. 코어로 연 던전은 **재코어화 불가** (무한 복제 차단). 사망 후 R 재도전은 허용 (아직 클리어 못 했으므로)
- 시장 구매 코어는 드롭 목록이 공개됨 — "원하는 아이템이 든 던전을 골라 산다"
- 코드 입력으로 받은 코어는 무료 (선물 링크 개념)

**파일 구조:**

```
src/game/core.ts     # encode/decode/체크섬, summarizeDungeon, appraise(감정가), 시장 재고
src/meta/save.ts     # 메타 상태 직렬화 + localStorage 저장/로드
src/ui/market.ts     # 시장 패널 DOM (보유 코어·시장 재고·강화·코드 입력)
src/main.ts          # 코어화 액션(C)·코어 입장·시장 토글(M)·저장 배선
index.html           # 시장 패널 마크업·스타일
tests/core.test.ts   # 인코딩 왕복·체크섬·요약·감정가·직렬화
```

**가격 규칙:** 아이템 가치 common 15 / rare 40 / epic 120. 감정가 = ⌊0.6×아이템가치합 + 0.5×골드합 + 2×몬스터수⌋. 시장 판매가(플레이어가 살 때) = 감정가×1.6+20. 스탯 강화 비용 = 40×(현재레벨+1)^1.5 (공격+5%/체력+10/이속+3% per 레벨).

### Task 1: 코어 인코딩·요약·감정 (TDD)

**Files:** Create `src/game/core.ts`, `tests/core.test.ts`

- [ ] 테스트: encode→decode 왕복(시드 보존), 손상 코드 거부(체크섬), 형식 오류 거부, 버전 접두 확인, summarize가 generateDungeon과 일치(바이옴·몬스터 수·아이템 목록·골드합), appraise 결정론
- [ ] `encodeCore(seed): string` / `decodeCore(code): number | null` (FNV 체크섬 4hex)
- [ ] `summarizeDungeon(seed)`: { biome, enemyCount, brutes, items: {rarity,stat}[], totalGold }
- [ ] `appraise(seed): number`, `rollMarketSeed(): number`(Math.random 기반 — 시장 재고는 로컬 메타라 결정론 불필요)
- [ ] 커밋

### Task 2: 메타 저장 (TDD)

**Files:** Create `src/meta/save.ts`, 테스트는 `tests/core.test.ts`에 추가

- [ ] 테스트: serialize→deserialize 왕복, 손상 JSON·버전 불일치 시 null(새 게임), 알 수 없는 필드 무시
- [ ] `MetaState = { v: 1, gold, items: OwnedItem[], cores: number[], upgrades: {atk,hp,speed} }`
- [ ] `saveMeta/loadMeta` (localStorage, try-catch로 프라이빗 모드 등에서도 게임은 동작)
- [ ] 커밋

### Task 3: 코어화·코어 입장 배선

**Files:** Modify `src/main.ts`, `index.html`(클리어 오버레이 힌트)

- [ ] 클리어 오버레이에 "C — 던전을 코어로 응축" (코어 입장 던전이면 숨김). C 입력 시 cores에 시드 추가·오버레이 갱신·저장
- [ ] 코어 입장: 인벤토리에서 사용 → 코어 소모(목록 제거·저장) → 해당 시드 던전 진입, `fromCore=true`로 재코어화 차단. 사망 R 재도전은 같은 시드 유지
- [ ] 강화·장비 효과가 enterDungeon마다 재적용되는 기존 구조에 upgrades 반영
- [ ] 커밋

### Task 4: 시장 패널 (DOM)

**Files:** Create `src/ui/market.ts` · Modify `index.html`, `src/main.ts`

- [ ] M 키(또는 HUD 버튼)로 토글, 열리면 시뮬레이션 일시정지. 다크 톤 패널, 4개 섹션:
  - 보유 코어: 바이옴·감정가·드롭 요약 표시, [입장] [판매 <감정가>G] [코드 복사]
  - 시장: 재고 4개 (바이옴·가격·**드롭 목록 전체 공개**), [구매] — 구매 슬롯은 새 재고로 교체
  - 코드 입력: 텍스트 입력 → 검증 실패 시 인라인 오류, 성공 시 보유 코어에 추가
  - 강화: 공격/체력/이속 레벨·비용 표시, 골드 부족 시 비활성
- [ ] 모든 상태 변화 시 저장. 코드 복사는 clipboard API + 실패 시 코드 문자열 노출 폴백
- [ ] dev 시각·기능 검증 후 커밋

### Task 5: 배포·검증·섹션 마감

- [ ] `npm test && npm run build` → push → CI → 배포 검증 (코드 왕복: 게임 A에서 복사한 코드를 새 시크릿 창에서 입력해 같은 던전 확인)
- [ ] 위키 회고(기능 추가) + 프롬프트 아카이브·AI 로그 갱신

## 계획 범위 밖

- 유저 간 실시간 거래소, 코어 조합·강화(스펙의 확장 아이디어 — 일정 여유 시 별도 판단)
- 사운드, 보스, 미니맵
