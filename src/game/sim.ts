import { angleDiff, angleTo, circlesOverlap, norm, type Vec } from '../engine/math';
import { deriveSeed, mulberry32 } from '../engine/rng';
import { findPath, hasLineOfSight } from './ai';
import { isWall, TILE, type Dungeon } from './dungeon';
import type { Enemy, GameState, InputFrame } from './state';
import { T } from './tuning';
import ENEMIES from '../data/enemies.json';

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
  if (s.dead) return; // 사망 후 세계 정지 (재시작은 main 담당)
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
  stepProjectiles(s);
  stepDrops(s);

  if (p.hp <= 0 && !s.dead) {
    s.dead = true;
    s.events.push({ type: 'playerDied' });
  }
}

function circleHitsWall(d: Dungeon | null, pos: Vec, r: number): boolean {
  if (!d) return false;
  const minTx = Math.floor((pos.x - r) / TILE);
  const maxTx = Math.floor((pos.x + r) / TILE);
  const minTy = Math.floor((pos.y - r) / TILE);
  const maxTy = Math.floor((pos.y + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isWall(d, tx, ty)) continue;
      const cx = Math.max(tx * TILE, Math.min(pos.x, (tx + 1) * TILE));
      const cy = Math.max(ty * TILE, Math.min(pos.y, (ty + 1) * TILE));
      if ((pos.x - cx) ** 2 + (pos.y - cy) ** 2 < r * r) return true;
    }
  }
  return false;
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
    const speed = T.playerSpeed * p.speedMul;
    p.vel = { x: dir.x * speed, y: dir.y * speed };
  }
  moveAxis(s.dungeon, p.pos, p.radius, p.vel.x * DT, 0);
  moveAxis(s.dungeon, p.pos, p.radius, 0, p.vel.y * DT);
  p.facing = angleTo(p.pos, { x: inp.aimX, y: inp.aimY });
}

