export type Rng = () => number;

// 시드 + 라벨 → 독립 서브 시드 (FNV-1a).
// 스트림별 생성 로직이 서로의 결과를 흔들지 않게 하는 버전 안정성 장치.
// 주의: 이 함수의 구현이 바뀌면 모든 공유 코드가 무효화된다 — 코어 공유 시작 후 변경 금지.
export function deriveSeed(seed: number, label: string): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 시드 상위 비트도 섞는다
  h ^= Math.imul(seed >>> 16, 0x01000193);
  return h >>> 0;
}

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
