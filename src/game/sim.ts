import { angleDiff, angleTo, circlesOverlap, norm, type Vec } from '../engine/math';
import { isWall, TILE, type Dungeon } from './dungeon';
import type { GameState, InputFrame } from './state';
import { T } from './tuning';

export const DT = 1 / 60;

// 한 축씩 이동시키고 벽 타일에 클램프한다 (축 분리 → 벽 타기 이동이 자연스럽다).
function moveAxis(d: Dungeon | null, pos: Vec, r: number, dx: number, dy: number): void {
  pos.x += dx;
  pos.y += dy;
  if (!d) return;
  const minTx = Math.floor((pos.x - r) / TILE);
  const maxTx = Math.floor((pos.x + r) / TILE);
  const minTy = Math.floor((pos.y - r) / TILE);
  const maxTy = Math.floor((pos.y + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isWall(d, tx, ty)) continue;
      const cx = Math.max(tx * TILE, Math.min(pos.x, (tx + 1) * TILE));
      const cy = Math.max(ty * TILE, Math.min(pos.y, (ty + 1) * TILE));
      if ((pos.x - cx) ** 2 + (pos.y - cy) ** 2 >= r * r) continue;
      if (dx > 0) pos.x = tx * TILE - r;
      else if (dx < 0) pos.x = (tx + 1) * TILE + r;
      if (dy > 0) pos.y = ty * TILE - r;
      else if (dy < 0) pos.y = (ty + 1) * TILE + r;
    }
  }
}

export function step(s: GameState, inp: InputFrame): void {
  s.events = [];
  if (s.hitstop > 0) {
    s.hitstop = Math.max(0, s.hitstop - DT);
    return;
  }
  s.tick += 1;
  const p = s.player;

  // 타이머 감소
  p.dashCooldown = Math.max(0, p.dashCooldown - DT);
  p.attackCooldown = Math.max(0, p.attackCooldown - DT);
  p.invulnTimer = Math.max(0, p.invulnTimer - DT);
  p.dashTimer = Math.max(0, p.dashTimer - DT);

  stepDash(s, inp);
  stepMove(s, inp);
  stepAttack(s, inp);
  stepEnemies(s);
}

function stepDash(s: GameState, inp: InputFrame): void {
  const p = s.player;
  if (!inp.dash || p.dashCooldown > 0) return;
  p.dashTimer = T.dashDuration;
  p.dashCooldown = T.dashCooldown;
  const hasMove = inp.moveX !== 0 || inp.moveY !== 0;
  const dir = hasMove
    ? norm({ x: inp.moveX, y: inp.moveY })
    : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
  p.vel = { x: dir.x * T.dashSpeed, y: dir.y * T.dashSpeed };
  s.events.push({ type: 'dash', pos: { ...p.pos }, angle: Math.atan2(dir.y, dir.x) });
}

function stepMove(s: GameState, inp: InputFrame): void {
  const p = s.player;
  if (p.dashTimer === 0) {
    const dir = norm({ x: inp.moveX, y: inp.moveY });
    p.vel = { x: dir.x * T.playerSpeed, y: dir.y * T.playerSpeed };
  }
  moveAxis(s.dungeon, p.pos, p.radius, p.vel.x * DT, 0);
  moveAxis(s.dungeon, p.pos, p.radius, 0, p.vel.y * DT);
  p.facing = angleTo(p.pos, { x: inp.aimX, y: inp.aimY });
}

function stepAttack(s: GameState, inp: InputFrame): void {
  const p = s.player;
  if (!inp.attack || p.attackCooldown > 0) return;
  p.attackCooldown = T.attackCooldown;
  s.events.push({ type: 'playerAttack', angle: p.facing });
  for (const e of s.enemies) {
    const dx = e.pos.x - p.pos.x;
    const dy = e.pos.y - p.pos.y;
    const dist = Math.hypot(dx, dy);
    const inRange = dist <= T.attackRange + e.radius;
    const inArc = angleDiff(angleTo(p.pos, e.pos), p.facing) <= T.attackArc;
    if (!inRange || !inArc) continue;
    e.hp -= T.attackDamage;
    e.hitFlash = 0.1;
    const kb = norm({ x: dx, y: dy });
    e.vel.x += kb.x * T.attackKnockback * e.kbResist;
    e.vel.y += kb.y * T.attackKnockback * e.kbResist;
    s.hitstop = T.hitstopSec;
    s.events.push({ type: 'enemyHit', pos: { ...e.pos }, angle: p.facing });
  }
}

function stepEnemies(s: GameState): void {
  const p = s.player;
  for (const e of s.enemies) {
    e.hitFlash = Math.max(0, e.hitFlash - DT);
    // 넉백 감쇠 + 추적
    e.vel.x *= 0.85;
    e.vel.y *= 0.85;
    const dir = norm({ x: p.pos.x - e.pos.x, y: p.pos.y - e.pos.y });
    moveAxis(s.dungeon, e.pos, e.radius, (e.vel.x + dir.x * e.speed) * DT, 0);
    moveAxis(s.dungeon, e.pos, e.radius, 0, (e.vel.y + dir.y * e.speed) * DT);
    const canHit = p.invulnTimer === 0 && p.dashTimer === 0;
    if (canHit && circlesOverlap(p.pos, p.radius, e.pos, e.radius)) {
      p.hp -= e.touchDamage;
      p.invulnTimer = T.playerInvulnAfterHit;
      s.events.push({ type: 'playerHit', pos: { ...p.pos } });
    }
  }
  for (const e of s.enemies) {
    if (e.hp <= 0) s.events.push({ type: 'enemyDied', pos: { ...e.pos } });
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
}