function stepAttack(s: GameState, _inp: InputFrame): void {
  const p = s.player;
  if (p.attackCooldown > 0) return;
  // 자동 공격: 시야에 들어온(거리+LoS) 적이 있으면 커서 방향으로 공격속도에 맞춰 자동 발동.
  // 벽 너머의 보이지 않는 적에게 허공 스윙하지 않도록 LoS를 요구한다.
  const anyNear = s.enemies.some(
    (e) =>
      Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) <= T.autoAttackRange &&
      hasLineOfSight(s.dungeon, p.pos, e.pos),
  );
  if (!anyNear) return;
  p.attackCooldown = T.attackCooldown;
  s.events.push({ type: 'playerAttack', angle: p.facing });
  for (const e of s.enemies) {
    const dx = e.pos.x - p.pos.x;
    const dy = e.pos.y - p.pos.y;
    const dist = Math.hypot(dx, dy);
    const inRange = dist <= T.attackRange + e.radius;
    const inArc = angleDiff(angleTo(p.pos, e.pos), p.facing) <= T.attackArc;
    if (!inRange || !inArc) continue;
    e.hp -= Math.round(T.attackDamage * p.atkMul);
    e.hitFlash = 0.1;
    // 피격 어그로 + 주변 무리 경보 (150px)
    e.aggro = true;
    for (const ally of s.enemies) {
      if (ally.aggro) continue;
      if (circlesOverlap(e.pos, 150, ally.pos, 0)) ally.aggro = true;
    }
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
    e.repathCd = Math.max(0, e.repathCd - DT);
    // 넉백 감쇠
    e.vel.x *= 0.85;
    e.vel.y *= 0.85;
    const toPlayer = { x: p.pos.x - e.pos.x, y: p.pos.y - e.pos.y };
    const dist = Math.hypot(toPlayer.x, toPlayer.y);
    const los = hasLineOfSight(s.dungeon, e.pos, p.pos);

    // 인지: 시야 범위 안 + 벽에 가리지 않을 때만 어그로 (피격·경보는 stepAttack에서)
    if (!e.aggro) {
      if (dist <= ENEMIES[e.kind].aggroRange && los) e.aggro = true;
      else {
        // 비인지 배회: 홈 주변을 천천히 걷다 쉬기를 반복 (결정론적 해시 기반)
        const target = wanderTarget(s, e);
        let wx = 0;
        let wy = 0;
        if (target) {
          const toTarget = { x: target.x - e.pos.x, y: target.y - e.pos.y };
          if (Math.hypot(toTarget.x, toTarget.y) > 6) {
            const wdir = norm(toTarget);
            const wspeed = e.speed * 0.35;
            wx = wdir.x * wspeed;
            wy = wdir.y * wspeed;
          }
        }
        moveAxis(s.dungeon, e.pos, e.radius, (e.vel.x + wx) * DT, 0);
        moveAxis(s.dungeon, e.pos, e.radius, 0, (e.vel.y + wy) * DT);
        continue;
      }
    }

    // 추적 방향 결정: 시야가 트이면 직선, 막히면 A* 경로 추종
    let dir = norm(toPlayer);
    if (!los) {
      if (s.dungeon && e.repathCd === 0) {
        e.path = findPath(s.dungeon, e.pos, p.pos);
        e.repathCd = 0.5;
      }
      while (e.path.length > 0) {
        const wp = e.path[0];
        if (Math.hypot(wp.x - e.pos.x, wp.y - e.pos.y) < 10) {
          e.path.shift();
          continue;
        }
        dir = norm({ x: wp.x - e.pos.x, y: wp.y - e.pos.y });
        break;
      }
    } else {
      e.path = [];
    }

    let mx = dir.x * e.speed;
    let my = dir.y * e.speed;
    if (e.kind === 'archer') {
      const a = ENEMIES.archer;
      if (los && dist <= a.preferMax) {
        if (dist < a.preferMin) {
          mx = -dir.x * e.speed;
          my = -dir.y * e.speed;
        } else {
          mx = 0;
          my = 0;
        }
      }
      e.shootTimer = Math.max(0, e.shootTimer - DT);
      // 사격은 시야가 트였을 때만 (벽 너머 사격 방지)
      if (los && e.shootTimer === 0 && dist <= a.preferMax + 60) {
        e.shootTimer = a.shootCooldown;
        spawnProjectile(s, e, norm(toPlayer), a.projectileSpeed, a.projectileDamage);
      }
    }
    moveAxis(s.dungeon, e.pos, e.radius, (e.vel.x + mx) * DT, 0);
    moveAxis(s.dungeon, e.pos, e.radius, 0, (e.vel.y + my) * DT);
  }

  // 강체 분리: 몬스터끼리·플레이어와 겹침 해소 (대시 중엔 플레이어 통과 허용)
  separateBodies(s);

  // 접촉 피해는 분리 후 "맞닿은 상태"에서 판정 (분리가 정확히 접촉 거리에 두므로 여유 1.5px)
  const canHit = p.invulnTimer === 0 && p.dashTimer === 0;
  if (canHit) {
    for (const e of s.enemies) {
      if (circlesOverlap(p.pos, p.radius + 1.5, e.pos, e.radius)) {
        p.hp -= e.touchDamage;
        p.invulnTimer = T.playerInvulnAfterHit;
        s.events.push({ type: 'playerHit', pos: { ...p.pos } });
        break; // 한 틱에 한 번만
      }
    }
  }
  let anyDied = false;
  for (const e of s.enemies) {
    if (e.hp > 0) continue;
    anyDied = true;
    s.events.push({ type: 'enemyDied', pos: { ...e.pos } });
    if (e.drop && (e.drop.gold > 0 || e.drop.item)) {
      s.drops.push({ id: s.nextDropId++, pos: { ...e.pos }, gold: e.drop.gold, item: e.drop.item });
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
  if (anyDied && s.enemies.length === 0 && !s.cleared) {
    s.cleared = true;
    s.events.push({ type: 'dungeonCleared' });
  }
}

// 비인지 배회 목표. (시드, 개체 id, 시간 에포크)의 순수 해시 → 결정론 유지.
// 에포크 4초 중 전반 2.5초는 이동, 후반은 휴식. 목표가 벽 타일이면 그 에포크는 쉰다.
const WANDER_EPOCH_TICKS = 240;
function wanderTarget(s: GameState, e: { id: number; home: Vec }): Vec | null {
  const t = s.tick + e.id * 37;
  const phase = t % WANDER_EPOCH_TICKS;
  if (phase >= 150) return null;
  const epoch = Math.floor(t / WANDER_EPOCH_TICKS);
  const seed = deriveSeed(((s.dungeon?.seed ?? 0) ^ (e.id * 7919)) >>> 0, `wander${epoch}`);
  const rng = mulberry32(seed);
  const ang = rng() * Math.PI * 2;
  const rad = 30 + rng() * 60;
  const target = { x: e.home.x + Math.cos(ang) * rad, y: e.home.y + Math.sin(ang) * rad };
  if (s.dungeon && isWall(s.dungeon, Math.floor(target.x / TILE), Math.floor(target.y / TILE))) {
    return null;
  }
  return target;
}

// 원형 강체 분리. 몬스터끼리는 반반, 플레이어와는 몬스터가 더 밀린다(0.8/0.2).
// 이동은 moveAxis를 거치므로 분리로 벽을 뚫는 일은 없다. 순서·계산 모두 결정론적.
function separateBodies(s: GameState): void {
  const p = s.player;
  for (let i = 0; i < s.enemies.length; i++) {
    for (let j = i + 1; j < s.enemies.length; j++) {
      const a = s.enemies[i];
      const b = s.enemies[j];
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dist = Math.hypot(dx, dy);
      // 스프라이트 몸이 충돌원보다 커서, 몬스터끼리는 반경 합의 1.35배로 간격을 벌린다
      const min = (a.radius + b.radius) * 1.35;
      if (dist >= min) continue;
      // 완전 동일점이면 인덱스 기반 결정론적 방향으로 분리
      const nx = dist > 0.0001 ? dx / dist : Math.cos(i * 2.399 + j);
      const ny = dist > 0.0001 ? dy / dist : Math.sin(i * 2.399 + j);
      const push = (min - dist) / 2;
      moveAxis(s.dungeon, a.pos, a.radius, -nx * push, 0);
      moveAxis(s.dungeon, a.pos, a.radius, 0, -ny * push);
      moveAxis(s.dungeon, b.pos, b.radius, nx * push, 0);
      moveAxis(s.dungeon, b.pos, b.radius, 0, ny * push);
    }
  }
  if (p.dashTimer === 0) {
    for (const e of s.enemies) {
      const dx = e.pos.x - p.pos.x;
      const dy = e.pos.y - p.pos.y;
      const dist = Math.hypot(dx, dy);
      const min = e.radius + p.radius;
      if (dist >= min) continue;
      const nx = dist > 0.0001 ? dx / dist : 1;
      const ny = dist > 0.0001 ? dy / dist : 0;
      const push = min - dist;
      moveAxis(s.dungeon, e.pos, e.radius, nx * push * 0.8, 0);
      moveAxis(s.dungeon, e.pos, e.radius, 0, ny * push * 0.8);
      moveAxis(s.dungeon, p.pos, p.radius, -nx * push * 0.2, 0);
      moveAxis(s.dungeon, p.pos, p.radius, 0, -ny * push * 0.2);
    }
  }
}

function spawnProjectile(s: GameState, e: Enemy, dir: Vec, speed: number, damage: number): void {
  s.projectiles.push({
    id: s.nextProjectileId++,
    pos: { x: e.pos.x + dir.x * (e.radius + 8), y: e.pos.y + dir.y * (e.radius + 8) },
    vel: { x: dir.x * speed, y: dir.y * speed },
    radius: 5,
    damage,
    ttl: 3,
  });
  s.events.push({ type: 'shoot', pos: { ...e.pos } });
}

function stepProjectiles(s: GameState): void {
  const p = s.player;
  for (const pr of s.projectiles) {
    pr.ttl -= DT;
    pr.pos.x += pr.vel.x * DT;
    pr.pos.y += pr.vel.y * DT;
    if (circleHitsWall(s.dungeon, pr.pos, pr.radius)) {
      pr.ttl = 0;
      continue;
    }
    const canHit = p.invulnTimer === 0 && p.dashTimer === 0;
    if (canHit && circlesOverlap(p.pos, p.radius, pr.pos, pr.radius)) {
      p.hp -= pr.damage;
      p.invulnTimer = T.playerInvulnAfterHit;
      s.events.push({ type: 'playerHit', pos: { ...p.pos } });
      pr.ttl = 0;
    }
  }
  s.projectiles = s.projectiles.filter((pr) => pr.ttl > 0);
}

function stepDrops(s: GameState): void {
  const p = s.player;
  const kept: typeof s.drops = [];
  for (const d of s.drops) {
    if (!circlesOverlap(p.pos, p.radius, d.pos, T.pickupRadius)) {
      kept.push(d);
      continue;
    }
    s.gold += d.gold;
    if (d.item) {
      s.items.push({ ...d.item });
      if (d.item.stat === 'atk') p.atkMul += T.itemAtk[d.item.rarity];
      else if (d.item.stat === 'speed') p.speedMul += T.itemSpeed[d.item.rarity];
      else {
        const bonus = T.itemHp[d.item.rarity];
        p.maxHp += bonus;
        p.hp = Math.min(p.maxHp, p.hp + bonus);
      }
    }
    s.events.push({ type: 'dropPicked', pos: { ...d.pos } });
  }
  s.drops = kept;
}
