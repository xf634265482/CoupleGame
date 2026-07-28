import { applySafeZoneMigration, applySafeZoneOutsideDamage } from '../../assets/scripts/pve/core/chapter4/SafeZoneMigration';
import { applyLavaTideAdvance } from '../../assets/scripts/pve/core/chapter4/LavaTideAdvance';
import { createChapter4ExpeditionState } from '../../assets/scripts/pve/core/chapter4/Chapter4ExpeditionFactory';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';

function profile(floor: number): PveProfile {
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
    activeChallengeId: `c${floor}`,
    updatedAt: 1,
  };
}

function snapshot(floor: number): FloorChallengeSnapshot {
  return {
    challengeId: `c${floor}`,
    userId: 'u1',
    floor,
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

describe('Chapter4SafeZoneTide', () => {
  test('safe zone warns then migrates every two turns; outside damages without failing', () => {
    let state = createChapter4ExpeditionState(snapshot(25), profile(25));
    const startHp = state.player.hp;
    const zone = state.floorState.entities.find((entity) => entity.type === 'SAFE_ZONE');
    expect(zone).toBeTruthy();

    const warn = applySafeZoneMigration(state, 1);
    expect(warn.events.some((event) => event.type === 'SAFE_ZONE_WARN')).toBe(true);
    state = warn.state;

    const moved = applySafeZoneMigration(state, 2);
    expect(moved.events.some((event) => event.type === 'SAFE_ZONE_MOVED')).toBe(true);
    state = moved.state;

    state = {
      ...state,
      floorState: {
        ...state.floorState,
        player: { x: 0, y: 0 },
      },
    };
    const outside = applySafeZoneOutsideDamage(state);
    expect(outside.events.some((event) => event.type === 'PLAYER_DAMAGED')).toBe(true);
    expect(outside.state.player.hp).toBeLessThan(startHp);
    expect(outside.state.status).toBe('ACTIVE');
  });

  test('lava tide advances permanent rows without turn-limit failure', () => {
    let state = createChapter4ExpeditionState(snapshot(27), profile(27));
    expect(state.floorState.lavaTideRowsAdvanced ?? 0).toBe(0);

    const warn = applyLavaTideAdvance(state, 1);
    expect(warn.events.some((event) => event.type === 'LAVA_TIDE_WARN')).toBe(true);
    state = warn.state;

    const advance = applyLavaTideAdvance(state, 2);
    expect(advance.events.some((event) => event.type === 'LAVA_TIDE_ROW_SPAWNED')).toBe(true);
    expect(advance.state.floorState.lavaTideRowsAdvanced).toBe(1);
    const permanent = advance.state.floorState.entities.filter((entity) => (
      entity.type === 'LAVA_TILE' && (entity.remaining ?? 0) >= 999
    ));
    expect(permanent.length).toBe(advance.state.floorState.size);
    expect(advance.state.status).toBe('ACTIVE');
  });
});
