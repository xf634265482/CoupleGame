// 命运守卫专属机制（design §11b / 第 5 章 Boss，第 25 层）：
// - 玩家 HP > 50% maxHp：守卫伤害 × 2（双倍压制，惩罚高血量玩家轻敌）
// - 命运预言（反风筝，2026-06-14）：每 FATE_PROPHECY_INTERVAL 回合标记玩家当前格，
//   下个 Boss 回合该 3×3 区域爆炸（站桩不走必吃）。逼玩家走位，替代原 40% 随机闪避。
// - HP≤33%：二阶段镜像分身。
//
// 历史：原「玩家 HP≤50% 时守卫 40% 概率闪避」（fateGuardianEvade / 闪避内联于 CombatSystem）
//       2026-06-14 整套删除 —— 数值博弈（博概率）改为玩法博弈（博走位）。

import { monsterAttack } from '../CombatSystem';
import {
  CHAPTER5_MIRROR_ATTACK_MULT,
  CHAPTER5_MIRROR_HP,
  CHAPTER5_MIRROR_SPAWN_HP_RATIO,
  FATE_GUARDIAN_HP_THRESHOLD,
  FATE_MIRROR_BOSS_ID,
  FATE_PROPHECY_DAMAGE_MULT,
  FATE_PROPHECY_INTERVAL,
  FATE_PROPHECY_RADIUS,
} from '../PveConstants';
import { createRng } from '../rng';
import type { ApplyResult, Coord, ExpeditionState, FloorState, Monster, PveEvent } from '../PveTypes';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/** boss 周围（8 方向，距离 ≤ 1）且未被玩家/其他存活怪物占据的空格。 */
function adjacentEmptyCells(floor: FloorState, center: Coord, excludeId: string): Coord[] {
  const occupied = new Set<string>();
  occupied.add(`${floor.player.x},${floor.player.y}`);
  for (const m of floor.monsters) {
    if (m.id !== excludeId && m.aiState !== 'DEAD') occupied.add(`${m.pos.x},${m.pos.y}`);
  }
  const results: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (nx >= 0 && ny >= 0 && nx < floor.size && ny < floor.size) {
        if (!occupied.has(`${nx},${ny}`)) results.push({ x: nx, y: ny });
      }
    }
  }
  return results;
}

/**
 * 命运守卫行动：
 * - 玩家 HP > 50% → 双倍伤害攻击
 * - 玩家 HP ≤ 50% → 普通攻击（守卫弱化，形势逆转）
 */
export function fateGuardianAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FATE_GUARDIAN',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  const hpRatio = state.player.hp / state.player.maxHp;

  if (hpRatio > FATE_GUARDIAN_HP_THRESHOLD) {
    // 玩家 HP 充足 → 双倍伤害
    return monsterAttack(state, bossId, 2);
  }

  // 玩家 HP 低 → 普通攻击（守卫弱化）
  return monsterAttack(state, bossId);
}

/** 是否是命运预言标记回合（每 FATE_PROPHECY_INTERVAL 个怪物回合）。 */
export function isProphecyTurn(turn: number): boolean {
  return turn > 0 && turn % FATE_PROPHECY_INTERVAL === 0;
}

/**
 * 命运预言前置步（MonsterAI 在 FATE_GUARDIAN 正常行动前调用，类比 spawnFateMirror）：
 * - 若存在待结算预言 floorState.fateProphecy → 结算：以 center 为心、Chebyshev≤FATE_PROPHECY_RADIUS
 *   的 3×3 区域爆炸（emit PROPHECY_RESOLVED，无论是否命中均 emit 供渲染）；玩家在区域内则受
 *   round(boss.attack × FATE_PROPHECY_DAMAGE_MULT) 伤害（可致死）。结算后清空预言。
 * - 否则若 isProphecyTurn(turn) → 标记玩家当前格为 center（emit PROPHECY_MARKED），下个 Boss 回合炸。
 * 「先结算、后标记」保证预言总提前 1 个怪物回合预警，且不会自我覆盖。
 */
export function fateProphecyStep(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FATE_GUARDIAN',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  // ── 结算待定预言 ──────────────────────────────────────
  if (floor.fateProphecy) {
    const center = floor.fateProphecy.center;
    const events: PveEvent[] = [{ type: 'PROPHECY_RESOLVED', center }];
    const inBlast =
      Math.max(Math.abs(floor.player.x - center.x), Math.abs(floor.player.y - center.y)) <= FATE_PROPHECY_RADIUS;

    let next: ExpeditionState = { ...state, floorState: { ...floor, fateProphecy: undefined } };
    if (inBlast) {
      const damage = Math.round(boss.attack * FATE_PROPHECY_DAMAGE_MULT);
      const hp = Math.max(0, state.player.hp - damage);
      const dead = hp <= 0;
      events.push({ type: 'PLAYER_DAMAGED', damage, hp, sourceId: bossId });
      if (dead) events.push({ type: 'PLAYER_DEAD' });
      next = {
        ...next,
        status: dead ? 'DEAD' : next.status,
        player: { ...next.player, hp },
        floorState: { ...next.floorState, status: dead ? 'DEAD' : next.floorState.status },
      };
    }
    return { state: next, events };
  }

  // ── 标记新预言 ────────────────────────────────────────
  if (isProphecyTurn(floor.turn)) {
    const center: Coord = { x: floor.player.x, y: floor.player.y };
    return {
      state: { ...state, floorState: { ...floor, fateProphecy: { center } } },
      events: [{ type: 'PROPHECY_MARKED', center }],
    };
  }

  return noop(state);
}

/**
 * 镜像分身（design §11b / 第 5 章 Boss，第 25 层）：
 * Boss HP/maxHp ≤ CHAPTER5_MIRROR_SPAWN_HP_RATIO 且场上尚无存活镜像时，
 * 在 Boss 相邻空格生成一个攻击力为 Boss × CHAPTER5_MIRROR_ATTACK_MULT 的镜像（emit MIRROR_SPAWNED）。
 * 由 MonsterAI 在 FATE_GUARDIAN 每回合行动前调用。
 */
export function spawnFateMirror(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FATE_GUARDIAN',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  if (boss.hp / boss.maxHp > CHAPTER5_MIRROR_SPAWN_HP_RATIO) return noop(state);

  const hasMirror = floor.monsters.some((m) => m.bossId === FATE_MIRROR_BOSS_ID && m.aiState !== 'DEAD');
  if (hasMirror) return noop(state);

  const candidates = adjacentEmptyCells(floor, boss.pos, bossId);
  if (candidates.length === 0) return noop(state);

  const rng = createRng(floor.rngState);
  const pos = rng.pick(candidates);

  const mirror: Monster = {
    id: `mirror_${floor.floor}`,
    type: 'BOSS',
    bossId: FATE_MIRROR_BOSS_ID,
    pos,
    hp: CHAPTER5_MIRROR_HP,
    maxHp: CHAPTER5_MIRROR_HP,
    attack: Math.round(boss.attack * CHAPTER5_MIRROR_ATTACK_MULT),
    range: boss.range,
    aggroRadius: boss.aggroRadius,
    aiState: 'CHASE',
  };

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        monsters: [...floor.monsters, mirror],
        rngState: rng.state(),
      },
    },
    events: [{ type: 'MIRROR_SPAWNED', mirrorId: mirror.id, pos }],
  };
}
