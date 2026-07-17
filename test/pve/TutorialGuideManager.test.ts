import { TutorialGuideManager } from '../../assets/scripts/pve/tutorial/TutorialGuideManager';
import { buildFirstTutorialFloor, FIRST_TUTORIAL_STEPS } from '../../assets/scripts/pve/tutorial/TutorialConfigs';
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
      bag: [], campMaxHpBuys: 0,
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

test('attack step advances on direct player attack only', () => {
  const mgr = new TutorialGuideManager();
  const state = makeState('basic_attack');
  mgr.bind(state);
  const wrongTarget = { type: 'ATTACK' as const, attackerId: 'PLAYER', targetId: 'tutorial_mon_b', damage: 3, targetHp: 5 };
  const collision = { type: 'ATTACK' as const, attackerId: 'PLAYER', targetId: 'tutorial_mon_a', damage: 3, targetHp: 5, cause: 'COLLISION' as const };
  const direct = { type: 'ATTACK' as const, attackerId: 'PLAYER', targetId: 'tutorial_mon_a', damage: 3, targetHp: 5, cause: 'DIRECT' as const };
  expect(mgr.advanceIfNeeded(state, [wrongTarget])).toBe(false);
  expect(mgr.advanceIfNeeded(state, [collision])).toBe(false);
  expect(mgr.advanceIfNeeded(state, [direct])).toBe(true);
  expect(state.floorState.tutorialGuide?.currentStepId).toBe('charge');
});

test('walks the full scripted sequence from move through portal without deadlock', () => {
  const mgr = new TutorialGuideManager();
  const state = makeState('move');
  mgr.bind(state);
  const expectStep = (id: string) => expect(state.floorState.tutorialGuide?.currentStepId).toBe(id);

  expectStep('move');
  state.floorState.player = { x: 1, y: 2 };
  expect(mgr.advanceIfNeeded(state, [])).toBe(true);
  mgr.bind(state);

  expectStep('basic_attack');
  const attackA = {
    type: 'ATTACK' as const, attackerId: 'PLAYER', targetId: 'tutorial_mon_a',
    damage: 3, targetHp: 19, cause: 'DIRECT' as const,
  };
  expect(mgr.advanceIfNeeded(state, [attackA])).toBe(true);
  mgr.bind(state);

  expectStep('charge');
  expect(mgr.advanceIfNeeded(state, [], { selectedChargeAp: 1 })).toBe(true);
  mgr.bind(state);

  expectStep('charge_kill');
  const killA = { type: 'KILL' as const, monsterId: 'tutorial_mon_a', monsterType: 'NORMAL' as const };
  expect(mgr.advanceIfNeeded(state, [killA])).toBe(true);
  mgr.bind(state);

  // Player did not move while attacking mon_a, so an explicit approach step
  // is required to walk adjacent to mon_b before burst teaching resumes.
  expectStep('approach_b');
  state.floorState.player = { x: 2, y: 2 };
  expect(mgr.advanceIfNeeded(state, [])).toBe(true);
  mgr.bind(state);

  expectStep('burst');
  expect(mgr.advanceIfNeeded(state, [], { spiritBurstActive: true })).toBe(true);
  mgr.bind(state);

  expectStep('burst_charge');
  expect(mgr.advanceIfNeeded(state, [], { selectedChargeAp: 1 })).toBe(true);
  mgr.bind(state);

  expectStep('burst_kill');
  const monB = state.floorState.monsters.find((m) => m.id === 'tutorial_mon_b')!;
  const dist = Math.abs(monB.pos.x - state.floorState.player.x) + Math.abs(monB.pos.y - state.floorState.player.y);
  expect(dist).toBeLessThanOrEqual(1); // proves the reachability fix: B is adjacent, not a deadlock
  const killB = { type: 'KILL' as const, monsterId: 'tutorial_mon_b', monsterType: 'NORMAL' as const };
  expect(mgr.advanceIfNeeded(state, [killB])).toBe(true);
  mgr.bind(state);

  expectStep('key');
  state.floorState.player = { x: 5, y: 2 };
  const pickKey = { type: 'PICK_KEY' as const, entityId: 'tutorial_key_0' };
  expect(mgr.advanceIfNeeded(state, [pickKey])).toBe(true);
  mgr.bind(state);

  expectStep('portal');
  const cleared = { type: 'FLOOR_CLEARED' as const, floor: 1 };
  expect(mgr.advanceIfNeeded(state, [cleared])).toBe(true);

  expect(state.floorState.tutorialGuide?.completedStepIds).toEqual(FIRST_TUTORIAL_STEPS.map((s) => s.id));
});
