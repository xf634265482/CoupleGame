// 营地系统（AC-19）：每击败章节 Boss 后进入营地（design §3.1）。
// 功能：商店购买（治疗/强化）、装备整理（变卖）、返回大厅、继续远征。
// 纯函数：applyShopBuy / applySellEquip 处理逻辑，无框架依赖；View 层负责 UI 交互。

import { unequipItem } from './EquipmentSystem';
import type { ApplyResult, EquipQuality, EquipSlot, ExpeditionState, RunPlayer } from './PveTypes';

// ── 营地商店物品类型 ───────────────────────────────────

export type CampItemId = 'HEAL_FULL' | 'BUFF_MAX_HP';

export interface CampShopEntry {
  id: CampItemId;
  name: string;
  desc: string;
  cost: number;
}

/** 营地商店物品列表（每次进营地可购买多次，消耗局内星尘字段 `gold`）。 */
export const CAMP_SHOP_ITEMS: readonly CampShopEntry[] = [
  { id: 'HEAL_FULL',   name: '完全治疗', desc: 'HP 回满',         cost: 30 },
  { id: 'BUFF_MAX_HP', name: '强化体魄', desc: '最大 HP 永久 +40', cost: 60 },
] as const;

/** 营地价格；统一供界面展示与购买结算使用。 */
export function campShopCost(player: RunPlayer, baseCost: number): number {
  void player;
  return Math.max(1, Math.ceil(baseCost));
}

export function getCampShopItems(player: RunPlayer): CampShopEntry[] {
  return CAMP_SHOP_ITEMS.map((entry) => ({
    ...entry,
    cost: campShopCost(player, entry.cost),
  }));
}

// ── 购买逻辑（纯函数） ────────────────────────────────

/**
 * 购买营地商店物品：扣除星尘（`player.gold`），应用效果，产生 SHOP_BUY 事件。
 *
 * No-op 条件（返回 events 为空）：
 * - itemId 无效
 * - 星尘不足
 * - HEAL_FULL 时 HP 已满
 */
export function applyShopBuy(state: ExpeditionState, itemId: CampItemId): ApplyResult {
  const entry = CAMP_SHOP_ITEMS.find((i) => i.id === itemId);
  if (!entry) return { state, events: [] };

  const { player } = state;
  const cost = campShopCost(player, entry.cost);
  if (player.gold < cost) return { state, events: [] };
  const paidPlayer = { ...player, gold: player.gold - cost };

  let nextPlayer = paidPlayer;
  let effect = '';

  switch (itemId) {
    case 'HEAL_FULL': {
      if (player.hp >= player.maxHp) return { state, events: [] }; // 已满血 → no-op
      nextPlayer = { ...nextPlayer, hp: player.maxHp };
      effect = `HP ${player.hp} → ${player.maxHp}`;
      break;
    }
    case 'BUFF_MAX_HP': {
      const newMaxHp = player.maxHp + 40;
      // 同时也回复 40 HP（上限为新 maxHp）
      nextPlayer = { ...nextPlayer, maxHp: newMaxHp, hp: Math.min(player.hp + 40, newMaxHp) };
      effect = `最大 HP +40`;
      break;
    }
    default: {
      // exhaustive check
      const _: never = itemId;
      void _;
      return { state, events: [] };
    }
  }

  return {
    state: { ...state, player: nextPlayer },
    events: [{ type: 'SHOP_BUY', itemId, cost, effect }],
  };
}

// ── 变卖价格表（品质 → 星尘，design §3.1 装备整理；永久档案出售另有半价表）────────────
export const SELL_PRICE: Record<EquipQuality, number> = {
  COMMON:    5,
  FINE:      10,
  RARE:      20,
  EPIC:      40,
  LEGENDARY: 80,
};

/**
 * 变卖装备：移除指定槽位的装备，按 SELL_PRICE 回收星尘（`player.gold`），产生 SELL_EQUIP 事件。
 * No-op：槽位为空时返回空事件列表。
 */
export function applySellEquip(state: ExpeditionState, slot: EquipSlot): ApplyResult {
  const item = state.player.equipment[slot];
  if (!item) return { state, events: [] };

  const gold = SELL_PRICE[item.quality];
  const player = unequipItem(state.player, slot);

  return {
    state: {
      ...state,
      player: { ...player, gold: player.gold + gold },
    },
    events: [{ type: 'SELL_EQUIP', slot, itemName: item.name, gold }],
  };
}

/**
 * 变卖背包装备：移除指定 itemId 的背包装备，按 SELL_PRICE 回收星尘（`player.gold`），产生 SELL_EQUIP 事件。
 * No-op：背包为空 / 未找到目标物品时返回空事件列表。
 */
export function applySellBagEquip(state: ExpeditionState, itemId: string): ApplyResult {
  const bag = state.player.bag ?? [];
  const item = bag.find((entry) => entry.id === itemId);
  if (!item) return { state, events: [] };

  const gold = SELL_PRICE[item.quality];
  const nextBag = bag.filter((entry) => entry.id !== itemId);

  return {
    state: {
      ...state,
      player: {
        ...state.player,
        gold: state.player.gold + gold,
        bag: nextBag,
      },
    },
    events: [{ type: 'SELL_EQUIP', slot: item.slot, itemName: item.name, gold }],
  };
}

