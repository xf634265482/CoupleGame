// 命运碎片成长树（design「命运树 V1 数值调整建议」）：账户级永久成长，
// 用局外货币 destinyShards 解锁节点，效果在 startExpedition 时固化为
// RunPlayer.treeBonuses 快照（含随存档持久化，云端复算无需读取 PveMeta）。
//
// 5 列 × 3 节点（A 生存 / B 战斗 / C 财富 / D 强化 / E 天命），
// 同列内必须按 order 顺序解锁（解锁 A2 前需先解锁 A1）。
//
// 纯函数，零框架依赖；E2/E3「三选一」走 ApplyResult + PendingTreeChoice 队列模式，
// 与 ANIMA_STRENGTHEN 的 3 选 1 模式一致。

import { strengthenPoolForClass } from './AnimaSystem';
import { equipItem, rollEquipment } from './EquipmentSystem';
import {
  ADVANCABLE_CLASSES,
  DESTINY_TREE_NODES,
  type ClassId,
  TREE_A1_HP_BONUS,
  TREE_A2_HP_BONUS,
  TREE_A3_DEATH_GOLD_RETENTION,
  TREE_B1_ATTACK_BONUS,
  TREE_B2_AP_DICE_BONUS,
  TREE_B3_FRAGMENT_BONUS,
  TREE_C1_GOLD_BONUS,
  TREE_C2_CHEST_GOLD_BONUS_PCT,
  TREE_C3_BLACKSMITH_DISCOUNT,
  TREE_D1_ANIMA_BONUS,
  TREE_D2_THRESHOLD_MULT,
  TREE_D3_ANIMA_GAIN_PCT,
  TREE_E1_HP_BONUS,
  type DestinyTreeNodeDef,
} from './PveConstants';
import { createRng, hashSeed, type Rng } from './rng';
import type {
  ApplyResult,
  DestinyTreeBonuses,
  ExpeditionState,
  PendingTreeChoice,
  PveEvent,
  PveMeta,
} from './PveTypes';

/** 全部效果归零的命运树快照（无任何节点解锁时使用）。 */
export const EMPTY_TREE_BONUSES: DestinyTreeBonuses = {
  maxHpBonus: 0,
  deathGoldRetentionPct: 0,
  attackBonus: 0,
  apDiceBonus: 0,
  fragmentBonus: 0,
  startGoldBonus: 0,
  chestGoldBonusPct: 0,
  blacksmithDiscount: 0,
  startAnimaBonus: 0,
  strengthenThresholdMult: 1,
  animaGainBonusPct: 0,
  hasEquipChoice: false,
  hasTraitChoice: false,
};

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/** 按 id 查找节点定义。 */
export function getNodeDef(nodeId: string): DestinyTreeNodeDef | undefined {
  return DESTINY_TREE_NODES.find((n) => n.id === nodeId);
}

/**
 * 是否可解锁指定节点：节点存在、未解锁、碎片足够、且（若非该列首节点）
 * 同列前一节点已解锁（同列需按 order 1→2→3 顺序解锁）。
 */
export function canUnlockNode(meta: PveMeta, nodeId: string): boolean {
  const def = getNodeDef(nodeId);
  if (!def) return false;

  const unlocked = meta.unlockedTreeNodes ?? [];
  if (unlocked.includes(nodeId)) return false;
  if (meta.destinyShards < def.cost) return false;

  if (def.order > 1) {
    const prevId = `${def.column}${def.order - 1}`;
    if (!unlocked.includes(prevId)) return false;
  }
  return true;
}

/**
 * 解锁节点：扣除 destinyShards 并加入 unlockedTreeNodes。
 * 不可解锁（见 canUnlockNode）时原样返回 meta（no-op）。
 */
export function unlockNode(meta: PveMeta, nodeId: string): PveMeta {
  if (!canUnlockNode(meta, nodeId)) return meta;
  const def = getNodeDef(nodeId)!;

  return {
    ...meta,
    destinyShards: meta.destinyShards - def.cost,
    unlockedTreeNodes: [...(meta.unlockedTreeNodes ?? []), nodeId],
  };
}

/**
 * 汇总已解锁节点的全部效果为一份快照（startExpedition 时调用一次并固化到 RunPlayer.treeBonuses）。
 */
export function getTreeBonuses(unlockedNodes: readonly string[] | undefined): DestinyTreeBonuses {
  const set = new Set(unlockedNodes ?? []);
  const bonuses: DestinyTreeBonuses = { ...EMPTY_TREE_BONUSES };

  if (set.has('A1')) bonuses.maxHpBonus += TREE_A1_HP_BONUS;
  if (set.has('A2')) bonuses.maxHpBonus += TREE_A2_HP_BONUS;
  if (set.has('A3')) bonuses.deathGoldRetentionPct = TREE_A3_DEATH_GOLD_RETENTION;

  if (set.has('B1')) bonuses.attackBonus += TREE_B1_ATTACK_BONUS;
  if (set.has('B2')) bonuses.apDiceBonus += TREE_B2_AP_DICE_BONUS;
  if (set.has('B3')) bonuses.fragmentBonus += TREE_B3_FRAGMENT_BONUS;

  if (set.has('C1')) bonuses.startGoldBonus += TREE_C1_GOLD_BONUS;
  if (set.has('C2')) bonuses.chestGoldBonusPct += TREE_C2_CHEST_GOLD_BONUS_PCT;
  if (set.has('C3')) bonuses.blacksmithDiscount += TREE_C3_BLACKSMITH_DISCOUNT;

  if (set.has('D1')) bonuses.startAnimaBonus += TREE_D1_ANIMA_BONUS;
  if (set.has('D2')) bonuses.strengthenThresholdMult *= TREE_D2_THRESHOLD_MULT;
  if (set.has('D3')) bonuses.animaGainBonusPct += TREE_D3_ANIMA_GAIN_PCT;

  if (set.has('E1')) bonuses.maxHpBonus += TREE_E1_HP_BONUS;
  if (set.has('E2')) bonuses.hasEquipChoice = true;
  if (set.has('E3')) bonuses.hasTraitChoice = true;

  return bonuses;
}

