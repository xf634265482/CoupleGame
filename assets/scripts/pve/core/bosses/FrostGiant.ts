// 冰霜巨人专属机制（design §11b / 第 3 章 Boss，第 15 层）：
// - 每 FROST_GIANT_FREEZE_INTERVAL 个怪物回合的近战命中后，以玩家为中心铺一片冰面（ICE_TILE）。
// - 玩家站在冰面上移动时会「滑行」（MovementSystem 处理）：沿方向连续冰面滑到边缘，
//   失去「精确后撤 1 格」的走位控制 → 打断风筝（反逃课，2026-06-14）。
// - 其余回合：普通近战攻击（monsterAttack）。
//
// 历史：原机制为「冰冻回合 AP 上限 -4」（playerFreezeRounds/FREEZE_APPLIED），
//       2026-06-14 整套替换为冰面地形，避免「惩罚叠惩罚」且真正反风筝。

import { monsterAttack } from '../CombatSystem';
import {
  FROST_GIANT_FREEZE_INTERVAL,
  FROST_GIANT_ICE_DURATION,
  FROST_GIANT_ICE_RADIUS,
} from '../PveConstants';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, FloorState, PveEvent } from '../PveTypes';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/** 是否是冰面生成回合（每 FROST_GIANT_FREEZE_INTERVAL 个怪物回合）。 */
export function isFreezeAttackTurn(turn: number): boolean {
  return turn > 0 && turn % FROST_GIANT_FREEZE_INTERVAL === 0;
}

/**
 * 以玩家为中心、曼哈顿距离 ≤ FROST_GIANT_ICE_RADIUS 内可铺冰的格子（「+」字范围）。
 * 跳过越界、已被未消耗实体（含已有冰面/石块/冰墙/沙坑）或存活怪物占据的格子。
 * 玩家所在格不被跳过 —— 正是要让玩家下回合站在冰上才会滑行。
 */
function iceCells(floor: FloorState): Coord[] {
  const center = floor.player;
  const blocked = new Set<string>();
  for (const e of floor.entities) {
    if (!e.consumed) blocked.add(`${e.pos.x},${e.pos.y}`);
  }
  for (const m of floor.monsters) {
    if (m.aiState !== 'DEAD') blocked.add(`${m.pos.x},${m.pos.y}`);
  }
  const cells: Coord[] = [];
  for (let dy = -FROST_GIANT_ICE_RADIUS; dy <= FROST_GIANT_ICE_RADIUS; dy++) {
    for (let dx = -FROST_GIANT_ICE_RADIUS; dx <= FROST_GIANT_ICE_RADIUS; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > FROST_GIANT_ICE_RADIUS) continue;
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 0 || y < 0 || x >= floor.size || y >= floor.size) continue;
      if (blocked.has(`${x},${y}`)) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * 冰霜巨人行动：
 * - 普通近战攻击（monsterAttack）。
 * - 若本回合是冰面生成回合且攻击未致死：以玩家为中心铺 ICE_TILE（remaining=FROST_GIANT_ICE_DURATION）。
 *   仅在 boss 进入近战范围实际攻击的回合调用（MonsterAI 在 dist≤range 时才派发本函数），
 *   故冰面总是出现在 boss 贴脸处、玩家脚下。
 */
export function frostGiantAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FROST_GIANT',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  // 普通攻击
  const attackResult = monsterAttack(state, bossId);
  if (attackResult.state.status === 'DEAD') return attackResult;

  // 冰面回合：以玩家为中心铺冰
  if (isFreezeAttackTurn(floor.turn)) {
    const af = attackResult.state.floorState;
    const cells = iceCells(af);
    if (cells.length === 0) return attackResult;

    let seq = af.entities.length;
    const newEntities: FixedEntity[] = cells.map((pos) => ({
      id: `ice_${af.floor}_${af.turn}_${seq++}`,
      type: 'ICE_TILE',
      pos,
      consumed: false,
      remaining: FROST_GIANT_ICE_DURATION,
    }));

    const iceEvent: PveEvent = {
      type: 'ICE_TIDE_SPAWNED',
      tiles: cells,
      duration: FROST_GIANT_ICE_DURATION,
    };

    return {
      state: { ...attackResult.state, floorState: { ...af, entities: [...af.entities, ...newEntities] } },
      events: [...attackResult.events, iceEvent],
    };
  }

  return attackResult;
}
