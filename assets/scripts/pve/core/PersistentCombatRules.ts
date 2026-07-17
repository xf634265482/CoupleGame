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
import { previewMinghenAttack, resolveMinghenAttack } from './minghen/MinghenCombatBridge';

export interface PersistentAttackApplyResult {
  runtime: PersistentExpeditionRuntime;
  result: ApplyResult;
}

function equippedWeaponName(runtime: PersistentExpeditionRuntime): string {
  return runtime.battleState.expedition.player.equipment.WEAPON?.name ?? '徒手';
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
  );
  return { definition, profession: minghen.profession };
}

export function applyPersistentAttack(
  runtime: PersistentExpeditionRuntime,
  targetId: string,
  profile: PveProfile,
  extraChargeAp = 0,
): PersistentAttackApplyResult {
  const weaponName = equippedWeaponName(runtime);
  const definition = getFixedEquipmentDefinition(weaponName);
  const weapon = fixedWeaponAction(weaponName);
  const masteryLevel = profile.professions[runtime.config.professionId].level;
  const chargeAp = effectiveChargeAp(runtime, extraChargeAp);
  const profession = previewProfessionAttack(runtime, weapon, masteryLevel, attackChoice(runtime, chargeAp));
  const minghenPreview = previewMinghenAttack(
    runtime.battleState.expedition,
    runtime.config.minghenLoadout,
    runtime.battleState.minghenMemory,
    profession,
    targetId,
  );
  const preview = { definition, profession: minghenPreview.profession };
  if (!preview.profession.valid) {
    return { runtime, result: { state: runtime.battleState.expedition, events: [] } };
  }
  const result = playerAttack(runtime.battleState.expedition, targetId, preview);
  if (result.events.length === 0) return { runtime, result };
  const minghenResolved = resolveMinghenAttack(
    runtime.battleState.expedition,
    result.state,
    result.events,
    runtime.config.minghenLoadout,
    minghenPreview.memory,
    targetId,
    preview.profession.apCost,
  );
  const committed = commitProfessionAttack(runtime, preview.profession);
  const withMinghen = {
    ...committed,
    resources: {
      ...committed.resources,
      shield: Math.min(committed.resources.maxHp, committed.resources.shield + Math.round(minghenResolved.shieldGain)),
      spirit: Math.min(100, committed.resources.spirit + minghenResolved.spiritGain),
    },
    battleState: {
      ...committed.battleState,
      minghenMemory: minghenResolved.memory,
      expedition: minghenResolved.expedition,
    },
  };
  const synced = syncRuntimeFromExpedition(withMinghen, minghenResolved.expedition);
  const killedRanks = result.events
    .filter((event): event is Extract<(typeof result.events)[number], { type: 'KILL' }> => event.type === 'KILL')
    .map((event) => event.monsterType === 'BOSS' ? 'CLIMAX' as const : event.monsterType === 'ELITE' ? 'ELITE' as const : 'NORMAL' as const);
  const spirited = gainSpiritFromAttack(synced, {
    hit: result.events.some((event) => event.type === 'ATTACK' && event.attackerId === 'PLAYER'),
    finalApCost: preview.profession.apCost,
    killedRanks,
  });
  return {
    runtime: { ...spirited, battleState: { ...spirited.battleState, profession: spirited.profession } },
    result: { ...result, state: minghenResolved.expedition },
  };
}
