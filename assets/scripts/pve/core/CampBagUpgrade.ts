/** Shared camp bag capacity ladder and upgrade costs (mirror of cloud PveCamp). */

export const CAMP_BAG_CAPACITY_STEPS = [25, 35, 45, 60] as const;
export type CampBagCapacity = (typeof CAMP_BAG_CAPACITY_STEPS)[number];

const COSTS: Record<25 | 35 | 45, { stardust: number; voidHide: number }> = {
  25: { stardust: 120, voidHide: 3 },
  35: { stardust: 240, voidHide: 6 },
  45: { stardust: 400, voidHide: 10 },
};

export function normalizeBagCapacity(value: unknown): CampBagCapacity {
  if (value === 25 || value === 35 || value === 45 || value === 60) return value;
  return 25;
}

export function nextBagCapacity(current: number): CampBagCapacity | null {
  const cap = normalizeBagCapacity(current);
  const i = CAMP_BAG_CAPACITY_STEPS.indexOf(cap);
  if (i < 0 || i >= CAMP_BAG_CAPACITY_STEPS.length - 1) return null;
  return CAMP_BAG_CAPACITY_STEPS[i + 1]!;
}

export function bagUpgradeCost(from: CampBagCapacity): { stardust: number; voidHide: number } | null {
  if (from === 60) return null;
  return COSTS[from] ?? null;
}
