import type { PveProfessionId } from '../PveProgressionTypes';

export const PROFESSION_MASTERY_XP = [0, 150, 350, 600, 900, 1250, 1650, 2100, 2600, 3200] as const;
export const PROFESSION_TECHNIQUES: Record<PveProfessionId, readonly string[]> = {
  WARRIOR: ['ARMOR_BREAK', 'KNOCKBACK', 'SWEEP'], ARCHER: ['PIERCING', 'WEAK_POINT', 'SUPPRESSING'], RANGER: ['SHADOW_END', 'WHIRLWIND', 'VANISH_STEP'],
};
export function masteryLevelForXp(xp: number): number { let level = 1; for (let i = 1; i < PROFESSION_MASTERY_XP.length; i += 1) if (xp >= PROFESSION_MASTERY_XP[i]) level = i + 1; return level; }
export function unlockedTechniques(profession: PveProfessionId, level: number): string[] { return PROFESSION_TECHNIQUES[profession].filter((_, i) => level >= [3, 5, 7][i]); }
export function floorXp(floor: number, firstProgression: boolean, highestUnlockedFloor: number): number {
  if (firstProgression) return 120 + floor * 10;
  const gap = Math.max(0, highestUnlockedFloor - floor);
  const decay = gap <= 1 ? 1 : gap <= 3 ? 0.5 : gap <= 6 ? 0.2 : 0.05;
  return Math.floor((50 + floor * 5) * decay);
}
export function catchupMultiplier(level: number, highestLevel: number): number { const gap = highestLevel - level; return gap >= 4 ? 2 : gap === 3 ? 1.5 : gap === 2 ? 1.25 : 1; }
