// 职业碎片系统（design §8 AC-15 M2）：拾取碎片、检测进阶条件、应用职业进阶。
// 纯函数，零框架依赖；与 AnimaSystem 的 ANIMA_STRENGTHEN 流程结构对称：
//   pickFragment → 可能 emit CLASS_CAN_ADVANCE → Controller 弹 UI → applyClassAdvance。

import {
  ADVANCABLE_CLASSES,
  AWAKEN_FORMS,
  AWAKEN_REQUIRED_CHAPTER,
  AWAKEN_SECONDARY_ORDER,
  AWAKEN_SECONDARY_TOTAL,
  CLASS_FRAGMENTS_TO_ADVANCE,
  CLASS_FRAGMENTS_TO_AWAKEN,
  CLASS_STATS,
} from './PveConstants';
import type { AdvancableClass, AwakenForm, ClassId } from './PveConstants';
import type { ApplyResult, ExpeditionState, PveEvent, RunPlayer } from './PveTypes';

/** 返回已达到进阶阈值且与当前职业不同的职业列表（可进阶候选）。 */
function getAdvancableClasses(
  fragments: Partial<Record<ClassId, number>>,
  currentClass: ClassId,
): ClassId[] {
  return (Object.entries(fragments) as [ClassId, number][])
    .filter(([cls, count]) => cls !== currentClass && count >= CLASS_FRAGMENTS_TO_ADVANCE)
    .map(([cls]) => cls);
}

/**
 * 拾取职业碎片（auto-pick，与 pickKey 相同模式）。
 * 玩家位置匹配 + 未消耗 → 标记 consumed、累加 classFragments 计数；
 * 若有任意职业碎片数 ≥ CLASS_FRAGMENTS_TO_ADVANCE 且不是当前职业，则 emit CLASS_CAN_ADVANCE。
 */
export function pickFragment(state: ExpeditionState, entityId: string): ApplyResult {
  const floor = state.floorState;
  const entity = floor.entities.find((e) => e.id === entityId);
  if (!entity || entity.type !== 'FRAGMENT' || entity.consumed) return { state, events: [] };
  if (entity.pos.x !== floor.player.x || entity.pos.y !== floor.player.y) return { state, events: [] };
  if (!entity.fragmentClass) return { state, events: [] };

  const classId = entity.fragmentClass;
  const totalFragments = (state.player.classFragments[classId] ?? 0) + 1;

  const next: ExpeditionState = {
    ...state,
    floorState: {
      ...floor,
      entities: floor.entities.map((e) => (e.id === entityId ? { ...e, consumed: true } : e)),
    },
    player: {
      ...state.player,
      classFragments: { ...state.player.classFragments, [classId]: totalFragments },
    },
  };

  const events: PveEvent[] = [
    { type: 'FRAGMENT_PICKED', entityId, classId, totalFragments },
  ];

  // 碎片数刚好到达阈值时触发进阶选择（不重复触发已持有更多碎片的职业）
  const available = getAdvancableClasses(next.player.classFragments, next.player.classId);
  if (available.length > 0) {
    events.push({ type: 'CLASS_CAN_ADVANCE', available });
  }

  // 满足二阶觉醒条件时触发觉醒确认
  if (getAwakenEligible(next.player)) {
    events.push({ type: 'CLASS_CAN_AWAKEN', classId: next.player.classId });
  }

  return { state: next, events };
}

/**
 * 应用职业进阶（Controller 选择后调用）。
 * - 消耗该职业碎片数 - CLASS_FRAGMENTS_TO_ADVANCE 个（多出的保留）
 * - 改变 classId
 * - 立即应用职业 HP 代价（BERSERKER：-2 HP，不低于 1）
 * - emit CLASS_ADVANCED
 */
