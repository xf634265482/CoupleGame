// 熔岩领主专属机制（design §11b / 第 4 章 Boss，第 20 层）：
// - 每次近身攻击附带灼烧：playerBurnRemaining += LAVA_LORD_BURN_TICKS
// - 灼烧在回合开始时逐点消耗（由 ExpeditionState.endTurn 处理）

import { monsterAttack } from '../CombatSystem';
import {
  CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO,
  CHAPTER4_LAVA_TIDE_DURATION,
  CHAPTER4_LAVA_TIDE_INTERVAL,
  CHAPTER4_LAVA_TIDE_TILE_COUNT,
  LAVA_LORD_BURN_TICKS,
} from '../PveConstants';
import { createRng } from '../rng';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, FloorState, PveEvent } from '../PveTypes';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/** 网格内未被玩家/存活怪物/未消耗实体占据的空格。 */
function emptyCells(floor: FloorState, excludeId: string): Coord[] {
  const occupied = new Set<string>();
  occupied.add(`${floor.player.x},${floor.player.y}`);
  for (const m of floor.monsters) {
    if (m.id !== excludeId && m.aiState !== 'DEAD') occupied.add(`${m.pos.x},${m.pos.y}`);
  }
  for (const e of floor.entities) {
    if (!e.consumed) occupied.add(`${e.pos.x},${e.pos.y}`);
  }
  const cells: Coord[] = [];
  for (let y = 0; y < floor.size; y++) {
    for (let x = 0; x < floor.size; x++) {
      if (!occupied.has(`${x},${y}`)) cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * 熔岩领主行动：普通攻击 + 附加灼烧 tick（emit BURN_APPLIED）。
 * 灼烧叠加：每次攻击命中后 playerBurnRemaining += LAVA_LORD_BURN_TICKS。
 */
export function lavaLordAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'LAVA_LORD',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  // 普通攻击
  const attackResult = monsterAttack(state, bossId);
  if (attackResult.state.status === 'DEAD') return attackResult;

  // 攻击命中（有 PLAYER_DAMAGED 事件）才叠加灼烧
  const didHit = attackResult.events.some((e) => e.type === 'PLAYER_DAMAGED');
  if (!didHit) return attackResult;

  const currentBurn = attackResult.state.floorState.playerBurnRemaining ?? 0;
  const totalRemaining = currentBurn + LAVA_LORD_BURN_TICKS;
  const burnEvent: PveEvent = { type: 'BURN_APPLIED', bossId, totalRemaining };

  return {
    state: {
      ...attackResult.state,
      floorState: {
        ...attackResult.state.floorState,
        playerBurnRemaining: totalRemaining,
      },
    },
    events: [...attackResult.events, burnEvent],
  };
}

/**
 * 熔岩潮汐阶段（HP ≤ CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO 进入）：
 * - 首次进入 phase2 当回合立即刷出一批 LAVA_TILE（emit LAVA_TIDE_SPAWNED）。
 * - 此后每 CHAPTER4_LAVA_TIDE_INTERVAL 回合再刷一批，期间仅推进计数器。
 * 由 MonsterAI 在 LAVA_LORD 每回合行动前调用，与 lavaLordAttack 独立叠加。
 */
export function lavaTideStep(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'LAVA_LORD',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  if (boss.hp / boss.maxHp > CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO) return noop(state);

  const wasPhase2 = floor.lavaLordPhase2 ?? false;
  let counter = floor.lavaTideCounter ?? 0;
  let shouldSpawn: boolean;
  if (!wasPhase2) {
    shouldSpawn = true;
  } else {
    counter += 1;
    shouldSpawn = counter >= CHAPTER4_LAVA_TIDE_INTERVAL;
  }

  if (!shouldSpawn) {
    return {
      state: { ...state, floorState: { ...floor, lavaLordPhase2: true, lavaTideCounter: counter } },
      events: [],
    };
  }

  const rng = createRng(floor.rngState);
  const candidates = rng.shuffle(emptyCells(floor, bossId));
  const chosen = candidates.slice(0, Math.min(CHAPTER4_LAVA_TIDE_TILE_COUNT, candidates.length));
  let seq = floor.entities.length;
  const newEntities: FixedEntity[] = chosen.map((pos) => ({
    id: `lava_${floor.floor}_${seq++}`,
    type: 'LAVA_TILE',
    pos,
    consumed: false,
    remaining: CHAPTER4_LAVA_TIDE_DURATION,
  }));

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        entities: [...floor.entities, ...newEntities],
        lavaLordPhase2: true,
        lavaTideCounter: 0,
        rngState: rng.state(),
      },
    },
    events: [{ type: 'LAVA_TIDE_SPAWNED', tiles: chosen, duration: CHAPTER4_LAVA_TIDE_DURATION }],
  };
}
