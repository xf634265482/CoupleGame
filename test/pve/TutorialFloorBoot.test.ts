import { createPersistentFloorRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import { serializeFloorRuntime } from '../../assets/scripts/pve/core/FloorChallengeLifecycle';
import { PersistentFloorFlow, type PersistentFloorFlowApi } from '../../assets/scripts/pve/core/PersistentFloorFlow';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';
import type { FloorChallengeSnapshot, PveProfile, StartFloorChallengeRequest } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(overrides: Partial<PveProfile> = {}): PveProfile {
  const partnerDefaults = createDefaultPartners();
  return {
    version: 1,
    highestUnlockedFloor: 1,
    highestClearedFloor: 0,
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
    selectedProfessionId: 'ARCHER', // must be forced to WARRIOR in tutorial
    partners: partnerDefaults.partners,
    equippedPartnerId: partnerDefaults.equippedPartnerId,
    tracking: null,
    activeChallengeId: null,
    updatedAt: 1,
    ...overrides,
  };
}

function snapshot(floor: number): FloorChallengeSnapshot {
  return {
    challengeId: `c${floor}`,
    userId: 'u1',
    floor,
    mode: 'PROGRESSION',
    seed: 7,
    status: 'ACTIVE',
    config: {
      professionId: 'ARCHER',
      equipmentLoadout: {},
      minghenLoadout: [],
      trackedMinghenId: null,
    },
    startedAt: 1,
    updatedAt: 1,
  };
}

describe('tutorial injection into persistent floor boot', () => {
  test('floor 1 without tutorialCompleted injects scripted tutorial', () => {
    const runtime = createPersistentFloorRuntime(snapshot(1), profile(), { tutorialCompleted: false });
    expect(runtime.battleState.expedition.isTutorialRun).toBe(true);
    expect(runtime.battleState.expedition.floorState.tutorialScenarioId).toBe('first_expedition_intro');
    expect(runtime.config.professionId).toBe('WARRIOR');
    expect(runtime.battleState.objective.kind).toBe('KEY_EXPLORE');
    expect(runtime.battleState.expedition.floorState.monsters).toHaveLength(2);
  });

  test('floor 1 with no options at all also injects scripted tutorial (default behavior)', () => {
    const runtime = createPersistentFloorRuntime(snapshot(1), profile());
    expect(runtime.battleState.expedition.isTutorialRun).toBe(true);
    expect(runtime.battleState.expedition.floorState.tutorialScenarioId).toBe('first_expedition_intro');
  });

  test('floor 1 with tutorialCompleted uses normal chapter1 map', () => {
    const runtime = createPersistentFloorRuntime(snapshot(1), profile(), { tutorialCompleted: true });
    expect(runtime.battleState.expedition.isTutorialRun).toBeFalsy();
    expect(runtime.battleState.expedition.floorState.tutorialScenarioId).toBeUndefined();
    expect(runtime.config.professionId).toBe('ARCHER');
  });

  test('floor 2 ignores tutorialCompleted and always uses the formal chapter path', () => {
    const runtime = createPersistentFloorRuntime(snapshot(2), profile(), { tutorialCompleted: false });
    expect(runtime.battleState.expedition.isTutorialRun).toBeFalsy();
    expect(runtime.battleState.expedition.floorState.tutorialScenarioId).toBeUndefined();
    expect(runtime.config.professionId).toBe('ARCHER');
  });
});

function mockFlowApi(initialProfile: PveProfile, active: FloorChallengeSnapshot | null = null) {
  const starts: StartFloorChallengeRequest[] = [];
  let currentProfile = initialProfile;
  const api: PersistentFloorFlowApi = {
    loadProfile: async () => ({ profile: currentProfile }),
    loadActive: async () => ({ challenge: active }),
    start: async (request) => {
      starts.push(request);
      return { challenge: snapshot(request.floor), resume: false };
    },
    save: async () => {},
    settle: async () => ({ profile: currentProfile }),
  };
  return { api, starts };
}

describe('PersistentFloorFlow forwards tutorial state into the persistent runtime', () => {
  test('bootstrap forwards tutorialCompleted to createPersistentFloorRuntime', async () => {
    const notCompleted = mockFlowApi(profile());
    const stillInTutorial = await new PersistentFloorFlow(notCompleted.api).bootstrap(undefined, { tutorialCompleted: false });
    expect(stillInTutorial.runtime.battleState.expedition.isTutorialRun).toBe(true);

    const completed = mockFlowApi(profile());
    const pastTutorial = await new PersistentFloorFlow(completed.api).bootstrap(undefined, { tutorialCompleted: true });
    expect(pastTutorial.runtime.battleState.expedition.isTutorialRun).toBeFalsy();
  });

  test('continueNextFloor always passes tutorialCompleted:true and never re-injects the tutorial', async () => {
    const m = mockFlowApi(profile());
    const flow = new PersistentFloorFlow(m.api);
    const bootstrapped = await flow.bootstrap(undefined, { tutorialCompleted: false });
    expect(bootstrapped.runtime.battleState.expedition.isTutorialRun).toBe(true);
    // Force the runtime into CLEAR so continueNextFloor is allowed to run, even though
    // the mock keeps highestUnlockedFloor at 1 (edge case: bounce back onto floor 1).
    flow.updateRuntime({ ...bootstrapped.runtime, status: 'CLEAR' });
    const next = await flow.continueNextFloor();
    expect(next.runtime.battleState.expedition.isTutorialRun).toBeFalsy();
  });

  test('resuming via runtimeSave preserves tutorial state without recreating the runtime', async () => {
    const initial = mockFlowApi(profile());
    const flow = new PersistentFloorFlow(initial.api);
    const state = await flow.bootstrap(undefined, { tutorialCompleted: false });
    expect(state.runtime.battleState.expedition.isTutorialRun).toBe(true);
    const serialized = serializeFloorRuntime(state.runtime);

    const activeWithSave = { ...state.challenge, runtimeSave: serialized };
    const resumedMocks = mockFlowApi(profile({ activeChallengeId: state.challenge.challengeId }), activeWithSave);
    const resumed = await new PersistentFloorFlow(resumedMocks.api).bootstrap();

    expect(resumed.resumed).toBe(true);
    expect(resumedMocks.starts).toHaveLength(0);
    expect(resumed.runtime.battleState.expedition.isTutorialRun).toBe(true);
  });
});
