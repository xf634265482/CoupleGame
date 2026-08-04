import { playerAttack } from './CombatSystem';
import { getFixedEquipmentDefinition, fixedWeaponAction } from './equipment/EquipmentDefinition';
import {
  commitProfessionAttack,
  previewProfessionAttack,
  type ProfessionAttackChoice,
} from './professions/ProfessionActionSystem';
import { syncRuntimeFromExpedition, type PersistentExpeditionRuntime } from './PersistentExpeditionRuntime';
import type { ApplyResult } from './PveTypes';
import type { PveProfile } from './PveProgressionTypes';
import { gainSpiritFromAttack } from './SpiritBurstSystem';
import { resolveTrinketStageEffectsFromItem } from './EquipmentSystem';
import { effectiveTrinketSpiritPercent } from './equipment/EquipmentProgression';
import {
  previewMinghenAttack,
  resolveMinghenAttack,
} from './minghen/MinghenCombatBridge';
import {
  afterPartnerBreakHit,
  getPartnerArmorPenetrationBonus,
} from './partner/PartnerCombatHooks';
import { hasPartnerFlag, breakMarkFlag } from './partner/PartnerBattleFlags';

export interface PersistentAttackApplyResult {
  runtime: PersistentExpeditionRuntime;
  result: ApplyResult;
  /** 攻击被拒绝时的可读原因（events 为空时有值）。 */
  rejectReason?: string;
}

function equippedWeaponName(runtime: PersistentExpeditionRuntime): string {
  return runtime.battleState.expedition.player.equipment.WEAPON?.name ?? '徒手';
}

/** 以战场 floor.ap 为准对齐职业 AP 账本，避免 HUD 满 AP 但 preview 用旧 resources.ap 拒绝攻击。 */
function alignRuntimeAp(runtime: PersistentExpeditionRuntime): PersistentExpeditionRuntime {
  const floorAp = runtime.battleState.expedition.floorState.ap;
  const floorMax = runtime.battleState.expedition.floorState.maxAp;
  if (runtime.resources.ap === floorAp && runtime.resources.maxAp === floorMax) return runtime;
  return {
    ...runtime,
    resources: {
      ...runtime.resources,
      ap: floorAp,
      maxAp: floorMax,
    },
  };
}

function attackRejectMessage(reason?: string, apCost?: number, availableAp?: number): string {
  if (reason === 'AP_NOT_ENOUGH') {
    if (apCost != null && availableAp != null) {
      return `行动力不足（需要 ${apCost}，剩余 ${availableAp}）`;
    }
    return '行动力不足';
  }
  if (reason === 'INVALID_CHARGE' || reason === 'CHARGE_NOT_ENOUGH') return '当前蓄力档位不可用';
  if (reason === 'TECHNIQUE_LOCKED') return '技法未解锁';
  if (reason === 'PROFESSION_CHOICE_MISMATCH') return '职业状态异常，请重进本层';
  if (reason === 'OUT_OF_RANGE') return '目标不在攻击范围内';
  if (reason === 'NOT_REVEALED') return '目标仍在迷雾中';
  if (reason === 'BURROWED') return '目标潜地中，无法攻击';
  return '目标不在攻击范围内或行动力不足';
}

function attackChoice(runtime: PersistentExpeditionRuntime, extraChargeAp: number): ProfessionAttackChoice {
  if (runtime.config.professionId === 'WARRIOR') {
    return { professionId: 'WARRIOR', extraChargeAp };
  }
  if (runtime.config.professionId === 'ARCHER') {
    return { professionId: 'ARCHER' };
  }
  return { professionId: 'RANGER' };
}

function effectiveChargeAp(runtime: PersistentExpeditionRuntime, selected: number): number {
  if (runtime.config.professionId !== 'WARRIOR') return 0;
  if (runtime.profession.spiritBurstActive && selected <= 0) return 1;
  return selected;
}

export function previewPersistentAttack(
  runtime: PersistentExpeditionRuntime,
  profile: PveProfile,
  extraChargeAp = 0,
) {
  runtime = alignRuntimeAp(runtime);
  const weaponName = equippedWeaponName(runtime);
  const definition = getFixedEquipmentDefinition(weaponName);
  const weapon = fixedWeaponAction(weaponName);
  const masteryLevel = profile.professions[runtime.config.professionId].level;
  const chargeAp = effectiveChargeAp(runtime, extraChargeAp);
  const profession = previewProfessionAttack(
    runtime,
    weapon,
    masteryLevel,
    attackChoice(runtime, chargeAp),
  );
  const minghen = previewMinghenAttack(
    runtime.battleState.expedition,
    runtime.config.minghenLoadout,
    runtime.battleState.minghenMemory,
    profession,
    undefined,
    { shield: runtime.resources.shield },
  );
  let resolved = minghen.profession;
  if (resolved.valid && resolved.apCost > runtime.resources.ap) {
    resolved = { ...resolved, valid: false, reason: 'AP_NOT_ENOUGH' };
  }
  return { definition, profession: resolved };
}

