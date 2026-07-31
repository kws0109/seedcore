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
