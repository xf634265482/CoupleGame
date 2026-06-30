// 营地系统（AC-19）：每击败章节 Boss 后进入营地（design §3.1）。
// 功能：商店购买（治疗/强化）、装备整理（变卖）、返回大厅、继续远征。
// 纯函数：applyShopBuy / applySellEquip 处理逻辑，无框架依赖；View 层负责 UI 交互。

import { unequipItem } from './EquipmentSystem';
import { CHAPTER_BOSS_RELIC, RELIC_CHEST } from './PveConstants';
import { activateRelic, deactivateRelic, pickupRelic, playerHasRelic } from './RelicSystem';
import { createRng } from './rng';
import type { ApplyResult, EquipQuality, EquipSlot, ExpeditionState, PveEvent, RelicId, RunPlayer } from './PveTypes';
import { payGoldWithTraits } from './strengthen/StrengthenEconomy';

// ── 营地商店物品类型 ───────────────────────────────────

export type CampItemId = 'HEAL_FULL' | 'BUFF_MAX_HP';

export interface CampShopEntry {
  id: CampItemId;
  name: string;
  desc: string;
  cost: number;
}

/** 营地商店物品列表（每次进营地可购买多次，金币消耗为限）。 */
export const CAMP_SHOP_ITEMS: readonly CampShopEntry[] = [
  { id: 'HEAL_FULL',   name: '完全治疗', desc: 'HP 回满',         cost: 30 },
  { id: 'BUFF_MAX_HP', name: '强化体魄', desc: '最大 HP 永久 +40', cost: 60 },
] as const;

/** 应用命运树 C4 商路嗅觉后的营地价格；统一供界面展示与购买结算使用。 */
export function campShopCost(player: RunPlayer, baseCost: number): number {
  const discountPct = Math.max(0, Math.min(1, player.treeBonuses?.campShopDiscountPct ?? 0));
  return Math.max(1, Math.ceil(baseCost * (1 - discountPct)));
}

export function getCampShopItems(player: RunPlayer): CampShopEntry[] {
  return CAMP_SHOP_ITEMS.map((entry) => ({
    ...entry,
    cost: campShopCost(player, entry.cost),
  }));
}

// ── 购买逻辑（纯函数） ────────────────────────────────

/**
 * 购买营地商店物品：扣除金币，应用效果，产生 SHOP_BUY 事件。
 *
 * No-op 条件（返回 events 为空）：
 * - itemId 无效
 * - 金币不足
 * - HEAL_FULL 时 HP 已满
 */
export function applyShopBuy(state: ExpeditionState, itemId: CampItemId): ApplyResult {
  const entry = CAMP_SHOP_ITEMS.find((i) => i.id === itemId);
  if (!entry) return { state, events: [] };

  const { player } = state;
  const cost = campShopCost(player, entry.cost);
  const paidPlayer = payGoldWithTraits(player, cost);
  if (!paidPlayer) return { state, events: [] };

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

// ── 变卖价格表（品质 → 金币，design §3.1 装备整理）────────────
export const SELL_PRICE: Record<EquipQuality, number> = {
  COMMON:    10,
  FINE:      20,
  RARE:      40,
  EPIC:      80,
  LEGENDARY: 200,
};

/**
 * 变卖装备：移除指定槽位的装备，按 SELL_PRICE 回收金币，产生 SELL_EQUIP 事件。
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
 * 变卖背包装备：移除指定 itemId 的背包装备，按 SELL_PRICE 回收金币，产生 SELL_EQUIP 事件。
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

// ── 遗物宝箱（design Boss设计V1 / 营地遗物宝箱）─────────────────────
//
// 营地是 Boss 击败后弹出的全屏 modal，绑定刚通关 Boss 的章节。
// 宝箱单次开启花费 RELIC_CHEST.COST_DIAMOND 星尘，10% 概率开出本章 Boss 遗物。
// 已持有该遗物时改为 30% 星尘返还。
//
// 钻石余额由 Controller 在调用本函数前传入（currentDiamond），core 不直接持有钻石；
// 实际钻石账户增减由 Controller 看 RELIC_CHEST_OPENED 事件后调用云函数完成。

export interface OpenRelicChestResult {
  state: ExpeditionState;
  events: PveEvent[];
  /** 钻石需要扣减的净额（本次花费 - 退款）；调用方据此调用云函数更新钻石余额。 */
  diamondDelta: number;
}