export function applyClassAdvance(state: ExpeditionState, classId: ClassId): ApplyResult {
  const currentCount = state.player.classFragments[classId] ?? 0;
  if (currentCount < CLASS_FRAGMENTS_TO_ADVANCE) return { state, events: [] };
  if (classId === state.player.classId) return { state, events: [] }; // 已是该职业

  const stats = CLASS_STATS[classId];
  // BERSERKER 进阶代价：扣当前 HP 一半（下取整），最少扣 30（×10 基准，原 3，防止故意低血量零代价进阶）
  const hpCost = classId === 'BERSERKER'
    ? Math.max(30, Math.floor(state.player.hp / 2))
    : (stats.hpCost ?? 0);
  const newHp = Math.max(1, state.player.hp - hpCost);

  const next: ExpeditionState = {
    ...state,
    player: {
      ...state.player,
      classId,
      hp: newHp,
      classFragments: {
        ...state.player.classFragments,
        [classId]: currentCount - CLASS_FRAGMENTS_TO_ADVANCE,
      },
    },
  };

  return {
    state: next,
    events: [{ type: 'CLASS_ADVANCED', classId, hpCost }],
  };
}

/**
 * 二阶觉醒条件判定（design §七）：
 * - 当前职业为已进阶职业（BERSERKER/ARCHER/ROGUE）且尚未觉醒；
 * - 本职业碎片数 ≥ CLASS_FRAGMENTS_TO_AWAKEN（10）；
 * - 另外两个职业碎片数合计 ≥ AWAKEN_SECONDARY_TOTAL（7，奇数保证两者必有高低）；
 * - 已击败第三章 Boss（player.maxChapterCleared ≥ AWAKEN_REQUIRED_CHAPTER）。
 */
export function getAwakenEligible(player: RunPlayer): boolean {
  if (player.awakenForm) return false;
  const classId = player.classId;
  if (!(ADVANCABLE_CLASSES as readonly string[]).includes(classId)) return false;

  const mainCount = player.classFragments[classId] ?? 0;
  if (mainCount < CLASS_FRAGMENTS_TO_AWAKEN) return false;

  const secondarySum = ADVANCABLE_CLASSES
    .filter((cls) => cls !== classId)
    .reduce((sum, cls) => sum + (player.classFragments[cls] ?? 0), 0);
  if (secondarySum < AWAKEN_SECONDARY_TOTAL) return false;

  if ((player.maxChapterCleared ?? 0) < AWAKEN_REQUIRED_CHAPTER) return false;

  return true;
}

/**
 * 应用二阶觉醒（Controller 确认后调用）：
 * - 校验 getAwakenEligible，否则 no-op；
 * - 根据另外两个职业碎片数对比判定觉醒形态（AWAKEN_SECONDARY_ORDER，数量较多者对应形态一）；
 * - 消耗本职业碎片 CLASS_FRAGMENTS_TO_AWAKEN 个（多出部分保留），不改变 classId；
 * - 写入 awakenForm，并将形态对应的轻量属性词条(A) + 专属觉醒词条(B) 加入 classTraits；
 * - emit CLASS_AWAKENED。
 */
export function applyClassAwaken(state: ExpeditionState): ApplyResult {
  const player = state.player;
  if (!getAwakenEligible(player)) return { state, events: [] };

  const classId = player.classId as AdvancableClass;
  const [classA, classB] = AWAKEN_SECONDARY_ORDER[classId];
  const countA = player.classFragments[classA] ?? 0;
  const countB = player.classFragments[classB] ?? 0;
  const formId = `${classId}_${countA > countB ? 1 : 2}` as AwakenForm;
  const form = AWAKEN_FORMS[formId];

  const next: ExpeditionState = {
    ...state,
    player: {
      ...player,
      awakenForm: form.id,
      classTraits: [...player.classTraits, form.statTrait, form.traitId],
      classFragments: {
        ...player.classFragments,
        [classId]: (player.classFragments[classId] ?? 0) - CLASS_FRAGMENTS_TO_AWAKEN,
      },
    },
  };

  return {
    state: next,
    events: [{ type: 'CLASS_AWAKENED', classId, form: form.id }],
  };
}
