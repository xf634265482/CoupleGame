// Boss 遗物系统（design Boss设计V1 / 掉落系统）：
// 5 件遗物对应 5 章 Boss，击杀 Boss 时 20%（图鉴已解锁 +10%）独立概率掉落。
// 本场远征局内生效，死亡清空（图鉴解锁记录保留在 PveMeta.codex.relics）。
//
// 实现策略：每件遗物在数据层声明属性，效果实现散布到对应系统的挂钩点：
//   onNewFloor       → ExpeditionState.advanceFloor 末尾调用（流沙之心：生成 2 格沙坑）
//   computeAtkBonus  → CombatSystem.playerAttack 计算伤害时叠加（酋长怒吼 +50% / 流沙之心 +10）
//   onMoveStep       → MovementSystem.applyMove 末尾调用（永冻之核：累计步数）
//   onHitTarget      → CombatSystem.playerAttack 命中怪物后调用（永冻之核：冰冻目标）
//   onKill           → CombatSystem.resolveHit 击杀分支调用（酋长怒吼：标记下次普攻）
//   reflectDamage    → CombatSystem.monsterAttack 受伤后调用（熔火之心：反弹 30% 给攻击者）
//   tryRevive        → CombatSystem.monsterAttack 致死分支调用（命运回响：致死兜底回血 30%）
//
// 纯函数 + 零框架依赖；所有随机走传入的 Rng（AC-13 确定性）。

import type {
  ApplyResult,
  Coord,
  ExpeditionState,
  FixedEntity,
  Monster,
  PveEvent,
  RelicId,
  RunPlayer,
} from './PveTypes';
import type { Rng } from './rng';
import { createRng } from './rng';

// ── 数值常量（直接写文档化数值，避免反复跳转 PveConstants） ──
/** CHIEF_ROAR：击杀后下一次普攻伤害倍率（+50% = ×1.5）。 */
export const CHIEF_ROAR_DAMAGE_MULT = 1.5;
/** QUICKSAND_HEART：每进入新房间随机生成的动态沙坑数。 */
export const QUICKSAND_HEART_PIT_COUNT = 2;
/** QUICKSAND_HEART：动态沙坑存续回合数（与 QUICKSAND_SCORPION_DYNAMIC_PIT_DURATION 同等量级）。 */
export const QUICKSAND_HEART_PIT_DURATION = 6;
/** QUICKSAND_HEART：玩家站在沙坑上时攻击额外加成。 */
export const QUICKSAND_HEART_ATTACK_BONUS = 10;
/** PERMAFROST_CORE：触发冰冻所需的累计移动步数。 */
export const PERMAFROST_CORE_STEPS = 3;
/** PERMAFROST_CORE：冰冻目标的回合数（敌人下回合无法行动）。 */
export const PERMAFROST_CORE_FREEZE_ROUNDS = 1;
/** MAGMA_HEART：受到伤害时反弹给攻击者的比例。 */
export const MAGMA_HEART_REFLECT_PCT = 0.30;
/** FATE_ECHO：致死兜底后回复的 HP 比例（按 maxHp 计算）。 */
export const FATE_ECHO_REVIVE_HP_PCT = 0.30;

/** 遗物元数据（UI 展示用）。 */
export interface RelicDef {
  id: RelicId;
  name: string;
  description: string;
}

export const RELIC_DEFS: Record<RelicId, RelicDef> = {
  CHIEF_ROAR: {
    id: 'CHIEF_ROAR',
    name: '酋长怒吼',
    description: '击杀任意怪物后，下一次普攻 +50% 伤害',
  },
  QUICKSAND_HEART: {
    id: 'QUICKSAND_HEART',
    name: '流沙之心',
    description: '每进入新房间随机生成 2 格流沙；站在流沙上攻击 +10',
  },
  PERMAFROST_CORE: {
    id: 'PERMAFROST_CORE',
    name: '永冻之核',
    description: '每移动 3 步后下一次普攻附带冰冻（敌人下回合无法行动）',
  },
  MAGMA_HEART: {
    id: 'MAGMA_HEART',
    name: '熔火之心',
    description: '受到伤害时反弹 30% 给攻击者',
  },
  FATE_ECHO: {
    id: 'FATE_ECHO',
    name: '命运回响',
    description: '每场远征首次死亡免疫，回复 30% HP',
  },
};

/** 玩家是否持有指定遗物。 */
export function playerHasRelic(player: RunPlayer, relicId: RelicId): boolean {
  return (player.relics ?? []).includes(relicId);
}

function getRelicState(player: RunPlayer): NonNullable<RunPlayer['relicState']> {
  return player.relicState ?? {};
}

function patchRelicState(player: RunPlayer, patch: Partial<NonNullable<RunPlayer['relicState']>>): RunPlayer {
  return { ...player, relicState: { ...getRelicState(player), ...patch } };
}

// ── 公共接入函数 ─────────────────────────────────────────