/**
 * 营地遗物宝箱开启：
 * - 校验：钻石 ≥ COST_DIAMOND、当前章节有对应遗物
 *   不满足 → no-op（state 原样返回，diamondDelta = 0）
 * - 仅消耗钻石（COST_GOLD=0，无金币代价）；钻石由 Controller 据 diamondDelta 处理
 * - 掷 RELIC_CHEST.SUCCESS_CHANCE 概率：
 *   - 未中 → 仅 emit RELIC_CHEST_OPENED { success: false }，资源不退
 *   - 中了 + 未持有 → 拾取遗物，emit RELIC_CHEST_OPENED { success: true, relicId }
 *   - 中了 + 已持有 → 30% 资源返还（金币加回 player.gold，钻石加回 diamondDelta），
 *     emit RELIC_CHEST_OPENED { success: true, relicId, refunded: true, ... }
 */
export function openRelicChest(state: ExpeditionState, currentDiamond: number): OpenRelicChestResult {
  const player = state.player;
  const relicId = CHAPTER_BOSS_RELIC[state.chapter] as RelicId | undefined;
  if (!relicId) return { state, events: [], diamondDelta: 0 };
  const paidPlayer = payGoldWithTraits(player, RELIC_CHEST.COST_GOLD);
  if (!paidPlayer) return { state, events: [], diamondDelta: 0 };
  if (currentDiamond < RELIC_CHEST.COST_DIAMOND) return { state, events: [], diamondDelta: 0 };

  // 扣金币（钻石的扣减由 Controller 据 diamondDelta 处理）
  let nextPlayer = paidPlayer;
  let diamondDelta = -RELIC_CHEST.COST_DIAMOND;

  // 掷骰
  const rng = createRng(state.floorState.rngState);
  const hit = rng.chance(RELIC_CHEST.SUCCESS_CHANCE);
  const nextFloor = { ...state.floorState, rngState: rng.state() };

  // 未中：资源不退
  if (!hit) {
    return {
      state: { ...state, player: nextPlayer, floorState: nextFloor },
      events: [{ type: 'RELIC_CHEST_OPENED', success: false }],
      diamondDelta,
    };
  }

  // 中了 + 已持有：30% 返还（金币加回、钻石部分退还）
  if (playerHasRelic(nextPlayer, relicId)) {
    const refundGold = Math.round(RELIC_CHEST.COST_GOLD * RELIC_CHEST.REFUND_PCT);
    const refundDiamond = Math.round(RELIC_CHEST.COST_DIAMOND * RELIC_CHEST.REFUND_PCT);
    nextPlayer = { ...nextPlayer, gold: nextPlayer.gold + refundGold };
    diamondDelta += refundDiamond;
    return {
      state: { ...state, player: nextPlayer, floorState: nextFloor },
      events: [{ type: 'RELIC_CHEST_OPENED', success: true, relicId, refunded: true, refundGold, refundDiamond }],
      diamondDelta,
    };
  }

  // 中了 + 未持有：拾取遗物
  const pickup = pickupRelic(nextPlayer, relicId, 'CAMP_RELIC_CHEST');
  return {
    state: { ...state, player: pickup.player, floorState: nextFloor },
    events: [
      { type: 'RELIC_CHEST_OPENED', success: true, relicId },
      ...pickup.events,
    ],
    diamondDelta,
  };
}

// ── 遗物激活槽管理（Phase 5 AC-EQ-8）────────────────────────────────────

/**
 * 激活遗物：将 relicId 放入玩家激活槽。
 * 若激活槽已满（RELIC_ACTIVE_SLOTS=3），必须同时提供 replaceId 指定被替换的遗物。
 * 不产生事件（UI 即时刷新），返回新 state。
 */
export function campActivateRelic(
  state: ExpeditionState,
  relicId: RelicId,
  replaceId?: RelicId,
): ExpeditionState {
  const nextPlayer = activateRelic(state.player, relicId, replaceId);
  return nextPlayer === state.player ? state : { ...state, player: nextPlayer };
}

/**
 * 停用遗物：将 relicId 从激活槽移出（效果立即消失，仍保留在 ownedRelics）。
 */
export function campDeactivateRelic(state: ExpeditionState, relicId: RelicId): ExpeditionState {
  const nextPlayer = deactivateRelic(state.player, relicId);
  return nextPlayer === state.player ? state : { ...state, player: nextPlayer };
}
