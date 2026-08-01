import type { Vec } from '../engine/math';
import { isWall, TILE, type Dungeon } from './dungeon';

// 시야: 두 점 사이를 반타일 간격으로 샘플링해 벽 타일 통과 여부 검사.
// 던전이 없으면(테스트 평면) 항상 보인다.
export function hasLineOfSight(d: Dungeon | null, from: Vec, to: Vec): boolean {
  if (!d) return true;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / (TILE / 2)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor((from.x + dx * t) / TILE);
    const ty = Math.floor((from.y + dy * t) / TILE);
    if (isWall(d, tx, ty)) return false;
  }
  return true;
}

// 타일 그리드 A* (4방향). 결정론: 개방 목록에서 f 최소·인덱스 최소 순으로 선택.
// 반환: 타일 중심 웨이포인트 배열 (시작 타일 제외, 목표 타일 포함). 실패 시 [].
export function findPath(d: Dungeon, from: Vec, to: Vec): Vec[] {
  const sx = Math.floor(from.x / TILE);
  const sy = Math.floor(from.y / TILE);
  const gx = Math.floor(to.x / TILE);
  const gy = Math.floor(to.y / TILE);
  if (isWall(d, gx, gy) || isWall(d, sx, sy)) return [];
  if (sx === gx && sy === gy) return [];

  const size = d.w * d.h;
  const gScore = new Float64Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const startIdx = sy * d.w + sx;
  const goalIdx = gy * d.w + gx;
  gScore[startIdx] = 0;
  const open: number[] = [startIdx];

  const h = (idx: number): number => {
    const x = idx % d.w;
    const y = Math.floor(idx / d.w);
    return Math.abs(x - gx) + Math.abs(y - gy);
  };

  let guard = 0;
  while (open.length > 0 && guard++ < size * 4) {
    // f 최소 선택 (동률이면 배열 앞쪽 — 결정론)
    let best = 0;
    let bestF = gScore[open[0]] + h(open[0]);
    for (let i = 1; i < open.length; i++) {
      const f = gScore[open[i]] + h(open[i]);
      if (f < bestF) {
        bestF = f;
        best = i;
      }
    }
    const cur = open.splice(best, 1)[0];
    if (cur === goalIdx) {
      // 경로 복원
      const path: Vec[] = [];
      let node = goalIdx;
      while (node !== startIdx && node >= 0) {
        const x = node % d.w;
        const y = Math.floor(node / d.w);
        path.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
        node = cameFrom[node];
      }
      path.reverse();
      return path;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % d.w;
    const cy = Math.floor(cur / d.w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (isWall(d, nx, ny)) continue;
      const nIdx = ny * d.w + nx;
      if (closed[nIdx]) continue;
      const tentative = gScore[cur] + 1;
      if (tentative < gScore[nIdx]) {
        gScore[nIdx] = tentative;
        cameFrom[nIdx] = cur;
        if (!open.includes(nIdx)) open.push(nIdx);
      }
    }
  }
  return [];
}
