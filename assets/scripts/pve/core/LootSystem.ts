// 掉落系统（design §6）：普通怪掉落 50% 金币 / 25% 灵气 / 25% 金币+灵气；宝箱开启获得同张表的掉落
// （M1 简化：未单列宝箱专属掉落表，复用 NORMAL_MONSTER_DROP，详见 design.md AC-6）。
//
// rollNormalMonsterDrop 是纯随机掷取函数：调用方传入 rng，便于复用同一份楼层 RNG 续算（AC-13 确定性）。
// openChest 是 ApplyResult 纯函数：金币直接入账；灵气经 AnimaSystem.addAnima 计入进度并可能连锁触发强化。

import { addAnima, traitCount } from './AnimaSystem';
import { canAfford, spend } from './ApSystem';
import { equipItem } from './EquipHelper';
import { rollEquipment, rollRandomSlot } from './EquipmentSystem';
import { rollGuaranteedDrop as rollGoblinChiefGuaranteedDrop } from './bosses/GoblinChief';
import {
  ADVANCABLE_CLASSES,
  ANIMA_MONSTER_DROP,
  CLASS_FRAGMENTS_TO_ADVANCE,
  ELITE_MONSTER_DROP,
  NORMAL_MONSTER_DROP,
} from './PveConstants';
import type { AdvancableClass, ClassId } from './PveConstants';
import type { EquipQuality } from './PveTypes';
import { createRng } from './rng';
import type { Rng } from './rng';
import type { ApplyResult, EquipItem, ExpeditionState, PveEvent } from './PveTypes';

export interface DropResult {
  gold?: number;
  anima?: number;
  equip?: EquipItem;
  /** 职业碎片对（精英怪 5% 掉落）：随机 2 个不同职业各 +1 碎片。 */
  fragmentPair?: AdvancableClass[];
}

const [GOLD_MIN, GOLD_MAX] = NORMAL_MONSTER_DROP.goldSmall;
const [ANIMA_MIN, ANIMA_MAX] = NORMAL_MONSTER_DROP.animaSmall;

/** 灵气怪掉落：100% 大量灵气（AC-18）。 */
export function rollAnimaMonsterDrop(rng: Rng): DropResult {
  const [min, max] = ANIMA_MONSTER_DROP.animaLarge;
  return { anima: rng.int(min, max) };
}

/** 精英怪掉落：40% 中量金币 / 30% 金币+灵气 / 15% 高额金币 / 10% 装备 / 5% 进阶卡（design §6）。 */
export function rollEliteMonsterDrop(rng: Rng): DropResult {
  const roll = rng.next();
  if (roll < ELITE_MONSTER_DROP.GOLD_ONLY) {
    return { gold: rng.int(ELITE_MONSTER_DROP.goldMid[0], ELITE_MONSTER_DROP.goldMid[1]) };
  }
  if (roll < ELITE_MONSTER_DROP.GOLD_ONLY + ELITE_MONSTER_DROP.GOLD_AND_ANIMA) {
    return {
      gold: rng.int(ELITE_MONSTER_DROP.goldMid[0], ELITE_MONSTER_DROP.goldMid[1]),
      anima: rng.int(ELITE_MONSTER_DROP.animaMid[0], ELITE_MONSTER_DROP.animaMid[1]),
    };
  }
  if (roll < ELITE_MONSTER_DROP.GOLD_ONLY + ELITE_MONSTER_DROP.GOLD_AND_ANIMA + ELITE_MONSTER_DROP.GOLD_HIGH) {
    return { gold: rng.int(ELITE_MONSTER_DROP.goldHigh[0], ELITE_MONSTER_DROP.goldHigh[1]) };
  }
  if (roll < ELITE_MONSTER_DROP.GOLD_ONLY + ELITE_MONSTER_DROP.GOLD_AND_ANIMA + ELITE_MONSTER_DROP.GOLD_HIGH + ELITE_MONSTER_DROP.EQUIP) {
    // EQUIP 分支（10%，AC-17）：掉落一件 FINE 品质随机槽位装备
    return { equip: rollEquipment(rng, rollRandomSlot(rng), 'FINE') };
  }
  // FRAGMENT_PAIR 分支（5%，V2）：随机 2 个不同职业碎片，由 applySimpleDrop 各 +1
  const shuffled = rng.shuffle(ADVANCABLE_CLASSES);
  return { fragmentPair: [shuffled[0], shuffled[1]] };
}

/**
 * 按 50%(金币) / 25%(灵气) / 25%(金币+灵气) 概率掷取一份基础掉落，
 * 再独立判定 3% 额外掉落 COMMON 装备（design §11.3 普通怪极低概率）。
 */
