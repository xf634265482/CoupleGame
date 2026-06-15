// 流沙巨蝎专属机制（design §11b / 第 2 章 Boss，第 10 层）：
// - 每 QUICKSAND_SCORPION_BURROW_INTERVAL（狂暴后 QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED）回合：
//   潜入地下（免疫玩家攻击，emit BOSS_BURROWED），并在身侧翻起 QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW
//   个动态流沙坑（带 remaining，反风筝，2026-06-14）；同时随机覆盖若干格形成沙暴（emit SANDSTORM_SPAWNED），
//   命中玩家所在格造成 QUICKSAND_SCORPION_SANDSTORM_DAMAGE 点真实伤害（无视护甲，emit SANDSTORM_HIT）。
// - 下一回合：在玩家曼哈顿距离 ≤ 1 的随机空格（优先沙坑）冒出，落点留下一个永久流沙坑，
//   并立即发动 × 2 倍伤害（emit BOSS_EMERGED）
// - 其余回合：普通近战攻击（monsterAttack）
// - HP 占比 ≤ QUICKSAND_SCORPION_ENRAGE_HP_RATIO 时进入狂暴：潜地间隔缩短、沙暴覆盖范围扩大（见 CombatSystem 的 BOSS_ENRAGED）

import { monsterAttack } from '../CombatSystem';
import {
  QUICKSAND_SCORPION_BURROW_INTERVAL,
  QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED,
  QUICKSAND_SCORPION_DYNAMIC_PIT_DURATION,
  QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW,
  QUICKSAND_SCORPION_ENRAGE_HP_RATIO,
  QUICKSAND_SCORPION_SANDSTORM_CELLS,
  QUICKSAND_SCORPION_SANDSTORM_CELLS_ENRAGED,
  QUICKSAND_SCORPION_SANDSTORM_DAMAGE,
} from '../PveConstants';
import { createRng } from '../rng';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, FloorState, PveEvent } from '../PveTypes';

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/** 玩家周围（8 方向，距离 ≤ 1）且未被其他存活怪占据的空格。 */
function adjacentEmptyCells(floor: FloorState, excludeId: string): Coord[] {
  const { player, monsters, size } = floor;
  const occupied = new Set(
    monsters
      .filter((m) => m.id !== excludeId && m.aiState !== 'DEAD')
      .map((m) => `${m.pos.x},${m.pos.y}`),
  );
  const results: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = player.x + dx;
      const ny = player.y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
        if (!occupied.has(`${nx},${ny}`)) {
          results.push({ x: nx, y: ny });
        }
      }
    }
  }
  return results;
}

/**
 * 流沙巨蝎行动：
 * - 已潜地 → 冒出（teleport + 落点留下永久流沙坑 + 2× 伤害）
 * - 普通回合 → monsterAttack
 * Boss 的「潜地」触发由 MonsterAI.stepBoss 在进入攻击前判断并调用 quicksandScorpionBurrow()。
 */
export function quicksandScorpionAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'QUICKSAND_SCORPION',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  // ── 冒出：优先用距玩家最近的空闲沙坑位置；无可用沙坑则回退到玩家相邻空格随机 ──
  if (boss.isBurrowed) {
    const rng = createRng(floor.rngState);
    const monsterOccupied = new Set(
      floor.monsters
        .filter((m) => m.id !== bossId && m.aiState !== 'DEAD')
        .map((m) => `${m.pos.x},${m.pos.y}`),
    );
    // 沙坑可用条件：未被其他怪占据（玩家踩着不影响 Boss 冒出 —— 玩家自己就是攻击目标）
    const sandPits = floor.entities.filter(
      (e) => e.type === 'SAND_PIT' && !monsterOccupied.has(`${e.pos.x},${e.pos.y}`),
    );
    let emergePos: Coord;
    if (sandPits.length > 0) {
      let bestPit = sandPits[0];
      let bestDist = manhattan(bestPit.pos, floor.player);
      for (let i = 1; i < sandPits.length; i++) {
        const d = manhattan(sandPits[i].pos, floor.player);
        if (d < bestDist) {
          bestDist = d;
          bestPit = sandPits[i];
        }
      }
      emergePos = bestPit.pos;
    } else {
      const candidates = adjacentEmptyCells(floor, bossId);
      const emergeIdx = candidates.length > 0 ? rng.int(0, candidates.length - 1) : -1;
      emergePos = emergeIdx >= 0 ? candidates[emergeIdx] : boss.pos;
    }

    // 落点留下一个永久流沙坑：若落点已有（动态）沙坑则转为永久，否则新建一个永久沙坑
    const existingPit = floor.entities.find(
      (e) => e.type === 'SAND_PIT' && !e.consumed && e.pos.x === emergePos.x && e.pos.y === emergePos.y,
    );
    let entities: FixedEntity[];
    if (existingPit) {
      entities = floor.entities.map((e) => {
        if (e !== existingPit) return e;
        const { remaining, ...rest } = e;
        return rest;
      });
    } else {
      const permanentPit: FixedEntity = {
        id: `sand_perm_${floor.floor}_${floor.turn}_${floor.entities.length}`,
        type: 'SAND_PIT',
        pos: emergePos,
        consumed: false,
      };
      entities = [...floor.entities, permanentPit];
    }

    // 更新怪物位置 + 解除潜地状态
    const emerged: ExpeditionState = {
      ...state,
      floorState: {
        ...floor,
        rngState: rng.state(),
        monsters: floor.monsters.map((m) =>
          m.id === bossId ? { ...m, pos: emergePos, isBurrowed: false } : m,
        ),
        entities,
      },
    };

    const events: PveEvent[] = [{ type: 'BOSS_EMERGED', bossId, pos: emergePos }];

    // 冒出后若在攻击范围内立即双倍攻击
    if (manhattan(emergePos, floor.player) <= boss.range) {
      const attackResult = monsterAttack(emerged, bossId, 2);
      return { state: attackResult.state, events: [...events, ...attackResult.events] };
    }
    return { state: emerged, events };
  }

  // ── 普通攻击 ──────────────────────────────────────────────
  return monsterAttack(state, bossId);
}