export function applyPersistentAttack(
  runtime: PersistentExpeditionRuntime,
  targetId: string,
  profile: PveProfile,
  extraChargeAp = 0,
): PersistentAttackApplyResult {
  runtime = alignRuntimeAp(runtime);
  const expedition = runtime.battleState.expedition;
  const weaponName = equippedWeaponName(runtime);
  const definition = getFixedEquipmentDefinition(weaponName);
  const weapon = fixedWeaponAction(weaponName);
  const masteryLevel = profile.professions[runtime.config.professionId].level;
  const chargeAp = effectiveChargeAp(runtime, extraChargeAp);
  const profession = previewProfessionAttack(runtime, weapon, masteryLevel, attackChoice(runtime, chargeAp));
  const minghenPreview = previewMinghenAttack(
    expedition,
    runtime.config.minghenLoadout,
    runtime.battleState.minghenMemory,
    profession,
    targetId,
    { shield: runtime.resources.shield },
  );
  const partnerPen = getPartnerArmorPenetrationBonus(runtime.battleState.partnerBattle, targetId);
  let attackProfession = minghenPreview.profession;
  if (partnerPen > 0 && attackProfession.valid) {
    attackProfession = {
      ...attackProfession,
      armorPenetration: Math.min(1, attackProfession.armorPenetration + partnerPen),
    };
  }
  if (attackProfession.valid && attackProfession.apCost > runtime.resources.ap) {
    attackProfession = { ...attackProfession, valid: false, reason: 'AP_NOT_ENOUGH' };
  }
  const preview = { definition, profession: attackProfession };
  if (!preview.profession.valid) {
    return {
      runtime,
      result: { state: expedition, events: [] },
      rejectReason: attackRejectMessage(
        preview.profession.reason,
        preview.profession.apCost || (weapon.apCost + chargeAp),
        runtime.resources.ap,
      ),
    };
  }
  const result = playerAttack(expedition, targetId, preview);
  if (result.events.length === 0) {
    const floor = expedition.floorState;
    const monster = floor.monsters.find((entry) => entry.id === targetId);
    let reason = 'OUT_OF_RANGE';
    if (!monster || monster.aiState === 'DEAD') reason = 'OUT_OF_RANGE';
    else if (monster.isBurrowed) reason = 'BURROWED';
    else if (!floor.revealed[monster.pos.y]?.[monster.pos.x]) reason = 'NOT_REVEALED';
    else if (floor.ap < preview.profession.apCost) reason = 'AP_NOT_ENOUGH';
    return {
      runtime,
      result,
      rejectReason: attackRejectMessage(reason, preview.profession.apCost, floor.ap),
    };
  }
  const minghenResolved = resolveMinghenAttack(
    expedition,
    result.state,
    result.events,
    runtime.config.minghenLoadout,
    minghenPreview.memory,
    targetId,
    preview.profession.apCost,
    { shield: runtime.resources.shield },
  );
  const committed = commitProfessionAttack(runtime, preview.profession);
  const shieldGain = Math.round(minghenResolved.shieldGain);
  const resourcesWithShield = {
    ...committed.resources,
    shield: Math.min(committed.resources.maxHp, committed.resources.shield + shieldGain),
    spirit: Math.min(100, committed.resources.spirit + minghenResolved.spiritGain),
  };
  let partnerBattle = runtime.battleState.partnerBattle ?? null;
  const hitPlayerAttack = result.events.some(
    (event) => event.type === 'ATTACK' && event.attackerId === 'PLAYER' && event.targetId === targetId,
  );
  if (partnerBattle && hitPlayerAttack && hasPartnerFlag(partnerBattle.flags, breakMarkFlag(targetId))) {
    partnerBattle = afterPartnerBreakHit(partnerBattle, targetId);
  }
  const withMinghen: PersistentExpeditionRuntime = {
    ...committed,
    resources: resourcesWithShield,
    battleState: {
      ...committed.battleState,
      minghenMemory: minghenResolved.memory,
      expedition: minghenResolved.expedition,
      partnerBattle,
    },
  };
  const synced = syncRuntimeFromExpedition(withMinghen, minghenResolved.expedition);
  const killedRanks = result.events
    .filter((event): event is Extract<(typeof result.events)[number], { type: 'KILL' }> => event.type === 'KILL')
    .map((event) => event.monsterType === 'BOSS' ? 'CLIMAX' as const : event.monsterType === 'ELITE' ? 'ELITE' as const : 'NORMAL' as const);
  const trinket = synced.battleState.expedition.player.equipment.TRINKET;
  const spiritMult = 1 + effectiveTrinketSpiritPercent(trinket) / 100;
  const trinketFx = resolveTrinketStageEffectsFromItem(trinket);
  let spirited = gainSpiritFromAttack(synced, {
    hit: result.events.some((event) => event.type === 'ATTACK' && event.attackerId === 'PLAYER'),
    finalApCost: preview.profession.apCost,
    killedRanks,
  }, spiritMult);
  if (trinketFx.killSpiritFlat > 0 && killedRanks.length > 0) {
    const flat = trinketFx.killSpiritFlat * killedRanks.length;
    spirited = {
      ...spirited,
      resources: {
        ...spirited.resources,
        spirit: Math.min(100, spirited.resources.spirit + flat),
      },
    };
  }
  return {
    runtime: { ...spirited, battleState: { ...spirited.battleState, profession: spirited.profession } },
    result: { ...result, state: minghenResolved.expedition },
  };
}