export function rollNormalMonsterDrop(rng: Rng): DropResult {
  const roll = rng.next();
  let result: DropResult;
  if (roll < NORMAL_MONSTER_DROP.GOLD_ONLY) {
    result = { gold: rng.int(GOLD_MIN, GOLD_MAX) };
  } else if (roll < NORMAL_MONSTER_DROP.GOLD_ONLY + NORMAL_MONSTER_DROP.ANIMA_ONLY) {
    result = { anima: rng.int(ANIMA_MIN, ANIMA_MAX) };
  } else {
    result = { gold: rng.int(GOLD_MIN, GOLD_MAX), anima: rng.int(ANIMA_MIN, ANIMA_MAX) };
  }
  // 独立 3% 概率额外掉落装备（不影响基础掉落结果）
  if (rng.chance(NORMAL_MONSTER_DROP.EQUIP_CHANCE)) {
    result = { ...result, equip: rollEquipment(rng, rollRandomSlot(rng), 'COMMON') };
  }
  return result;
}

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

const BOSS_DROP_QUALITY: Record<number, EquipQuality> = {
  2: 'FINE',
  3: 'RARE',
  4: 'EPIC',
  5: 'LEGENDARY',
};

/** 章节 2-5 Boss 通用掉落：固定 10 金 + 章节品质装备。 */
function rollGenericBossDrop(rng: Rng, chapter: number): DropResult {
  const quality: EquipQuality = BOSS_DROP_QUALITY[chapter] ?? 'FINE';
  return { gold: 10, equip: rollEquipment(rng, rollRandomSlot(rng), quality) };
}

/**
 * 开启宝箱：玩家须站在箱子格、AP ≥ 1、箱子尚未开启，否则 no-op（不消耗 AP/不产生事件）。
 * 命中后：扣 AP、标记 consumed、推进楼层 RNG 状态、结算掉落 —— 产生
 * OPEN_CHEST → LOOT（→ 灵气达阈值时连锁 ANIMA_STRENGTHEN）事件序列。
 */
export function openChest(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'CHEST' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!canAfford(floor.ap, 'OPEN_CHEST')) return noop(state);

  const rng = createRng(floor.rngState);
  const drop = rollNormalMonsterDrop(rng);
  // 10% 概率额外掉落 COMMON 品质装备（AC-17）；先算普通掉落以保证 rng 顺序向后兼容
  const equip = rng.chance(0.10) ? rollEquipment(rng, rollRandomSlot(rng), 'COMMON') : undefined;

  let next: ExpeditionState = {
    ...state,
    floorState: {
      ...floor,
      ap: spend(floor.ap, 'OPEN_CHEST'),
      rngState: rng.state(),
      entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
    },
  };

  // 命运树 C2 宝箱老手：宝箱金币 +chestGoldBonusPct（取整）
  const chestGoldBonusPct = state.player.treeBonuses?.chestGoldBonusPct ?? 0;
  const actualGold = drop.gold ? Math.round(drop.gold * (1 + chestGoldBonusPct)) : undefined;

  const lootEvent: PveEvent = {
    type: 'LOOT',
    gold: actualGold,
    anima: drop.anima,
    source: entityId,
    ...(equip ? { equip } : {}),
  };
  const events: PveEvent[] = [
    { type: 'OPEN_CHEST', entityId },
    lootEvent,
  ];

  if (actualGold) {
    next = { ...next, player: { ...next.player, gold: next.player.gold + actualGold } };
  }
  if (drop.anima) {
    const animaResult = addAnima(next, drop.anima);
    next = animaResult.state;
    events.push(...animaResult.events);
  }
  if (equip) {
    next = { ...next, player: equipItem(next.player, equip) };
  }

  return { state: next, events };
}

