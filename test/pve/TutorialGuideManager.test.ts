import { TutorialGuideManager } from '../../assets/scripts/pve/tutorial/TutorialGuideManager';
import { buildFirstTutorialFloor } from '../../assets/scripts/pve/tutorial/TutorialConfigs';
import type { ExpeditionState } from '../../assets/scripts/pve/core/PveTypes';

function makeState(stepId: string): ExpeditionState {
  const floorState = buildFirstTutorialFloor(1);
  floorState.tutorialGuide = { currentStepId: stepId, completedStepIds: [] };
  return {
    runSeed: 1,
    chapter: 1,
    floor: 1,
    status: 'ACTIVE',
    player: {
      hp: 100, maxHp: 100, gold: 0, anima: 0, animaProgress: 0, animaThreshold: 100,
      classId: 'BERSERKER', classTraits: [], equipment: {}, classFragments: {},
      bag: [], relics: [], ownedRelics: [], campMaxHpBuys: 0,
    },
    floorState,
    balanceSnapshot: null,
    persistentFloorMode: true,
    isTutorialRun: true,
  };
}

test('blocks non-charge actions on charge step', () => {
  const mgr = new TutorialGuideManager();
  const state = makeState('charge');
  mgr.bind(state);
  expect(mgr.shouldBlockAction('ATTACK')).toBe(true);
  expect(mgr.shouldBlockAction('CHARGE')).toBe(false);
  expect(mgr.shouldHighlightCharge()).toBe(true);
});

test('advances charge step when selectedChargeAp matches', () => {
  const mgr = new TutorialGuideManager();
  const state = makeState('charge');
  mgr.bind(state);
  expect(mgr.advanceIfNeeded(state, [], { selectedChargeAp: 0 })).toBe(false);
  expect(mgr.advanceIfNeeded(state, [], { selectedChargeAp: 1 })).toBe(true);
  expect(state.floorState.tutorialGuide?.currentStepId).toBe('charge_kill');
});

test('advances burst step when spiritBurstActive', () => {
  const mgr = new TutorialGuideManager();
  const state = makeState('burst');
  mgr.bind(state);
  expect(mgr.advanceIfNeeded(state, [], { spiritBurstActive: false })).toBe(false);
  expect(mgr.advanceIfNeeded(state, [], { spiritBurstActive: true })).toBe(true);
});

test('kill step requires matching monsterId', () => {
  const mgr = new TutorialGuideManager();
  const state = makeState('charge_kill');
  mgr.bind(state);
  expect(mgr.advanceIfNeeded(state, [{ type: 'KILL', monsterId: 'wrong', monsterType: 'NORMAL' }])).toBe(false);
  expect(mgr.advanceIfNeeded(state, [{ type: 'KILL', monsterId: 'tutorial_mon_a', monsterType: 'NORMAL' }])).toBe(true);
});