/** E2 命运馈赠：随机生成 3 件互不相同槽位的 COMMON 装备供三选一。 */
export function rollEquipChoiceOptions(rng: Rng) {
  const slots = rng.shuffle(['WEAPON', 'ARMOR', 'HELMET', 'SHOES', 'TRINKET'] as const).slice(0, 3);
  return slots.map((slot) => rollEquipment(rng, slot, 'COMMON'));
}

/** E3 命运护佑：从职业强化词条池中随机抽取最多 3 个互不相同的候选。 */
export function rollTraitChoiceOptions(rng: Rng, classId: Parameters<typeof strengthenPoolForClass>[0]) {
  const pool = strengthenPoolForClass(classId);
  const shuffled = rng.shuffle(pool);
  return shuffled.slice(0, Math.min(3, shuffled.length));
}

/**
 * 远征开局：根据 treeBonuses 生成待选队列（E2/E3），并产生 TREE_CHOICE_OFFERED 事件。
 * 供 startExpedition 调用；rng 由调用方传入以保证 AC-13 确定性（建议用本层 floorState.rngState 派生的 rng）。
 */
export function buildPendingTreeChoices(
  rng: Rng,
  bonuses: DestinyTreeBonuses,
  classId: Parameters<typeof strengthenPoolForClass>[0],
): { choices: PendingTreeChoice[]; events: PveEvent[] } {
  const choices: PendingTreeChoice[] = [];
  const events: PveEvent[] = [];

  if (bonuses.hasEquipChoice) {
    choices.push({ source: 'E2', kind: 'EQUIP', equipOptions: rollEquipChoiceOptions(rng) });
    events.push({ type: 'TREE_CHOICE_OFFERED', source: 'E2', kind: 'EQUIP' });
  }
  if (bonuses.hasTraitChoice) {
    const traitOptions = rollTraitChoiceOptions(rng, classId);
    if (traitOptions.length > 0) {
      choices.push({ source: 'E3', kind: 'TRAIT', traitOptions });
      events.push({ type: 'TREE_CHOICE_OFFERED', source: 'E3', kind: 'TRAIT' });
    }
  }

  return { choices, events };
}

/**
 * 玩家从待选队列队首选定一项并生效（队列为空时 no-op）：
 * - EQUIP：装入对应槽位（替换原有装备，原装备视为出售/丢弃，M1 不返还金币）。
 * - TRAIT：加入 classTraits（与 AnimaSystem.applyStrengthen 一致，重复词条会被去重忽略）。
 */
export function resolveTreeChoice(state: ExpeditionState, choiceIndex: number): ApplyResult {
  const pending = state.pendingTreeChoices ?? [];
  const choice = pending[0];
  if (!choice) return noop(state);

  const remaining = pending.slice(1);

  if (choice.kind === 'EQUIP') {
    const options = choice.equipOptions ?? [];
    const selected = options[choiceIndex];
    if (!selected) return noop(state);

    return {
      state: {
        ...state,
        player: equipItem(state.player, selected),
        pendingTreeChoices: remaining,
      },
      events: [{ type: 'TREE_CHOICE_RESOLVED', source: choice.source, kind: 'EQUIP', selected: selected.name }],
    };
  }

  // TRAIT
  const options = choice.traitOptions ?? [];
  const selected = options[choiceIndex];
  if (!selected) return noop(state);

  const alreadyHas = state.player.classTraits.includes(selected);
  return {
    state: {
      ...state,
      player: alreadyHas
        ? state.player
        : { ...state.player, classTraits: [...state.player.classTraits, selected] },
      pendingTreeChoices: remaining,
    },
    events: [{ type: 'TREE_CHOICE_RESOLVED', source: choice.source, kind: 'TRAIT', selected }],
  };
}

/**
 * B3 职业先驱：从可进阶职业（BERSERKER/ARCHER/ROGUE）中随机选一个，碎片数 + fragmentBonus。
 * fragmentBonus<=0 时 no-op，返回原 classFragments 引用。
 */
export function applyFragmentBonus(
  rng: Rng,
  classFragments: Partial<Record<ClassId, number>>,
  fragmentBonus: number,
): Partial<Record<ClassId, number>> {
  if (fragmentBonus <= 0) return classFragments;
  const target = rng.pick(ADVANCABLE_CLASSES);
  return {
    ...classFragments,
    [target]: (classFragments[target] ?? 0) + fragmentBonus,
  };
}

/** 供调用方按 runSeed 派生命运树相关 RNG（与楼层种子隔离，AC-13 确定性）。 */
export function deriveTreeRng(runSeed: number): Rng {
  return createRng(hashSeed(`${runSeed}:tree`));
}
