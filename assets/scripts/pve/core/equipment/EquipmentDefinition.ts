import type { EquipSlot, PveEquipmentInstance } from '../PveProgressionTypes';
import type { EquipQuality } from '../PveTypes';
import {
  getClassicEquipmentTemplate,
  IMPLICIT_WEAPON_AXE,
  IMPLICIT_WEAPON_SPEAR,
  IMPLICIT_WEAPON_SWORD,
  IMPLICIT_ARMOR_PLATE,
  IMPLICIT_HELMET_HEAVY,
  IMPLICIT_TRINKET_GOLD,
} from '../EquipmentSystem';
import { findBossSpoilByName } from '../bosses/BossSpoils';

export type WeaponShape = 'SINGLE' | 'SWEEP_3' | 'LINE_PIERCE' | 'PROJECTILE' | 'FAN_3';

/** 战斗/UI 用的装备视图；definitionId 为当前目录中的中文名称。 */
export interface FixedEquipmentDefinition {
  id: string;
  name: string;
  slot: EquipSlot;
  sourceFloor: number;
  boss?: boolean;
  scalable: { power?: number; maxHp?: number; armor?: number };
  fixed: {
    apCost?: number;
    minRange?: number;
    maxRange?: number;
    shape?: WeaponShape;
    straightLine?: boolean;
    damageCoefficient?: number;
    secondaryDamageRatio?: number;
    armorPenetration?: number;
    knockback?: number;
    moveCostReduction?: number;
    fogRadius?: number;
    armorPenalty?: number;
    maxHpPenalty?: number;
    spiritGain?: number;
    healingShieldGain?: number;
    terrainDamageReduction?: number;
    terrainApReduction?: number;
    firstMoveApPenalty?: number;
  };
}

const UNARMED_DEF: FixedEquipmentDefinition = {
  id: '徒手',
  name: '徒手',
  slot: 'WEAPON',
  sourceFloor: 0,
  scalable: { power: 0 },
  fixed: { apCost: 2, minRange: 1, maxRange: 1, shape: 'SINGLE', damageCoefficient: 1 },
};

function weaponShapeFromImplicit(implicit?: string): WeaponShape {
  if (implicit === IMPLICIT_WEAPON_SPEAR) return 'LINE_PIERCE';
  return 'SINGLE';
}

function weaponFixedFromImplicit(implicit?: string): FixedEquipmentDefinition['fixed'] {
  if (implicit === IMPLICIT_WEAPON_SPEAR) {
    return { apCost: 3, minRange: 1, maxRange: 2, shape: 'LINE_PIERCE', straightLine: true, damageCoefficient: 0.95 };
  }
  if (implicit === IMPLICIT_WEAPON_AXE) {
    return { apCost: 4, minRange: 1, maxRange: 1, shape: 'SINGLE', damageCoefficient: 1 };
  }
  if (implicit === IMPLICIT_WEAPON_SWORD) {
    return { apCost: 2, minRange: 1, maxRange: 1, shape: 'SINGLE', damageCoefficient: 1 };
  }
  return { apCost: 3, minRange: 1, maxRange: 1, shape: 'SINGLE', damageCoefficient: 1 };
}

export function classicTemplateToCombatDefinition(
  tpl: NonNullable<ReturnType<typeof getClassicEquipmentTemplate>>,
  sourceFloor = 0,
  boss = false,
): FixedEquipmentDefinition {
  const fixed: FixedEquipmentDefinition['fixed'] =
    tpl.slot === 'WEAPON'
      ? weaponFixedFromImplicit(tpl.implicit)
      : tpl.implicit === IMPLICIT_ARMOR_PLATE
        ? { firstMoveApPenalty: 1 }
        : tpl.implicit === IMPLICIT_HELMET_HEAVY
          ? { fogRadius: 1 }
          : tpl.implicit === IMPLICIT_TRINKET_GOLD
            ? { spiritGain: 0.1 }
            : {};
  return {
    id: tpl.name,
    name: tpl.name,
    slot: tpl.slot,
    sourceFloor,
    scalable: {
      power: tpl.slot === 'WEAPON' ? tpl.baseStatMax : undefined,
      maxHp: tpl.slot === 'HELMET' || tpl.slot === 'SHOES' || tpl.slot === 'TRINKET' ? tpl.baseStatMax : undefined,
      armor: tpl.slot === 'ARMOR' ? tpl.baseStatMax : undefined,
    },
    fixed,
    ...(boss ? { boss: true } : {}),
  };
}

export function getFixedEquipmentDefinition(nameOrId: string): FixedEquipmentDefinition {
  if (nameOrId === '徒手' || nameOrId === 'UNARMED') return UNARMED_DEF;
  const tpl = getClassicEquipmentTemplate(nameOrId);
  if (tpl) return classicTemplateToCombatDefinition(tpl);
  const spoil = findBossSpoilByName(nameOrId);
  if (spoil) {
    return classicTemplateToCombatDefinition({
      name: spoil.name,
      slot: spoil.slot,
      quality: spoil.quality,
      baseStatMin: spoil.baseStat,
      baseStatMax: spoil.baseStatMax ?? spoil.baseStat,
      implicit: spoil.implicit,
    }, 0, true);
  }
  throw new Error('UNKNOWN_EQUIPMENT_DEFINITION');
}

export function validateEquipmentInstance(instance: PveEquipmentInstance): PveEquipmentInstance {
  getFixedEquipmentDefinition(instance.definitionId);
  if (!Number.isInteger(instance.enhanceLevel) || instance.enhanceLevel < 0 || instance.enhanceLevel > 5) {
    throw new Error('INVALID_ENHANCE_LEVEL');
  }
  return { ...instance };
}

export function createFixedEquipmentInstance(
  instanceId: string,
  definitionId: string,
  quality: PveEquipmentInstance['quality'],
  baseStat?: number,
): PveEquipmentInstance {
  return validateEquipmentInstance({
    instanceId,
    definitionId,
    quality,
    enhanceLevel: 0,
    locked: false,
    ...(baseStat != null ? { baseStat } : {}),
  });
}

export function fixedWeaponAction(definitionName: string): {
  apCost: number;
  knockback: number;
  hasSweep: boolean;
  straightProjectile: boolean;
} {
  const d = getFixedEquipmentDefinition(definitionName);
  if (d.slot !== 'WEAPON') throw new Error('EQUIPMENT_NOT_WEAPON');
  return {
    apCost: d.fixed.apCost ?? 3,
    knockback: d.fixed.knockback ?? 0,
    hasSweep: d.fixed.shape === 'SWEEP_3' || d.fixed.shape === 'FAN_3',
    straightProjectile: !!d.fixed.straightLine,
  };
}

export function canonicalQualityForName(name: string): EquipQuality {
  const tpl = getClassicEquipmentTemplate(name);
  if (!tpl) throw new Error('UNKNOWN_CLASSIC_EQUIPMENT');
  return tpl.quality;
}
