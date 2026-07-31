# Seedcore 프로시저럴 애니메이션 (D8 전반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정적 스프라이트에 그림자·무게감 있는 걷기·사망 연출을 코드 모션으로 입혀 "떠다니는" 인상을 없앤다.

**Architecture:** 전부 렌더러 쪽 변경(시뮬레이션·테스트 무변경). 애니메이션 위상은 시뮬레이션 tick 기반 — 히트스톱 때 자동으로 함께 멈춰 타격감과 정합.

### Task 1: 그림자 레이어

- [ ] 렌더러에 shadowsG(Graphics, 엔티티 아래 레이어) — 플레이어·적·아이템 드롭에 타원 그림자를 매 프레임 드로잉
- [ ] 점프·바운스 높이에 따라 그림자 크기 미세 축소 (공중감)

### Task 2: 걷기·대시·공격 모션 (플레이어)

- [ ] 걷기: tick 위상 기반 뒤뚱임(rotation 진동) + 착지 스쿼시(volume 보존 x/y 역스케일) + 홉
- [ ] 정지: 호흡 스케일. 대시: 이동 방향 스트레치. 공격: 조준 방향 런지(0.12초 전진 오프셋 + 회전 킥)
- [ ] 적: 이동 감지(프레임 간 위치 델타) 시 개체별 위상 뒤뚱임·홉, 피격 시 방향성 스쿼시

### Task 3: 사망 연출 (시체 페이드)

- [ ] 적 스프라이트 제거 시점에 같은 텍스처·변환으로 시체 스프라이트 생성 → 0.4초 동안 회전·납작·페이드 후 소멸
- [ ] 이펙트 버스트와 겹쳐 "터지며 쓰러지는" 인상

### Task 4: 검증·배포·회고

- [ ] npm test && build → dev 시각 확인(사용자 눈 검증 포함) → push → CI → 배포 검증
- [ ] 위키 회고(기능 추가) + 로그 갱신

## 범위 밖

- 프레임 스프라이트 시트, 부위 분리 리깅, 타격감 수치 튜닝(다음 폴리싱 구간)
