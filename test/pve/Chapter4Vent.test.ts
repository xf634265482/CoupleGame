import { applyLavaVentPressure } from '../../assets/scripts/pve/core/chapter4/LavaVentPressure';
import { createChapter4ExpeditionState } from '../../assets/scripts/pve/core/chapter4/Chapter4ExpeditionFactory';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';

function profile(): PveProfile {
  const partnerDefaults = createDefaultPartners();
  return {
    version: 1,
    highestUnlockedFloor: 28,
    highestClearedFloor: 21,
    floorRecords: {},
    minghenCollection: {},
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
    partners: partnerDefaults.partners,
    equippedPartnerId: partnerDefaults.equippedPartnerId,
    tracking: null,
    activeChallengeId: 'c23',
    updatedAt: 1,
  };
}

function snapshot(): FloorChallengeSnapshot {
  return {
    challengeId: 'c23',
    userId: 'u1',
    floor: 23,
    mode: 'PROGRESSION',
    seed: 2,
    status: 'ACTIVE',
    config: {
      professionId: 'WARRIOR',
      equipmentLoadout: {},
      minghenLoadout: [],
      trackedMinghenId: null,
    },
    startedAt: 1,
    updatedAt: 1,
  };
}

describe('Chapter4Vent', () => {
  test('warns one turn before eruption and skips sealed vents', () => {
    let state = createChapter4ExpeditionState(snapshot(), profile());
    const warn = applyLavaVentPressure(state, 2);
    expect(warn.events.some((event) => event.type === 'VENT_ERUPTION_WARN')).toBe(true);
    expect(warn.state.floorState.entities.some((entity) => entity.type === 'LAVA_VENT_WARN')).toBe(true);

    state = {
      ...warn.state,
      floorState: {
        ...warn.state.floorState,
        entities: warn.state.floorState.entities.map((entity) => (
          entity.id === 'F23_VENT_1' ? { ...entity, consumed: true } : entity
        )),
      },
    };
    const erupt = applyLavaVentPressure(state, 3);
    expect(erupt.events.some((event) => event.type === 'VENT_ERUPTED' && event.ventId === 'F23_VENT_1')).toBe(false);
    expect(erupt.events.some((event) => event.type === 'VENT_ERUPTED')).toBe(true);
    const eruptedTiles = erupt.state.floorState.entities.filter((entity) => (
      entity.type === 'LAVA_TILE' && String(entity.id).includes('_ERUPT_')
    ));
    expect(eruptedTiles.length).toBeGreaterThanOrEqual(4);
  });
});
