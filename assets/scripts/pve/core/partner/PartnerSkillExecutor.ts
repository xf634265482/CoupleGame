import { SPIRIT_MAX } from '../FloorChallengeState';
import type { Coord, ExpeditionState, PveEvent } from '../PveTypes';
import { getStageSkillConfig } from './PartnerCatalog';
import {
  PARTNER_FLAG,
  addPartnerFlag,
  breakMarkFlag,
  slowDomainFlag,
} from './PartnerBattleFlags';
import type { PartnerBattleState, PartnerEvolutionStage, PartnerId } from './PartnerTypes';
import { applyTeleport, canTeleportTo, isDangerousLanding, listTeleportCells } from './PartnerTeleport';

// re-export helpers used by tests / UI
export { listTeleportCells, canTeleportTo, isDangerousLanding };

export interface PartnerCombatResources {
  hp: number;
  maxHp: number;
  shield: number;
  spirit: number;
  ap: number;
  maxAp: number;
}

export interface PartnerSkillContext {
  expedition: ExpeditionState;
  partnerBattle: PartnerBattleState;
  phase: 'PLAYER_INPUT' | 'OTHER';
  resources: PartnerCombatResources;
  targetCell?: Coord;
  targetMonsterId?: string;
}

export type PartnerSkillResult =
  | {
    ok: true;
    expedition: ExpeditionState;
    partnerBattle: PartnerBattleState;
    resources: PartnerCombatResources;
    events: PveEvent[];
    needCellTarget?: boolean;
    needEnemyTarget?: boolean;
  }
  | { ok: false; reason: string };

export function createPartnerBattleState(
  partnerId: PartnerId,
  evolutionStage: PartnerEvolutionStage,
): PartnerBattleState {
  return {
    partnerId,
    evolutionStage,
    skillUsed: false,
    flags: [],
    breakTargetId: null,
    slowDomainMonsterIds: [],
  };
}

export function usePartnerSkill(ctx: PartnerSkillContext): PartnerSkillResult {
  if (ctx.phase !== 'PLAYER_INPUT') return { ok: false, reason: 'PARTNER_PHASE_LOCKED' };
  if (ctx.expedition.status === 'DEAD' || ctx.expedition.floorState.status === 'DEAD') {
    return { ok: false, reason: 'PARTNER_PLAYER_DEAD' };
  }
  if (ctx.expedition.status === 'COMPLETED' || ctx.expedition.floorState.status === 'CLEARED') {
    return { ok: false, reason: 'PARTNER_FLOOR_OVER' };
  }
  if (ctx.partnerBattle.skillUsed) return { ok: false, reason: 'PARTNER_SKILL_USED' };

  const { partnerId, evolutionStage } = ctx.partnerBattle;
  switch (partnerId) {
    case 'MOBILITY':
      return useMobility(ctx, evolutionStage);
    case 'GUARD':
      return useGuard(ctx, evolutionStage);
    case 'HEAL':
      return useHeal(ctx, evolutionStage);
    case 'BREAKER':
      return useBreaker(ctx, evolutionStage);
    case 'CONTROL':
      return useControl(ctx, evolutionStage);
    case 'ANIMA':
      return useAnima(ctx, evolutionStage);
    default:
      return { ok: false, reason: 'PARTNER_UNKNOWN' };
  }
}

function markUsed(
  ctx: PartnerSkillContext,
  expedition: ExpeditionState,
  resources: PartnerCombatResources,
  events: PveEvent[],
  flags: string[],
  extra?: Partial<PartnerBattleState>,
): PartnerSkillResult {
  return {
    ok: true,
    expedition,
    resources,
    events: [
      ...events,
      { type: 'PARTNER_SKILL_USED', partnerId: ctx.partnerBattle.partnerId },
    ],
    partnerBattle: {
      ...ctx.partnerBattle,
      ...extra,
      skillUsed: true,
      flags,
    },
  };
}

function useMobility(ctx: PartnerSkillContext, stage: PartnerEvolutionStage): PartnerSkillResult {
  const skill = getStageSkillConfig('MOBILITY', stage);
  const range = skill.range ?? 2;
  if (!ctx.targetCell) {
    return {
      ok: true,
      expedition: ctx.expedition,
      partnerBattle: ctx.partnerBattle,
      resources: ctx.resources,
      events: [],
      needCellTarget: true,
    };
  }
  const from = ctx.expedition.floorState.player;
  if (chebyshevDistance(from, ctx.targetCell) < 1 || chebyshevDistance(from, ctx.targetCell) > range) {
    return { ok: false, reason: 'PARTNER_TELEPORT_OUT_OF_RANGE' };
  }
  const tele = applyTeleport(ctx.expedition, ctx.targetCell);
  if (tele.ok === false) return { ok: false, reason: tele.reason };

  let resources = { ...ctx.resources, hp: tele.state.player.hp };
  let flags = [...ctx.partnerBattle.flags];
  if ((skill.nextMoveCostReduce ?? 0) > 0) {
    flags = addPartnerFlag(flags, PARTNER_FLAG.MOVE_COST_REDUCE_ONCE);
  }
  if ((skill.dangerousLandingShieldRatio ?? 0) > 0
    && isDangerousLanding(tele.state.floorState, ctx.targetCell)) {
    const add = Math.round(resources.maxHp * (skill.dangerousLandingShieldRatio ?? 0));
    resources = {
      ...resources,
      shield: Math.min(resources.maxHp, resources.shield + add),
    };
  }
  return markUsed(ctx, tele.state, resources, tele.events, flags);
}

