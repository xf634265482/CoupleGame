import {
  bagUpgradeCost,
  normalizeBagCapacity,
  nextBagCapacity,
} from '../../assets/scripts/pve/core/CampBagUpgrade';
import { normalizeCampMaterials } from '../../assets/scripts/pve/core/equipment/EquipmentProgression';

describe('CampBagUpgrade', () => {
  test('normalizeBagCapacity accepts ladder only', () => {
    expect(normalizeBagCapacity(undefined)).toBe(25);
    expect(normalizeBagCapacity(35)).toBe(35);
    expect(normalizeBagCapacity(30)).toBe(25);
  });

  test('upgrade ladder and costs match design', () => {
    expect(nextBagCapacity(25)).toBe(35);
    expect(nextBagCapacity(60)).toBeNull();
    expect(bagUpgradeCost(25)).toEqual({ stardust: 120, voidHide: 3 });
    expect(bagUpgradeCost(35)).toEqual({ stardust: 240, voidHide: 6 });
    expect(bagUpgradeCost(45)).toEqual({ stardust: 400, voidHide: 10 });
    expect(bagUpgradeCost(60)).toBeNull();
  });

  test('normalizeCampMaterials includes voidHide', () => {
    expect(normalizeCampMaterials({ quenchSand: 1 })).toEqual({
      quenchSand: 1,
      fusionCore: 0,
      voidHide: 0,
    });
  });
});
