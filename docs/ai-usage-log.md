# AI 활용 로그

작업하면서 즉시 기록한다. 형식: 날짜 / 도구 / 무엇을 시켰나 / 결과물.
외부 에셋(이미지·사운드·폰트 등)을 쓰는 순간 출처·라이선스를 여기에 함께 기록한다.

## 2026-07-31

- **Claude Code (Fable 5)** — 프로젝트 목표·범위 정의 및 요구사항 분석.
- **Claude Code (Fable 5)** — 게임 컨셉 브레인스토밍(클래리파잉 질문 → 접근안 비교 → 설계 확정).
  산출물: `docs/superpowers/specs/2026-07-31-dungeon-core-design.md`
  주요 결정: 시드 결정론 기반 던전 코어 거래/공유, 탑다운 액션, PixiJS+자작 엔진(로직/렌더 분리).
- **Claude Code (Fable 5)** — 개발 루프 세팅: GitHub 레포 생성, Vite+TS+PixiJS 스캐폴드,
  CI(테스트+빌드) → GitHub Pages 자동 배포 파이프라인 구축, 배포 검증.
  산출물: https://kws0109.github.io/seedcore/

## 2026-08-01

- **Claude Code (Fable 5)** — 회고록 자동화 스킬(`.claude/skills/wiki-retrospective`) 제작.
  섹션 완료 시 GitHub 위키에 Why/How/Flow 회고를 분류별로 기록하는 워크플로를 스킬화하고,
  첫 회고("개발 루프 구축")를 실제 작성해 절차를 검증.

## 외부 에셋·오픈소스

| 항목 | 용도 | 라이선스 |
|---|---|---|
| PixiJS v8 | 렌더링 | MIT |
| Vite / Vitest / TypeScript | 빌드·테스트 | MIT/Apache-2.0 |
