// 中立交互实体（design §3 中性区域）：神像 / 温泉 / 祭坛 / 铁匠。

import { canAfford, spend } from './ApSystem';
import { addAnima } from './AnimaSystem';
import { equipItem } from './EquipHelper';
import { EQUIP_TRAIT_POOL } from './EquipmentSystem';
import {
  ALTAR_ANIMA_MAX,
  ALTAR_ANIMA_MIN,
  BLACKSMITH_ENHANCE_STEP,
  BLACKSMITH_FAIL_BASE,
  BLACKSMITH_FAIL_CAP,
  BLACKSMITH_FAIL_STEP,
  BLACKSMITH_FAIL_THRESHOLD,
  BLACKSMITH_REROLL_COST,
  BLACKSMITH_UPGRADE_COST,
  HOT_SPRING_HEAL_RATIO,
  IDOL_MAX_HP_BONUS,
} from './PveConstants';
import { createRng } from './rng';
import type { ApplyResult, EquipSlot, ExpeditionState, PveEvent } from './PveTypes';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/**
 * 使用神像：玩家站在 IDOL 格 + AP ≥ 1 + 未消耗 → 扣 AP，永久 +IDOL_MAX_HP_BONUS maxHp。
 * 当前 HP 同步上调（避免出现 "HP 20/maxHp 21" 的视觉怪状态）。
 */
export function useIdol(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'IDOL' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!canAfford(floor.ap, 'USE_IDOL')) return noop(state);

  const bonus = IDOL_MAX_HP_BONUS;
  const events: PveEvent[] = [{ type: 'IDOL_BLESSING', entityId, maxHpBonus: bonus }];

  return {
    state: {
      ...state,
      player: {
        ...state.player,
        maxHp: state.player.maxHp + bonus,
        hp: state.player.hp + bonus, // 同步把当前 HP 上限抬起来
      },
      floorState: {
        ...floor,
        ap: spend(floor.ap, 'USE_IDOL'),
        entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
      },
    },
    events,
  };
}

/**
 * 使用温泉：玩家站在 HOT_SPRING 格 + AP ≥ 1 + 未消耗 → 扣 AP，
 * 当次恢复 maxHp × HOT_SPRING_HEAL_RATIO（0.4 = 40% maxHp），超出上限截断；HP 已满则 no-op。
 */
export function useHotSpring(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'HOT_SPRING' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!canAfford(floor.ap, 'USE_HOT_SPRING')) return noop(state);
  if (state.player.hp >= state.player.maxHp) return noop(state); // 已满血则无意义，no-op 避免浪费 AP

  const targetHp = Math.min(
    state.player.maxHp,
    state.player.hp + Math.ceil(state.player.maxHp * HOT_SPRING_HEAL_RATIO),
  );
  const healed = targetHp - state.player.hp;

  const events: PveEvent[] = [{ type: 'HOT_SPRING_HEAL', entityId, healed }];

  return {
    state: {
      ...state,
      player: { ...state.player, hp: targetHp },
      floorState: {
        ...floor,
        ap: spend(floor.ap, 'USE_HOT_SPRING'),
        entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
      },
    },
    events,
  };
}

/**
 * 使用祭坛：玩家站在 ALTAR 格 + AP ≥ 1 + 未消耗 → 扣 AP，消耗祭坛，
 * 随机获得 [ALTAR_ANIMA_MIN, ALTAR_ANIMA_MAX] 范围内的灵气（可能触发强化）。
 */
export function useAltar(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'ALTAR' || entity.consumed) return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  if (!canAfford(floor.ap, 'USE_ALTAR')) return noop(state);

  const rng = createRng(floor.rngState);
  const animaGain = rng.int(ALTAR_ANIMA_MIN, ALTAR_ANIMA_MAX);

  // 先扣 AP、消耗实体、推进 RNG 种子
  const midState: ExpeditionState = {
    ...state,
    floorState: {
      ...floor,
      ap: spend(floor.ap, 'USE_ALTAR'),
      rngState: rng.state(),
      entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
    },
  };

  // addAnima 追加灵气进度，可能再次触发 ANIMA_STRENGTHEN 事件
  const animaResult = addAnima(midState, animaGain);
  return {
    state: animaResult.state,
    events: [{ type: 'ALTAR_USED', entityId, anima: animaGain }, ...animaResult.events],
  };
}

/**
 * 铁匠强化：提升指定槽位装备的 baseStat，消耗金币（随强化等级递增）。
 * 强化增量按品质分级（COMMON+1 / FINE+2 / RARE+3 / EPIC+5 / LEGENDARY+8，×10基准）；
 * SHOES / TRINKET 固定 +1（不在 ×10 范围）。
 * +5 以上开始有失败概率（10%/15%/20%/…，封顶 80%）；失败时只扣费、属性不变。
 * 铁匠实体不消耗、不消耗 AP。
 */