/** 通用"结算一份掉落并 emit LOOT"内部函数，避免三份重复逻辑。 */
function applySimpleDrop(
  state: ExpeditionState,
  monsterId: string,
  roller: (rng: Rng) => DropResult,
): ApplyResult {
  const floor = state.floorState;
  const rng = createRng(floor.rngState);
  const drop = roller(rng);

  let next: ExpeditionState = {
    ...state,
    floorState: { ...floor, rngState: rng.state() },
  };

  // strengthen_gold_find：拾取金币 +20%（可叠加，取整）
  const goldFindCount = traitCount(state.player.classTraits, 'strengthen_gold_find');
  const actualGold = drop.gold
    ? (goldFindCount > 0 ? Math.round(drop.gold * (1 + goldFindCount * 0.2)) : drop.gold)
    : undefined;

  const lootEvent: PveEvent = {
    type: 'LOOT',
    gold: actualGold,
    anima: drop.anima,
    source: monsterId,
    ...(drop.equip ? { equip: drop.equip } : {}),
    ...(drop.fragmentPair ? { fragmentPair: drop.fragmentPair } : {}),
  };
  const events: PveEvent[] = [lootEvent];

  if (actualGold) {
    next = { ...next, player: { ...next.player, gold: next.player.gold + actualGold } };
  }
  if (drop.anima) {
    const animaResult = addAnima(next, drop.anima);
    next = animaResult.state;
    events.push(...animaResult.events);
  }
  if (drop.equip) {
    next = { ...next, player: equipItem(next.player, drop.equip) };
  }
  if (drop.fragmentPair) {
    // 随机 2 个不同职业各 +1 碎片（随机职业由 rollEliteMonsterDrop 中的 rng.shuffle 决定，此处不再消耗 rng）
    let fragments = { ...next.player.classFragments };
    for (const cls of drop.fragmentPair) {
      fragments[cls] = (fragments[cls] ?? 0) + 1;
    }
    next = { ...next, player: { ...next.player, classFragments: fragments } };
    // 检测是否可进阶（有碎片达阈值且不是当前职业）
    const available = (Object.entries(next.player.classFragments) as [ClassId, number][])
      .filter(([cls, count]) => cls !== next.player.classId && (count ?? 0) >= CLASS_FRAGMENTS_TO_ADVANCE)
      .map(([cls]) => cls);
    if (available.length > 0) {
      events.push({ type: 'CLASS_CAN_ADVANCE', available });
    }
  }

  return { state: next, events };
}

/**
 * 击杀掉落统一入口：按怪物 type 派发（AC-6/AC-10/AC-18）。
 * - NORMAL → 50/25/25 金币/灵气/两者
 * - ANIMA  → 100% 大量灵气
 * - ELITE  → 40/30/30 金币/金币+灵气/高额金币（装备待 AC-17）
 * - BOSS   → 专属必掉装备 + 一份普通掉落
 *
 * 调用方应确保此函数在 KILL 事件 emit 之后调用（顺序：ATTACK → KILL → 本函数）。
 */
export function applyMonsterKillDrop(state: ExpeditionState, monsterId: string): ApplyResult {
  const floor = state.floorState;
  const monster = floor.monsters.find((m) => m.id === monsterId);
  if (!monster) return noop(state);
  if (monster.type === 'BOSS' && monster.bossId === 'GOBLIN_CHIEF') {
    return applyGoblinChiefDrop(state, monsterId);
  }
  if (monster.type === 'BOSS') {
    const chapter = state.chapter;
    return applySimpleDrop(state, monsterId, (rng) => rollGenericBossDrop(rng, chapter));
  }
  if (monster.type === 'ANIMA') return applySimpleDrop(state, monsterId, rollAnimaMonsterDrop);
  if (monster.type === 'ELITE') return applySimpleDrop(state, monsterId, rollEliteMonsterDrop);
  if (monster.type !== 'NORMAL') return noop(state);
  return applySimpleDrop(state, monsterId, rollNormalMonsterDrop);
}

/**
 * 哥布林酋长击杀掉落（design §6 Boss / AC-10）：
 * - 必掉装备「哥布林酋长的战斧」装入 WEAPON 槽（覆盖原有武器）
 * - 额外给一份普通掉落（金币 + 灵气）作为通关奖励
 * - emit LOOT(equip, gold, anima, source) + 可能的 ANIMA_STRENGTHEN
 */
function applyGoblinChiefDrop(state: ExpeditionState, monsterId: string): ApplyResult {
  const floor = state.floorState;
  const rng = createRng(floor.rngState);
  // 50% 概率掉落哥布林酋长战斧
  const dropsWeapon = rng.chance(0.5);
  const equip = dropsWeapon ? rollGoblinChiefGuaranteedDrop(rng) : undefined;
  const drop = rollNormalMonsterDrop(rng);

  let next: ExpeditionState = {
    ...state,
    floorState: { ...floor, rngState: rng.state() },
    ...(equip ? { player: equipItem(state.player, equip) } : {}),
  };

  const events: PveEvent[] = [
    { type: 'LOOT', gold: drop.gold, anima: drop.anima, ...(equip ? { equip } : {}), source: monsterId },
  ];

  if (drop.gold) {
    next = { ...next, player: { ...next.player, gold: next.player.gold + drop.gold } };
  }
  if (drop.anima) {
    const animaResult = addAnima(next, drop.anima);
    next = animaResult.state;
    events.push(...animaResult.events);
  }

  return { state: next, events };
}
