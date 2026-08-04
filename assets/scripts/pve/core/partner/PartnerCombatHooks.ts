import { getStageSkillConfig } from './PartnerCatalog';
import {
  PARTNER_FLAG,
  breakMarkFlag,
  breakWoundFlag,
  hasPartnerFlag,
  removePartnerFlag,
  addPartnerFlag,
} from './PartnerBattleFlags';
import type { PartnerBattleState } from './PartnerTypes';

export function getPartnerArmorPenetrationBonus(
  partnerBattle: PartnerBattleState | null | undefined,
  targetId: string,
): number {
  if (!partnerBattle) return 0;
  let bonus = 0;
  if (hasPartnerFlag(partnerBattle.flags, breakMarkFlag(targetId))) {
    const skill = getStageSkillConfig('BREAKER', partnerBattle.evolutionStage);
    bonus += skill.armorPenetration ?? 0;
  }
  if (hasPartnerFlag(partnerBattle.flags, breakWoundFlag(targetId))) {
    const skill = getStageSkillConfig('BREAKER', partnerBattle.evolutionStage);
    bonus += skill.woundExtraArmorPen ?? 0;
  }
  return bonus;
}

/** 破甲标记命中后：清标记；进化挂伤口减伤；觉醒挂破绽。 */
export function afterPartnerBreakHit(
  partnerBattle: PartnerBattleState,
  targetId: string,
): PartnerBattleState {
  let flags = removePartnerFlag(partnerBattle.flags, breakMarkFlag(targetId));
  const skill = getStageSkillConfig('BREAKER', partnerBattle.evolutionStage);
  if ((skill.targetNextHitDamageTakenMul ?? 1) < 1) {
    flags = addPartnerFlag(flags, `PARTNER_BREAK_NEXT_HIT:${targetId}`);
  }
  if ((skill.woundExtraArmorPen ?? 0) > 0) {
    flags = addPartnerFlag(flags, breakWoundFlag(targetId));
  }
  return {
    ...partnerBattle,
    flags,
    breakTargetId: partnerBattle.breakTargetId === targetId ? null : partnerBattle.breakTargetId,
  };
}

export function consumePartnerWound(
  partnerBattle: PartnerBattleState,
  targetId: string,
): PartnerBattleState {
  return {
    ...partnerBattle,
    flags: removePartnerFlag(partnerBattle.flags, breakWoundFlag(targetId)),
  };
}

export function partnerMoveCostReduction(partnerBattle: PartnerBattleState | null | undefined): number {
  if (!partnerBattle) return 0;
  return hasPartnerFlag(partnerBattle.flags, PARTNER_FLAG.MOVE_COST_REDUCE_ONCE) ? 1 : 0;
}

export function consumePartnerMoveCostReduce(partnerBattle: PartnerBattleState): PartnerBattleState {
  return {
    ...partnerBattle,
    flags: removePartnerFlag(partnerBattle.flags, PARTNER_FLAG.MOVE_COST_REDUCE_ONCE),
  };
}

/** 玩家回合开始：守护守成（护盾仍在 → +1 AP 一次）。 */
export function applyPartnerTurnStart(
  partnerBattle: PartnerBattleState | null | undefined,
  shield: number,
  ap: number,
  maxAp: number,
): { partnerBattle: PartnerBattleState | null; ap: number; maxAp: number } {
  if (!partnerBattle) return { partnerBattle: null, ap, maxAp };
  if (!hasPartnerFlag(partnerBattle.flags, PARTNER_FLAG.GUARD_SHIELD_WATCH)) {
    return { partnerBattle, ap, maxAp };
  }
  let flags = removePartnerFlag(partnerBattle.flags, PARTNER_FLAG.GUARD_SHIELD_WATCH);
  flags = removePartnerFlag(flags, PARTNER_FLAG.GUARD_DISPLACE_REDUCE);
  let nextAp = ap;
  let nextMax = maxAp;
  if (shield > 0) {
    nextAp = ap + 1;
    nextMax = Math.max(maxAp, nextAp);
  }
  return {
    partnerBattle: { ...partnerBattle, flags },
    ap: nextAp,
    maxAp: nextMax,
  };
}

export function partnerForcedDisplaceReduction(partnerBattle: PartnerBattleState | null | undefined): number {
  if (!partnerBattle) return 0;
  return hasPartnerFlag(partnerBattle.flags, PARTNER_FLAG.GUARD_DISPLACE_REDUCE) ? 1 : 0;
}

export function consumePartnerDisplaceReduce(partnerBattle: PartnerBattleState): PartnerBattleState {
  return {
    ...partnerBattle,
    flags: removePartnerFlag(partnerBattle.flags, PARTNER_FLAG.GUARD_DISPLACE_REDUCE),
  };
}
