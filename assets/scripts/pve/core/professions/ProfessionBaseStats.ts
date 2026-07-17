import type { PveProfessionId } from '../PveProgressionTypes';

/** 永久逐层：三职业空装基础面板（见 profession-base-stats-design.md）。 */
export const PROFESSION_BASE_STATS = {
  WARRIOR: { maxHp: 320, attack: 13, apBase: 7, attackRange: 1 },
  ARCHER: { maxHp: 240, attack: 11, apBase: 8, attackRange: 2 },
  RANGER: { maxHp: 280, attack: 10, apBase: 9, attackRange: 1 },
} as const satisfies Record<
  PveProfessionId,
  { maxHp: number; attack: number; apBase: number; attackRange: number }
>;

export type ProfessionBaseStats = (typeof PROFESSION_BASE_STATS)[PveProfessionId];

/** RunPlayer.classId → 永久逐层职业。 */
export function professionIdFromClassId(classId: string): PveProfessionId {
  if (classId === 'ARCHER') return 'ARCHER';
  if (classId === 'ROGUE') return 'RANGER';
  return 'WARRIOR';
}

export function professionBaseStats(professionId: PveProfessionId): ProfessionBaseStats {
  return PROFESSION_BASE_STATS[professionId];
}
