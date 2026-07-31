import type { PveProfile } from '../core/PveProgressionTypes';
import { normalizeCampMaterials } from '../core/equipment/EquipmentProgression';

export type CampBagFilter = 'MINGHEN' | 'EQUIPMENT' | 'MATERIAL' | 'ALL';

export type CampBagEntry =
  | { kind: 'MINGHEN'; id: string; level: 1 | 2 | 3; bagCopies: number }
  | { kind: 'EQUIPMENT'; instanceId: string }
  | { kind: 'MATERIAL'; materialId: 'QUENCH_SAND' | 'FUSION_CORE'; amount: number };

export function defaultCampBagFilter(section: 'MINGHEN' | 'EQUIPMENT'): CampBagFilter {
  return section === 'MINGHEN' ? 'MINGHEN' : 'EQUIPMENT';
}

function minghenEntries(profile: PveProfile): CampBagEntry[] {
  const equipped = new Set(profile.minghenLoadout.map((entry) => entry.id));
  return Object.values(profile.minghenCollection)
    .map((entry) => {
      const bagCopies = Math.max(0, entry.copies - (equipped.has(entry.id) ? 1 : 0));
      return { entry, bagCopies };
    })
    .filter((row) => row.bagCopies > 0)
    .sort((a, b) => a.entry.id.localeCompare(b.entry.id))
    .map(({ entry, bagCopies }) => ({
      kind: 'MINGHEN' as const,
      id: entry.id,
      level: entry.level,
      bagCopies,
    }));
}

function equipmentEntries(profile: PveProfile): CampBagEntry[] {
  const equippedIds = new Set(
    Object.values(profile.equipmentLoadout).filter((id): id is string => typeof id === 'string'),
  );
  return profile.equipmentInventory
    .filter((item) => !equippedIds.has(item.instanceId))
    .map((item) => ({ kind: 'EQUIPMENT' as const, instanceId: item.instanceId }));
}

function materialEntries(profile: PveProfile): CampBagEntry[] {
  const mats = normalizeCampMaterials(profile.materials);
  const rows: CampBagEntry[] = [];
  if (mats.quenchSand > 0) {
    rows.push({ kind: 'MATERIAL', materialId: 'QUENCH_SAND', amount: mats.quenchSand });
  }
  if (mats.fusionCore > 0) {
    rows.push({ kind: 'MATERIAL', materialId: 'FUSION_CORE', amount: mats.fusionCore });
  }
  return rows;
}

export function buildCampSharedBagEntries(profile: PveProfile, filter: CampBagFilter): CampBagEntry[] {
  if (filter === 'MINGHEN') return minghenEntries(profile);
  if (filter === 'EQUIPMENT') return equipmentEntries(profile);
  if (filter === 'MATERIAL') return materialEntries(profile);
  return [...minghenEntries(profile), ...equipmentEntries(profile), ...materialEntries(profile)];
}
