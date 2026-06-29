// 命运词条卷轴系统（design Boss设计V1 / 掉落系统）：
// Boss 击杀 30% 独立概率掉落，玩家主动使用时从职业强化池抽 3 个候选 → 三选一 append 到 classTraits。
// 仅本场远征有效（player.scrolls / classTraits 死亡时清空）。
//
// 与 ANIMA_STRENGTHEN 流程的差异：
// - 卷轴不消耗灵气、不挤占 animaThreshold 进度
// - 触发事件为 SCROLL_OFFER（而非 ANIMA_STRENGTHEN），Controller 弹独立 UI
// - 选定时调用 claimScrollChoice：只 append trait（同样遵循 STRENGTHEN_META 的 oneShot/stack 上限），
//   不修改 animaThreshold
//
// 纯函数 + 零框架依赖；随机走 floor.rngState（AC-13 确定性）。

import { rollChoices, STRENGTHEN_META, traitCount, strengthenPoolForClass, IMMEDIATE_HP_STACK_TRAITS } from './AnimaSystem';
import { createRng } from './rng';
import type { ApplyResult, ExpeditionState, PveEvent, RunPlayer } from './PveTypes';
import { STRENGTHEN_DEF_BY_ID } from './strengthen/StrengthenCatalog';
import { generalDynamicMaxHpBonus } from './strengthen/CommonStrengthenEffects';

/** 拾取一张卷轴（Boss 掉落入口调用）：player.scrolls += 1，emit SCROLL_PICKUP。 */
export function pickupScroll(player: RunPlayer, source: string): { player: RunPlayer; events: PveEvent[] } {
  const count = (player.scrolls ?? 0) + 1;
  return {
    player: { ...player, scrolls: count },
    events: [{ type: 'SCROLL_PICKUP', source }],
  };
}

/**
 * 玩家主动使用一张卷轴：
 * - 校验 scrolls > 0，否则 no-op
 * - scrolls -= 1
 * - 从职业强化池抽 3 个候选（沿用 rollChoices 同样的过滤规则：oneShot/cap/tier 解锁条件）
 * - emit SCROLL_OFFER 供 Controller 弹出三选一 UI
 *
 * 注意：选定动作由 claimScrollChoice 完成（异步）。本函数已扣 scrolls 并推进 rngState。
 */
export function useScroll(state: ExpeditionState): ApplyResult {
  const count = state.player.scrolls ?? 0;
  if (count <= 0) return { state, events: [] };

  const pool = strengthenPoolForClass(state.player.classId);
  const rolled = rollChoices(state.floorState.rngState, pool, state.player.classTraits);

  if (rolled.choices.length === 0) {
    // 词条池已穷尽（罕见极端情形）：仍扣卷轴避免无限重试，无事件
    return {
      state: {
        ...state,
        player: { ...state.player, scrolls: count - 1 },
        floorState: { ...state.floorState, rngState: rolled.nextRngState },
      },
      events: [],
    };
  }

  return {
    state: {
      ...state,
      player: { ...state.player, scrolls: count - 1 },
      floorState: { ...state.floorState, rngState: rolled.nextRngState },
    },
    events: [{ type: 'SCROLL_OFFER', options: rolled.choices }],
  };
}

/**
 * 玩家从 SCROLL_OFFER 候选中选定一项：append 到 classTraits（受 STRENGTHEN_META 上限保护），
 * 立即生效 HP 类词条（同 applyStrengthen 的处理）。emit SCROLL_RESOLVED。
 *
 * 与 applyStrengthen 的关键差异：**不修改 animaThreshold**，因为卷轴是独立资源。
 */
export function claimScrollChoice(state: ExpeditionState, choiceId: string): ApplyResult {
  const meta = STRENGTHEN_META[choiceId];
  const def = STRENGTHEN_DEF_BY_ID[choiceId];
  if (!meta || !def || def.classId !== state.player.classId) return { state, events: [] };
  const count = traitCount(state.player.classTraits, choiceId);
  const cap = meta?.stack ?? 1;
  if ((meta?.oneShot && count >= 1) || count >= cap) {
    return { state, events: [] };
  }

  const beforeDynamicHp = generalDynamicMaxHpBonus(state.player.classTraits);
  let newPlayer: RunPlayer = {
    ...state.player,
    classTraits: [...state.player.classTraits, choiceId],
  };

  // 立即生效的 HP 类词条（与 applyStrengthen 保持一致）
  if (choiceId === 'strengthen_hp_up') {
    const newMaxHp = newPlayer.maxHp + 20;
    const newHp = Math.min(newPlayer.hp + 20, newMaxHp);
    newPlayer = { ...newPlayer, maxHp: newMaxHp, hp: newHp };
  } else if (IMMEDIATE_HP_STACK_TRAITS.has(choiceId)) {
    const hpGain = choiceId === 'iron_skin_stack' ? 15 : 0;
    const newMaxHp = newPlayer.maxHp + hpGain;
    const newHp = Math.min(newPlayer.hp + hpGain, newMaxHp);
    newPlayer = { ...newPlayer, maxHp: newMaxHp, hp: newHp };
  }
  const dynamicHpGain = generalDynamicMaxHpBonus(newPlayer.classTraits) - beforeDynamicHp;
  if (dynamicHpGain > 0) newPlayer = { ...newPlayer, maxHp: newPlayer.maxHp + dynamicHpGain, hp: newPlayer.hp + dynamicHpGain };

  return {
    state: { ...state, player: newPlayer },
    events: [{ type: 'SCROLL_RESOLVED', selected: choiceId }],
  };
}