function useGuard(ctx: PartnerSkillContext, stage: PartnerEvolutionStage): PartnerSkillResult {
  const skill = getStageSkillConfig('GUARD', stage);
  const ratio = skill.shieldMaxHpRatio ?? 0.15;
  const add = Math.round(ctx.resources.maxHp * ratio);
  let resources = {
    ...ctx.resources,
    shield: Math.min(ctx.resources.maxHp, ctx.resources.shield + add),
  };
  let flags = [...ctx.partnerBattle.flags];
  if ((skill.forcedDisplaceReduce ?? 0) > 0) {
    flags = addPartnerFlag(flags, PARTNER_FLAG.GUARD_DISPLACE_REDUCE);
  }
  if ((skill.shieldRetainTempAp ?? 0) > 0) {
    flags = addPartnerFlag(flags, PARTNER_FLAG.GUARD_SHIELD_WATCH);
  }
  return markUsed(ctx, ctx.expedition, resources, [], flags);
}

function useHeal(ctx: PartnerSkillContext, stage: PartnerEvolutionStage): PartnerSkillResult {
  const skill = getStageSkillConfig('HEAL', stage);
  let healRatio = skill.healMaxHpRatio ?? 0.15;
  const hpRatio = ctx.resources.hp / Math.max(1, ctx.resources.maxHp);
  if ((skill.lowHpBonusHealRatio ?? 0) > 0 && hpRatio <= 0.4) {
    healRatio += skill.lowHpBonusHealRatio ?? 0;
  }
  const requested = Math.round(ctx.resources.maxHp * healRatio);
  const missing = Math.max(0, ctx.resources.maxHp - ctx.resources.hp);
  const healed = Math.min(missing, requested);
  const overheal = Math.max(0, requested - healed);
  let shield = ctx.resources.shield;
  if ((skill.overhealToShieldRatio ?? 0) > 0 && overheal > 0) {
    const converted = Math.round(overheal * (skill.overhealToShieldRatio ?? 0));
    const cap = Math.round(ctx.resources.maxHp * (skill.overhealShieldCapRatio ?? 0.1));
    shield = Math.min(ctx.resources.maxHp, shield + Math.min(converted, cap));
  }
  const hp = Math.min(ctx.resources.maxHp, ctx.resources.hp + healed);
  const resources = { ...ctx.resources, hp, shield };
  const expedition = {
    ...ctx.expedition,
    player: { ...ctx.expedition.player, hp },
  };
  return markUsed(ctx, expedition, resources, [], [...ctx.partnerBattle.flags]);
}

function useBreaker(ctx: PartnerSkillContext, stage: PartnerEvolutionStage): PartnerSkillResult {
  if (!ctx.targetMonsterId) {
    return {
      ok: true,
      expedition: ctx.expedition,
      partnerBattle: ctx.partnerBattle,
      resources: ctx.resources,
      events: [],
      needEnemyTarget: true,
    };
  }
  const monster = ctx.expedition.floorState.monsters.find(
    (m) => m.id === ctx.targetMonsterId && m.aiState !== 'DEAD' && m.hp > 0,
  );
  if (!monster) return { ok: false, reason: 'PARTNER_TARGET_INVALID' };
  const flags = addPartnerFlag(ctx.partnerBattle.flags, breakMarkFlag(monster.id));
  return markUsed(ctx, ctx.expedition, ctx.resources, [], flags, { breakTargetId: monster.id });
}

function useControl(ctx: PartnerSkillContext, stage: PartnerEvolutionStage): PartnerSkillResult {
  const skill = getStageSkillConfig('CONTROL', stage);
  const range = skill.range ?? 2;
  const from = ctx.expedition.floorState.player;
  const ids: string[] = [];
  let flags = [...ctx.partnerBattle.flags];
  for (const m of ctx.expedition.floorState.monsters) {
    if (m.aiState === 'DEAD' || m.hp <= 0) continue;
    if (chebyshevDistance(from, m.pos) > range) continue;
    ids.push(m.id);
    flags = addPartnerFlag(flags, slowDomainFlag(m.id));
  }
  if ((skill.description.includes('定势') || stage >= 3) && stage >= 3) {
    flags = addPartnerFlag(flags, PARTNER_FLAG.CONTROL_EXTRA_DISPLACE);
  }
  return markUsed(ctx, ctx.expedition, ctx.resources, [], flags, { slowDomainMonsterIds: ids });
}

function useAnima(ctx: PartnerSkillContext, stage: PartnerEvolutionStage): PartnerSkillResult {
  const skill = getStageSkillConfig('ANIMA', stage);
  const gain = Math.round(SPIRIT_MAX * (skill.spiritGainRatio ?? 0.25));
  const before = ctx.resources.spirit;
  const spirit = Math.min(SPIRIT_MAX, before + gain);
  let flags = [...ctx.partnerBattle.flags];
  if ((skill.burstTempAp ?? 0) > 0) flags = addPartnerFlag(flags, PARTNER_FLAG.ANIMA_ECHO);
  if ((skill.fullBurstShieldRatio ?? 0) > 0 && before < SPIRIT_MAX && spirit >= SPIRIT_MAX) {
    flags = addPartnerFlag(flags, PARTNER_FLAG.ANIMA_FULL_BURST_SHIELD);
  }
  return markUsed(ctx, ctx.expedition, { ...ctx.resources, spirit }, [], flags);
}

/** 供 teleport 模块与本文件共用的距离（避免循环依赖时重复实现）。 */
function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
