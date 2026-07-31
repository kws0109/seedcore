---
name: wiki-retrospective
description: Use when a work section is completed and committed in the seedcore project — a feature is done, a bug is fixed, a major refactor/milestone lands, or a design/infra decision is finalized. Also use when the user says 회고, 회고록, retrospective, or wiki 기록. Do NOT use for individual commits or small code tweaks mid-section.
---

# Wiki Retrospective (Seedcore)

## Overview

작업 섹션이 끝날 때마다 GitHub 위키에 회고록을 남겨 **Why(왜 이 방향인가)와 How(어떻게 했는가)**를 명확히 한다.
목적은 커밋 로그가 말해주지 못하는 **작업 방향의 흐름**을 기록하는 것이다.

## When

- 트리거: 섹션 완료 시점 — 기능 완성, 버그 수정 완결, 대규모 변경 안착, 설계·인프라 결정 확정. 해당 커밋을 푸시한 직후가 적기.
- 금지: 커밋 1개·코드 몇 줄 단위로 쓰지 않는다. 섹션 중간에는 쓰지 않는다.
- 판단 기준: "이 작업 묶음의 Why를 한 문단으로 말할 수 있는가?" — 있으면 섹션, 없으면 아직 아니다.

## Where

- 위키 로컬 클론: `C:/Users/ryan1/Documents/seedcore.wiki`
  (없으면 `git clone https://github.com/kws0109/seedcore.wiki.git` 으로 생성 후
  `git config user.name "kws0553" && git config user.email "kws0553@gmail.com"` 설정 — 없으면 커밋 실패)
- 쓰기 전 반드시 `git pull`, 쓴 뒤 커밋·푸시.

## How

1. 분류 선택 (하나): `기능 추가` / `bugFix` / `Major Update` / `설계·인프라`
2. 페이지 생성: `YYYY-MM-DD-<영문-슬러그>.md` (예: `2026-08-01-dungeon-generator.md`)
3. 아래 템플릿으로 작성 (한국어, 각 항목 1~3문단, 서사 아님):

```markdown
# <제목>

- 분류: <카테고리> · 날짜: YYYY-MM-DD · 관련 커밋: <해시들>

## What — 무엇을 했나
## Why — 왜 이 방향인가
검토한 대안과 버린 이유를 반드시 포함.
## How — 어떻게 구현/해결했나
핵심 구조·판단만. 코드 나열 금지.
## Flow — 흐름
이전 섹션과의 연결, 이 작업이 다음에 여는 것, 방향 변경이 있었다면 그 지점.
```

4. `Home.md` 갱신: 카테고리별 목록에 새 페이지 링크를 최신순으로 추가.
   링크 형식: `[[제목|페이지파일명-확장자-제외]]`
5. 위키 레포에서 `git add -A && git commit -m "회고: <제목>" && git push`

## Common Mistakes

- ❌ 커밋 메시지 재탕 → 커밋이 못 담는 Why(대안 비교, 방향 전환)를 쓴다
- ❌ 작업 일지("~했다" 나열) → Flow 항목이 없으면 회고가 아니다
- ❌ Home.md 갱신 누락 → 목록에 없는 회고는 없는 것과 같다
- ❌ 메인 레포에 회고 파일 생성 → 회고는 위키 레포에만
