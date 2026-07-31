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
  playerInvulnAfterHit: 0.6,
  pickupRadius: 26,
  // 아이템 희귀도별 효과: atk·speed는 배율 가산, hp는 최대체력 가산(+즉시 회복)
  itemAtk: { common: 0.08, rare: 0.15, epic: 0.25 },
  itemHp: { common: 15, rare: 30, epic: 60 },
  itemSpeed: { common: 0.05, rare: 0.1, epic: 0.18 },
} as const;
