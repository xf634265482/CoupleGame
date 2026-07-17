// 流沙巨蝎专属机制（design §11b / 第 2 章 Boss，第 10 层）：
// - 每 QUICKSAND_SCORPION_BURROW_INTERVAL（狂暴后 QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED）回合：
//   潜入地下（免疫玩家攻击，emit BOSS_BURROWED），并在身侧翻起 QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW
//   个动态流沙坑（狂暴后使用 _ENRAGED；带 remaining，生成于玩家附近以迫使安全区迁移）；同时随机覆盖若干格形成沙暴（emit SANDSTORM_SPAWNED），
//   命中玩家所在格造成 QUICKSAND_SCORPION_SANDSTORM_DAMAGE 点真实伤害（无视护甲，emit SANDSTORM_HIT）。
// - 下一回合：只能从离玩家最近的可用沙坑冒出；没有可用沙坑则保持潜地等待。
//   冒出后若玩家在攻击范围内，立即发动 × 2 倍伤害（emit BOSS_EMERGED）。
// - 其余回合：普通近战攻击（monsterAttack）
// - HP 占比 ≤ QUICKSAND_SCORPION_ENRAGE_HP_RATIO 时进入狂暴：潜地间隔缩短、沙暴覆盖范围扩大（见 CombatSystem 的 BOSS_ENRAGED）

import { monsterAttack } from '../CombatSystem';
import {
  QUICKSAND_SCORPION_BURROW_INTERVAL,
  QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED,
  QUICKSAND_SCORPION_DYNAMIC_PIT_DURATION,
  QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW,
  QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW_ENRAGED,
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

/** 全场可供 Boss 冒出的沙坑；排除玩家、其他存活怪物和冲突实体。 */
function availableSandPits(floor: FloorState, excludeId: string): Coord[] {
  const { player, monsters } = floor;
  const occupied = new Set(
    monsters
      .filter((m) => m.id !== excludeId && m.aiState !== 'DEAD')
      .map((m) => `${m.pos.x},${m.pos.y}`),
  );
  return floor.entities
    .filter((entity) => entity.type === 'SAND_PIT' && !entity.consumed)
    .map((entity) => entity.pos)
    .filter((pos) => !(pos.x === player.x && pos.y === player.y))
    .filter((pos) => !occupied.has(`${pos.x},${pos.y}`))
    .filter((pos) => !floor.entities.some(
      (entity) => entity.type !== 'SAND_PIT' && !entity.consumed && entity.pos.x === pos.x && entity.pos.y === pos.y,
    ));
}

/**
 * 流沙巨蝎行动：
 * - 已潜地 → 从最近可用沙坑冒出（teleport + 落点转为永久流沙坑；范围内 2× 伤害）
 * - 普通回合 → monsterAttack
 * Boss 的「潜地」触发由 MonsterAI.stepBoss 在进入攻击前判断并调用 quicksandScorpionBurrow()。
 */
export function quicksandScorpionAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'QUICKSAND_SCORPION',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  // ── 冒出：只能使用距玩家最近的可用沙坑；没有可用沙坑则保持潜地等待 ──
  if (boss.isBurrowed) {
    const rng = createRng(floor.rngState);
    const sandPits = availableSandPits(floor, bossId);
    if (sandPits.length === 0) return noop(state);
    const nearestDistance = Math.min(...sandPits.map((pos) => manhattan(pos, floor.player)));
    const nearestPits = sandPits.filter((pos) => manhattan(pos, floor.player) === nearestDistance);
    const emergePos = nearestPits[rng.int(0, nearestPits.length - 1)];
    const emergeAttackRadius = boss.hp / boss.maxHp <= QUICKSAND_SCORPION_ENRAGE_HP_RATIO ? 2 : boss.range;

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

    const events: PveEvent[] = [{ type: 'BOSS_EMERGED', bossId, pos: emergePos, attackRadius: emergeAttackRadius }];

    // 冒出后若在攻击范围内立即双倍攻击
    if (Math.max(Math.abs(emergePos.x - floor.player.x), Math.abs(emergePos.y - floor.player.y)) <= emergeAttackRadius) {
      const attackResult = monsterAttack(
        emerged,
        bossId,
        2,
        emergeAttackRadius,
        { metric: 'chebyshev', ignoreLos: true, forcePlayer: true },
      );
      return { state: attackResult.state, events: [...events, ...attackResult.events] };
    }
    return { state: emerged, events };
  }

  // ── 普通攻击 ──────────────────────────────────────────────
  return monsterAttack(state, bossId);
}

/** 玩家附近（Chebyshev 1~2）未被存活怪/未消耗实体占据的随机空格，用于迫使安全区迁移。 */
function dynamicPitCells(
  floor: FloorState,
  count: number,
  rng: ReturnType<typeof createRng>,
): Coord[] {
  const occupied = new Set<string>();
  occupied.add(`${floor.player.x},${floor.player.y}`);
  for (const m of floor.monsters) {
    if (m.aiState !== 'DEAD') occupied.add(`${m.pos.x},${m.pos.y}`);
  }
  for (const e of floor.entities) {
    if (!e.consumed) occupied.add(`${e.pos.x},${e.pos.y}`);
  }
  const candidates: Coord[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = floor.player.x + dx;
      const y = floor.player.y + dy;
      if (x < 0 || y < 0 || x >= floor.size || y >= floor.size) continue;
      if (occupied.has(`${x},${y}`)) continue;
      candidates.push({ x, y });
    }
  }
  return rng.shuffle(candidates).slice(0, count);
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

function playerPressureSandstormCells(
  floor: FloorState,
  rng: ReturnType<typeof createRng>,
  count: number,
  pressureCount: number,
): Coord[] {
  const nearPlayer: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = floor.player.x + dx;
      const y = floor.player.y + dy;
      if (x < 0 || y < 0 || x >= floor.size || y >= floor.size) continue;
      nearPlayer.push({ x, y });
    }
  }

  const selected = rng.shuffle(nearPlayer).slice(0, Math.min(pressureCount, count));
  const seen = new Set(selected.map((c) => `${c.x},${c.y}`));
  const fillers = randomDistinctCells(rng, floor.size, count * 2)
    .filter((c) => !seen.has(`${c.x},${c.y}`))
    .slice(0, Math.max(0, count - selected.length));
  return [...selected, ...fillers].slice(0, count);
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
  const rng = createRng(floor.rngState);
  const enraged = !!boss && boss.hp / boss.maxHp <= QUICKSAND_SCORPION_ENRAGE_HP_RATIO;

  if (boss) {
    const pitCount = enraged
      ? QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW_ENRAGED
      : QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW;
    const pitCells = dynamicPitCells(floor, pitCount, rng);
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
  const sandstormCount = enraged ? QUICKSAND_SCORPION_SANDSTORM_CELLS_ENRAGED : QUICKSAND_SCORPION_SANDSTORM_CELLS;
  const pressureCount = enraged ? 2 : 1;
  const sandstormCells = playerPressureSandstormCells(floor, rng, sandstormCount, pressureCount);
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