/**
 * 拾取遗物：append 到 player.relics（去重）；首次解锁则同时追加 player.codexRelics（图鉴快照）。
 * 不消耗 RNG。返回新 player + 事件序列（含 RELIC_PICKUP 与首次解锁时的 CODEX_RELIC_UNLOCKED）。
 * 图鉴快照在 Controller 远征结束时同步回 PveMeta.codex.relics 持久化。
 */
export function pickupRelic(
  player: RunPlayer,
  relicId: RelicId,
  source: string,
): { player: RunPlayer; events: PveEvent[] } {
  const events: PveEvent[] = [];
  const owned = player.relics ?? [];
  const nextRelics = owned.includes(relicId) ? owned : [...owned, relicId];
  events.push({ type: 'RELIC_PICKUP', relicId, source });

  const codex = player.codexRelics ?? [];
  let nextCodex = codex;
  if (!codex.includes(relicId)) {
    nextCodex = [...codex, relicId];
    events.push({ type: 'CODEX_RELIC_UNLOCKED', relicId });
  }

  return {
    player: { ...player, relics: nextRelics, codexRelics: nextCodex },
    events,
  };
}

/**
 * 新楼层挂钩（QUICKSAND_HEART）：在玩家附近随机翻起 N 格动态沙坑。
 * 在 advanceFloor 末尾、floorState 已经初始化后调用。
 * 注意：消耗传入的 rng（推进 floorState.rngState）。
 */
export function relicOnNewFloor(state: ExpeditionState): ApplyResult {
  if (!playerHasRelic(state.player, 'QUICKSAND_HEART')) return { state, events: [] };
  const floor = state.floorState;
  const rng = createRng(floor.rngState);
  const newPits: FixedEntity[] = [];
  const occupied = new Set<string>();
  const keyOf = (c: Coord) => `${c.x},${c.y}`;
  occupied.add(keyOf(floor.player));
  for (const m of floor.monsters) {
    if (m.aiState !== 'DEAD') occupied.add(keyOf(m.pos));
  }
  for (const e of floor.entities) {
    if (!e.consumed) occupied.add(keyOf(e.pos));
  }

  let placed = 0;
  for (let tries = 0; tries < 30 && placed < QUICKSAND_HEART_PIT_COUNT; tries++) {
    const pos: Coord = { x: rng.int(0, floor.size - 1), y: rng.int(0, floor.size - 1) };
    const k = keyOf(pos);
    if (occupied.has(k)) continue;
    occupied.add(k);
    newPits.push({
      id: `relic_sand_${floor.floor}_${tries}`,
      type: 'SAND_PIT',
      pos,
      consumed: false,
      remaining: QUICKSAND_HEART_PIT_DURATION,
    });
    placed++;
  }

  if (newPits.length === 0) {
    return { state: { ...state, floorState: { ...floor, rngState: rng.state() } }, events: [] };
  }

  const events: PveEvent[] = [
    {
      type: 'SAND_TIDE_SPAWNED',
      tiles: newPits.map((p) => p.pos),
      duration: QUICKSAND_HEART_PIT_DURATION,
    },
    { type: 'RELIC_TRIGGERED', relicId: 'QUICKSAND_HEART', detail: `+${placed} 格流沙` },
  ];

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        rngState: rng.state(),
        entities: [...floor.entities, ...newPits],
      },
    },
    events,
  };
}

/**
 * 玩家普攻时的伤害加成（CHIEF_ROAR + QUICKSAND_HEART）。
 * 返回 { bonus, consume }：bonus 直接加到伤害上；consume 给调用方在 floorState 更新里应用。
 *
 * CHIEF_ROAR：pending=true 时返回 (currentDamage × 0.5) 作为加成，并 consume.chiefRoarPending=false
 * QUICKSAND_HEART：玩家当前格是未消耗的 SAND_PIT 时 +10
 */
export function relicComputeAttackBonus(
  state: ExpeditionState,
  baseDamage: number,
): { bonus: number; nextPlayer: RunPlayer; events: PveEvent[] } {
  const events: PveEvent[] = [];
  let bonus = 0;
  let nextPlayer = state.player;
  const rstate = getRelicState(nextPlayer);

  if (playerHasRelic(nextPlayer, 'CHIEF_ROAR') && rstate.chiefRoarPending) {
    bonus += Math.round(baseDamage * (CHIEF_ROAR_DAMAGE_MULT - 1.0));
    nextPlayer = patchRelicState(nextPlayer, { chiefRoarPending: false });
    events.push({ type: 'RELIC_TRIGGERED', relicId: 'CHIEF_ROAR', detail: '+50% 伤害' });
  }

  if (playerHasRelic(nextPlayer, 'QUICKSAND_HEART')) {
    const onSand = state.floorState.entities.some(
      (e) => e.type === 'SAND_PIT' && !e.consumed
        && e.pos.x === state.floorState.player.x && e.pos.y === state.floorState.player.y,
    );
    if (onSand) {
      bonus += QUICKSAND_HEART_ATTACK_BONUS;
      events.push({ type: 'RELIC_TRIGGERED', relicId: 'QUICKSAND_HEART', detail: `+${QUICKSAND_HEART_ATTACK_BONUS} 流沙加成` });
    }
  }

  return { bonus, nextPlayer, events };
}