/** 营地铁匠上下文的哨兵 entityId，用于跳过楼层实体与位置校验。 */
export const CAMP_BLACKSMITH_ID = 'CAMP_BLACKSMITH';

export function upgradeEquip(state: ExpeditionState, entityId: string, slot: EquipSlot): ApplyResult {
  const floor = state.floorState;
  if (entityId !== CAMP_BLACKSMITH_ID) {
    const entity = floor.entities.find((e) => e.id === entityId);
    if (!entity || entity.type !== 'BLACKSMITH') return noop(state);
    if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  }
  const item = state.player.equipment[slot];
  if (!item) return noop(state);

  const currentLevel = item.enhanceLevel ?? 0;

  // 强化步进按品质决定（SHOES/TRINKET 固定+1；WEAPON/ARMOR/HELMET 按品质分级）
  const upgradeStep = (slot === 'SHOES' || slot === 'TRINKET')
    ? 1
    : (BLACKSMITH_ENHANCE_STEP[item.quality] ?? 1);

  // 费用 = BASE × 步进 × (level+1)，品质越高每次强化值越大、费用也越高；命运树 C3 折扣后最低 1g
  const discount = state.player.treeBonuses?.blacksmithDiscount ?? 0;
  const cost = Math.max(1, BLACKSMITH_UPGRADE_COST * upgradeStep * (currentLevel + 1) - discount);
  if (state.player.gold < cost) return noop(state);

  // 消耗金币
  const afterGold = { ...state.player, gold: state.player.gold - cost };

  // 失败概率检定（+5 起生效，消耗 rngState 保证 AC-13 确定性）
  const failChance = currentLevel >= BLACKSMITH_FAIL_THRESHOLD
    ? Math.min(BLACKSMITH_FAIL_CAP, BLACKSMITH_FAIL_BASE + (currentLevel - BLACKSMITH_FAIL_THRESHOLD) * BLACKSMITH_FAIL_STEP)
    : 0;
  const rng = createRng(floor.rngState);
  const failed = failChance > 0 && rng.chance(failChance);
  const nextRngState = rng.state();

  if (failed) {
    return {
      state: {
        ...state,
        player: afterGold,
        floorState: { ...floor, rngState: nextRngState },
      },
      events: [{ type: 'BLACKSMITH_UPGRADE_FAIL', entityId, slot, failChance }],
    };
  }

  // 强化成功
  const newStat = item.baseStat + upgradeStep;
  const newEnhanceLevel = currentLevel + 1;
  const newItem = { ...item, baseStat: newStat, enhanceLevel: newEnhanceLevel };

  // equipItem 统一处理 HELMET 的 maxHp/hp 联动
  const player = equipItem(afterGold, newItem);

  return {
    state: { ...state, player, floorState: { ...floor, rngState: nextRngState } },
    events: [{ type: 'BLACKSMITH_UPGRADE', entityId, slot, newStat, newEnhanceLevel }],
  };
}

/**
 * 词条洗炼最低品质要求：紫色（EPIC）及以上才有词条槽。
 * 低品质装备的词条栏留空，洗炼对其无效。
 */
export const REROLL_QUALITY_MIN = new Set(['EPIC', 'LEGENDARY']);

/**
 * 铁匠洗炼：为指定槽位装备随机替换一个词条，消耗 BLACKSMITH_REROLL_COST 金币。
 * 仅 EPIC / LEGENDARY 品质装备有词条槽；低品质返回 no-op。
 * 铁匠实体不消耗，不消耗 AP。
 */
export function rerollEquipTrait(state: ExpeditionState, entityId: string, slot: EquipSlot): ApplyResult {
  const floor = state.floorState;
  if (entityId !== CAMP_BLACKSMITH_ID) {
    const entity = floor.entities.find((e) => e.id === entityId);
    if (!entity || entity.type !== 'BLACKSMITH') return noop(state);
    if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  }
  const item = state.player.equipment[slot];
  if (!item) return noop(state);
  if (!REROLL_QUALITY_MIN.has(item.quality)) return noop(state); // 品质不足，无词条槽
  if (state.player.gold < BLACKSMITH_REROLL_COST) return noop(state);

  const rng = createRng(floor.rngState);
  const newTrait = rng.pick([...EQUIP_TRAIT_POOL]);
  const newItem = { ...item, trait: newTrait };

  return {
    state: {
      ...state,
      player: {
        ...state.player,
        gold: state.player.gold - BLACKSMITH_REROLL_COST,
        equipment: { ...state.player.equipment, [slot]: newItem },
      },
      floorState: { ...floor, rngState: rng.state() },
    },
    events: [{ type: 'BLACKSMITH_REROLL', entityId, slot, newTrait }],
  };
}