/** Boss 身侧（Chebyshev ≤1）未被玩家/存活怪/未消耗实体占据的空格，用于流沙扩张。 */
function dynamicPitCells(floor: FloorState, center: Coord, count: number): Coord[] {
  const occupied = new Set<string>();
  occupied.add(`${floor.player.x},${floor.player.y}`);
  for (const m of floor.monsters) {
    if (m.aiState !== 'DEAD') occupied.add(`${m.pos.x},${m.pos.y}`);
  }
  for (const e of floor.entities) {
    if (!e.consumed) occupied.add(`${e.pos.x},${e.pos.y}`);
  }
  const result: Coord[] = [];
  for (let dy = -1; dy <= 1 && result.length < count; dy++) {
    for (let dx = -1; dx <= 1 && result.length < count; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 0 || y < 0 || x >= floor.size || y >= floor.size) continue;
      if (occupied.has(`${x},${y}`)) continue;
      result.push({ x, y });
    }
  }
  return result;
}

/** 随机抽取 count 个互不重复的格子（地图范围内），用于沙暴覆盖。 */
function randomDistinctCells(rng: ReturnType<typeof createRng>, size: number, count: number): Coord[] {
  const seen = new Set<string>();
  const result: Coord[] = [];
  const maxAttempts = count * 20;
  for (let i = 0; i < maxAttempts && result.length < count; i++) {
    const x = rng.int(0, size - 1);
    const y = rng.int(0, size - 1);
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ x, y });
  }
  return result;
}

/**
 * 触发潜地：由 MonsterAI.stepBoss 在每 QUICKSAND_SCORPION_BURROW_INTERVAL（狂暴后 _ENRAGED）回合调用。
 * 设置 isBurrowed=true，发送 BOSS_BURROWED 事件；本回合无攻击。
 * - 在 boss 身侧翻起动态流沙坑（带 remaining，由 endTurn 倒计时移除），逐步压缩风筝走廊。
 * - 随机覆盖若干格形成沙暴（狂暴前 QUICKSAND_SCORPION_SANDSTORM_CELLS 格，狂暴后 _ENRAGED 格），
 *   命中玩家所在格造成 QUICKSAND_SCORPION_SANDSTORM_DAMAGE 点真实伤害（无视护甲）。
 */
export function quicksandScorpionBurrow(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find((m) => m.id === bossId);
  const monsters = floor.monsters.map((m) =>
    m.id === bossId ? { ...m, isBurrowed: true } : m,
  );

  const events: PveEvent[] = [{ type: 'BOSS_BURROWED', bossId }];
  let entities = floor.entities;

  if (boss) {
    const pitCells = dynamicPitCells(floor, boss.pos, QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW);
    if (pitCells.length > 0) {
      let seq = floor.entities.length;
      const newPits: FixedEntity[] = pitCells.map((pos) => ({
        id: `sand_${floor.floor}_${floor.turn}_${seq++}`,
        type: 'SAND_PIT',
        pos,
        consumed: false,
        remaining: QUICKSAND_SCORPION_DYNAMIC_PIT_DURATION,
      }));
      entities = [...entities, ...newPits];
      events.push({ type: 'SAND_TIDE_SPAWNED', tiles: pitCells, duration: QUICKSAND_SCORPION_DYNAMIC_PIT_DURATION });
    }
  }

  // ── 沙暴：随机覆盖若干格，命中玩家所在格造成真实伤害（无视护甲） ──
  const rng = createRng(floor.rngState);
  const enraged = !!boss && boss.hp / boss.maxHp <= QUICKSAND_SCORPION_ENRAGE_HP_RATIO;
  const sandstormCount = enraged ? QUICKSAND_SCORPION_SANDSTORM_CELLS_ENRAGED : QUICKSAND_SCORPION_SANDSTORM_CELLS;
  const sandstormCells = randomDistinctCells(rng, floor.size, sandstormCount);
  events.push({ type: 'SANDSTORM_SPAWNED', tiles: sandstormCells });

  let player = state.player;
  let status = state.status;
  let floorStatus = floor.status;
  const hitPlayer = sandstormCells.some((c) => c.x === floor.player.x && c.y === floor.player.y);
  if (hitPlayer) {
    const hp = Math.max(0, player.hp - QUICKSAND_SCORPION_SANDSTORM_DAMAGE);
    player = { ...player, hp };
    events.push({ type: 'SANDSTORM_HIT', damage: QUICKSAND_SCORPION_SANDSTORM_DAMAGE, hp });
    if (hp <= 0) {
      events.push({ type: 'PLAYER_DEAD' });
      status = 'DEAD';
      floorStatus = 'DEAD';
    }
  }

  return {
    state: {
      ...state,
      status,
      player,
      floorState: { ...floor, status: floorStatus, rngState: rng.state(), monsters, entities },
    },
    events,
  };
}

/** 是否是潜地回合（每 QUICKSAND_SCORPION_BURROW_INTERVAL 个回合触发一次；狂暴后改为 _ENRAGED）。 */
export function isBurrowTurn(turn: number, enraged: boolean): boolean {
  const interval = enraged ? QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED : QUICKSAND_SCORPION_BURROW_INTERVAL;
  return turn > 0 && turn % interval === 0;
}
