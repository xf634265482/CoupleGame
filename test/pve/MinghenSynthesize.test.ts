import {
  canSynthesizeMinghenToII,
  synthesizeMinghenToII,
} from '../../assets/scripts/pve/core/minghen/MinghenLoadout';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';
import type { PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function stubProfile(partial: Partial<PveProfile> & { minghenCollection: PveProfile['minghenCollection'] }): PveProfile {
  const defaults = createDefaultPartners();
  return {
    version: 1,
    highestUnlockedFloor: 1,
    highestClearedFloor: 0,
    highestClearedAt: null,
    floorRecords: {},
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    gold: 0,
    minghenDust: 0,
    professions: {
      WARRIOR: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      ARCHER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      RANGER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
    },
    selectedProfessionId: 'WARRIOR',
    tracking: null,
    activeChallengeId: null,
    partners: defaults.partners,
    equippedPartnerId: defaults.equippedPartnerId,
    stamina: 60,
    staminaUpdatedAt: 1,
    staminaNextRecoveryAt: null,
    tutorialFreeChallengeConsumed: false,
    updatedAt: 1,
    ...partial,
  };
}

describe('Minghen synthesize I→II', () => {
  test('synthesize I→II when copies>=2 and unequipped', () => {
    const before = stubProfile({
      minghenCollection: { M01: { id: 'M01', level: 1, copies: 2, trialCompleted: false } },
    });
    expect(canSynthesizeMinghenToII(before, 'M01')).toBe(true);
    const after = synthesizeMinghenToII(before, 'M01');
    expect(after.minghenCollection.M01).toMatchObject({ level: 2, copies: 2 });
  });

  test('rejects equipped, insufficient copies, already II', () => {
    const equipped = stubProfile({
      minghenCollection: { M01: { id: 'M01', level: 1, copies: 2, trialCompleted: false } },
      minghenLoadout: [{ id: 'M01', level: 1 }],
    });
    expect(canSynthesizeMinghenToII(equipped, 'M01')).toBe(false);
    expect(() => synthesizeMinghenToII(equipped, 'M01')).toThrow('已装配');

    const short = stubProfile({
      minghenCollection: { M01: { id: 'M01', level: 1, copies: 1, trialCompleted: false } },
    });
    expect(() => synthesizeMinghenToII(short, 'M01')).toThrow('副本不足');

    const already = stubProfile({
      minghenCollection: { M01: { id: 'M01', level: 2, copies: 2, trialCompleted: false } },
    });
    expect(() => synthesizeMinghenToII(already, 'M01')).toThrow('已是II');
  });
});
