// 永久逐层：击杀掉落当前固定装备，结算时入账永久背包。

import type { EquipItem, EquipQuality, ExpeditionState } from '../PveTypes';
import type { PveEquipmentInstance } from '../PveProgressionTypes';
import type { Rng } from '../rng';
import { rollClassicEquipmentByName, getClassicEquipmentTemplate } from '../EquipmentSystem';
import { getChapter1FloorDefinition } from '../chapter1/Chapter1FloorCatalog';
import { getChapter2FloorDefinition } from '../chapter2/Chapter2FloorCatalog';
import { chapterIdForFloor } from '../chapterRouting';
import { BOSS_RARE_DROP } from '../PveConstants';
import { equipInstanceFromItem, toFixedEquipItem } from './EquipmentProgression';

export { toFixedEquipItem } from './EquipmentProgression';

export const PERSISTENT_NORMAL_EQUIP_DROP_CHANCE = 0.10;
export const PERSISTENT_ELITE_EQUIP_DROP_CHANCE = 0.20;

export const FLOOR_EQUIP_QUALITY_WEIGHTS: Readonly<Record<number, readonly (readonly [EquipQuality, number])[]>> = {
  1: [['COMMON', 100]],
  2: [['COMMON', 70], ['FINE', 30]],
  3: [['COMMON', 40], ['FINE', 60]],
  4: [['FINE', 80], ['RARE', 20]],
  5: [['FINE', 60], ['RARE', 40]],
  6: [['FINE', 30], ['RARE', 70]],
  7: [['RARE', 70], ['EPIC', 30]],
  8: [['FINE', 100]],
  9: [['FINE', 100]],
  10: [['FINE', 70], ['RARE', 30]],
  11: [['FINE', 60], ['RARE', 40]],
  12: [['FINE', 40], ['RARE', 60]],
  13: [['FINE', 20], ['RARE', 80]],
  14: [['RARE', 70], ['EPIC', 30]],
};

export function rollFloorEquipQuality(rng: Rng, floor: number): EquipQuality {
  const table = FLOOR_EQUIP_QUALITY_WEIGHTS[floor] ?? FLOOR_EQUIP_QUALITY_WEIGHTS[1]!;
  const roll = rng.int(0, 99);
  let cursor = 0;
  for (const [quality, weight] of table) {
    cursor += weight;
    if (roll < cursor) return quality;
  }
  return table[table.length - 1]![0];
}

function nextLootInstanceId(state: ExpeditionState, seq: number): string {
  return `loot_${state.runSeed}_${state.floor}_${seq}`;
}

function equipmentPoolFor(state: ExpeditionState): readonly string[] {
  const pool = state.equipmentDropPool ?? [];
  if (pool.length > 0) return pool;
  try {
    return chapterIdForFloor(state.floor) === 1
      ? getChapter1FloorDefinition(state.floor).equipmentIds
      : getChapter2FloorDefinition(state.floor).equipmentIds;
  } catch {
    return [];
  }
}

function pickPoolName(rng: Rng, pool: readonly string[], quality: EquipQuality): string {
  const eligible = pool.filter((name) => getClassicEquipmentTemplate(name)?.quality === quality);
  const candidates = eligible.length > 0 ? eligible : pool;
  return candidates[rng.int(0, candidates.length - 1)]!;
}

function rollClassicLoot(
  rng: Rng,
  state: ExpeditionState,
  pool: readonly string[],
  quality: EquipQuality,
  instanceId: string,
): EquipItem {
  const name = pickPoolName(rng, pool, quality);
  return rollClassicEquipmentByName(rng, name, quality, state.chapter, state.balanceSnapshot, {
    instanceId,
  });
}

export function rollPersistentFixedEquip(
  rng: Rng,
  state: ExpeditionState,
  dropChance: number,
): { equip: EquipItem; nextLootSeq: number; instance: PveEquipmentInstance } | null {
  if (rng.next() >= dropChance) return null;
  const pool = equipmentPoolFor(state);
  if (pool.length === 0) return null;
  const quality = rollFloorEquipQuality(rng, state.floor);
  const nextLootSeq = (state.lootSeq ?? 0) + 1;
  const instanceId = nextLootInstanceId(state, nextLootSeq);
  const equip = rollClassicLoot(rng, state, pool, quality, instanceId);
  const instance = equipInstanceFromItem(equip);
  if (!instance) return null;
  return { equip, nextLootSeq, instance };
}

export function rollPersistentNormalEquip(rng: Rng, state: ExpeditionState) {
  return rollPersistentFixedEquip(rng, state, PERSISTENT_NORMAL_EQUIP_DROP_CHANCE);
}

export function rollPersistentEliteEquip(rng: Rng, state: ExpeditionState) {
  return rollPersistentFixedEquip(rng, state, PERSISTENT_ELITE_EQUIP_DROP_CHANCE);
}

export function rollBossExtraFloorEquip(rng: Rng, state: ExpeditionState) {
  return rollPersistentFixedEquip(rng, state, BOSS_RARE_DROP.EXTRA_FLOOR_EQUIP_CHANCE);
}

export function equipmentPoolForFloor(floor: number): string[] {
  try {
    return [...(chapterIdForFloor(floor) === 1
      ? getChapter1FloorDefinition(floor).equipmentIds
      : getChapter2FloorDefinition(floor).equipmentIds)];
  } catch {
    return [];
  }
}
