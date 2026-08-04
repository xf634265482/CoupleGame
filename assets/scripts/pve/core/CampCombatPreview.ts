import { playerArmorPower, playerAttackPower } from './CombatSystem';
import { equipmentMaxHpBonus, toFixedEquipItem } from './equipment/EquipmentProgression';
import type { ClassId } from './PveConstants';
import type { PveProfessionId, PveProfile } from './PveProgressionTypes';
import type { Equipment, RunPlayer } from './PveTypes';
import { professionBaseStats } from './professions/ProfessionBaseStats';

export interface CampCombatStatsPreview {
  attack: number;
  maxHp: number;
  armor: number;
  range: number;
}

export function classIdFromProfessionId(professionId: PveProfessionId): ClassId {
  if (professionId === 'ARCHER') return 'ARCHER';
  if (professionId === 'RANGER') return 'ROGUE';
  return 'BERSERKER';
}

export function loadoutToRunEquipment(profile: PveProfile): Equipment {
  const equipment: Equipment = {};
  for (const slot of ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'] as const) {
    const instanceId = profile.equipmentLoadout[slot];
    if (!instanceId) continue;
    const instance = profile.equipmentInventory.find((item) => item.instanceId === instanceId);
    if (!instance) continue;
    equipment[slot] = toFixedEquipItem(instance);
  }
  return equipment;
}

export function previewCampCombatStats(
  profile: PveProfile,
  professionId: PveProfessionId,
): CampCombatStatsPreview {
  const equipment = loadoutToRunEquipment(profile);
  const base = professionBaseStats(professionId);
  const maxHp = base.maxHp + equipmentMaxHpBonus(equipment);
  const player: RunPlayer = {
    hp: maxHp,
    maxHp,
    gold: 0,
    anima: 0,
    animaProgress: 0,
    animaThreshold: 100,
    classId: classIdFromProfessionId(professionId),
    equipment,
    bag: [],
    campMaxHpBuys: 0,
  };
  // 钉死：不传 chapter/balance；与当前 CombatSystem 面板公式一致（二者未参与计算）。
  const { damage, range } = playerAttackPower(player);
  const { armor } = playerArmorPower(player);
  return { attack: damage, maxHp, armor, range };
}
