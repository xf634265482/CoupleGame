// 中立交互实体（design §3 中性区域）：神像 / 温泉 / 祭坛 / 铁匠。

import { canAfford, spend } from './ApSystem';
import { addAnima } from './AnimaSystem';
import { equipItem } from './EquipHelper';
import { EQUIP_TRAIT_POOL } from './EquipmentSystem';
import {
  ALTAR_ANIMA_MAX,
  ALTAR_ANIMA_MIN,
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
 * 当次按 HOT_SPRING_HEAL_RATIO 比例治疗（M1 = 1.0 = 回满）。
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
 * 铁匠强化：对指定槽位装备 +1 基础属性，消耗 BLACKSMITH_UPGRADE_COST 金币。
 * WEAPON/ARMOR/HELMET 的 baseStat 走伤害/护甲/生命×10基准，强化量同步为 +10；
 * SHOES（移动AP减免阈值）/ TRINKET（灵气获取%）不在×10范围内，强化量保持 +1。
 * 铁匠实体不消耗（玩家可多次强化不同槽位），也不消耗 AP（服务收费）。
 */
export function upgradeEquip(state: ExpeditionState, entityId: string, slot: EquipSlot): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'BLACKSMITH') return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
  const item = state.player.equipment[slot];
  if (!item) return noop(state);

  // 命运树 C3 巧匠人脉：铁匠强化费用 -blacksmithDiscount（最低 1）
  const discount = state.player.treeBonuses?.blacksmithDiscount ?? 0;
  const cost = Math.max(1, BLACKSMITH_UPGRADE_COST - discount);
  if (state.player.gold < cost) return noop(state);

  const upgradeStep = (slot === 'SHOES' || slot === 'TRINKET') ? 1 : 10;
  const newStat = item.baseStat + upgradeStep;
  const newItem = { ...item, baseStat: newStat };

  // 走 equipItem 统一处理 HELMET 的 maxHp/hp 联动（其他槽位仅替换装备）；先扣金币
  const afterGold = { ...state.player, gold: state.player.gold - cost };
  const player = equipItem(afterGold, newItem);

  return {
    state: { ...state, player },
    events: [{ type: 'BLACKSMITH_UPGRADE', entityId, slot, newStat }],
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
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'BLACKSMITH') return noop(state);
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return noop(state);
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