/**
 * 玩家命中怪物后的状态附加（PERMAFROST_CORE）：
 * 累计步数到 3 时下一次命中冻结目标，并消费 pending。
 * 返回 { freezeTargetId, nextPlayer, events }。
 */
export function relicOnHitTarget(
  player: RunPlayer,
  targetId: string,
): { freezeTargetId: string | null; nextPlayer: RunPlayer; events: PveEvent[] } {
  if (!playerHasRelic(player, 'PERMAFROST_CORE')) {
    return { freezeTargetId: null, nextPlayer: player, events: [] };
  }
  const rstate = getRelicState(player);
  if (!rstate.permafrostPending) {
    return { freezeTargetId: null, nextPlayer: player, events: [] };
  }
  return {
    freezeTargetId: targetId,
    nextPlayer: patchRelicState(player, { permafrostPending: false }),
    events: [{ type: 'RELIC_TRIGGERED', relicId: 'PERMAFROST_CORE', detail: '冰冻目标' }],
  };
}

/**
 * 玩家击杀怪物后（CHIEF_ROAR）：标记 chiefRoarPending=true，下一次普攻 +50%。
 * 不重复标记（pending 已为 true 时直接返回）。
 */
export function relicOnKill(player: RunPlayer): { nextPlayer: RunPlayer } {
  if (!playerHasRelic(player, 'CHIEF_ROAR')) return { nextPlayer: player };
  const rstate = getRelicState(player);
  if (rstate.chiefRoarPending) return { nextPlayer: player };
  return { nextPlayer: patchRelicState(player, { chiefRoarPending: true }) };
}

/**
 * 玩家移动一步后（PERMAFROST_CORE）：累计步数；达到 3 步时置 pending=true 并清零步数。
 * 滑行视为多步（调用方按真实位移格数循环调用本函数）。
 */
export function relicOnMoveStep(player: RunPlayer): { nextPlayer: RunPlayer; events: PveEvent[] } {
  if (!playerHasRelic(player, 'PERMAFROST_CORE')) return { nextPlayer: player, events: [] };
  const rstate = getRelicState(player);
  const steps = (rstate.permafrostSteps ?? 0) + 1;
  if (steps >= PERMAFROST_CORE_STEPS) {
    return {
      nextPlayer: patchRelicState(player, { permafrostSteps: 0, permafrostPending: true }),
      events: [{ type: 'RELIC_TRIGGERED', relicId: 'PERMAFROST_CORE', detail: '蓄能完成（下次普攻冰冻）' }],
    };
  }
  return { nextPlayer: patchRelicState(player, { permafrostSteps: steps }), events: [] };
}

/**
 * 玩家受到怪物攻击时（MAGMA_HEART）：返回反弹给攻击者的伤害值（30%，向上取整最低 1）。
 * 0 表示无遗物或反弹值为 0（damage 为 0 时）。
 */
export function relicReflectDamage(player: RunPlayer, damage: number): number {
  if (!playerHasRelic(player, 'MAGMA_HEART')) return 0;
  if (damage <= 0) return 0;
  return Math.max(1, Math.ceil(damage * MAGMA_HEART_REFLECT_PCT));
}

/**
 * 玩家被致死前的兜底判定（FATE_ECHO）：
 * 持有遗物且本场远征未触发过 → 标记已用 + 回复 30% maxHp，返回 { revived: true, restoredHp }。
 * 否则返回 { revived: false }。
 */
export function relicTryRevive(player: RunPlayer): {
  revived: boolean;
  restoredHp: number;
  nextPlayer: RunPlayer;
} {
  if (!playerHasRelic(player, 'FATE_ECHO')) {
    return { revived: false, restoredHp: 0, nextPlayer: player };
  }
  const rstate = getRelicState(player);
  if (rstate.fateEchoUsed) {
    return { revived: false, restoredHp: 0, nextPlayer: player };
  }
  const restoredHp = Math.max(1, Math.round(player.maxHp * FATE_ECHO_REVIVE_HP_PCT));
  return {
    revived: true,
    restoredHp,
    nextPlayer: patchRelicState(player, { fateEchoUsed: true }),
  };
}

/** 把怪物 id 列表标记为「冰冻 N 回合」。供 CombatSystem 在命中后调用。 */
export function applyFreezeToMonsters(
  monsters: readonly Monster[],
  targetId: string,
  rounds: number = PERMAFROST_CORE_FREEZE_ROUNDS,
): Monster[] {
  return monsters.map((m) =>
    m.id === targetId && m.aiState !== 'DEAD' ? { ...m, frozenRounds: rounds } : m,
  );
}
