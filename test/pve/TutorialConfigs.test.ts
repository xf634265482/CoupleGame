import { buildFirstTutorialFloor, FIRST_TUTORIAL_STEPS } from '../../assets/scripts/pve/tutorial/TutorialConfigs';

test('tutorial floor has two monsters, key, and full reveal', () => {
  const floor = buildFirstTutorialFloor(42);
  expect(floor.tutorialScenarioId).toBe('first_expedition_intro');
  expect(floor.monsters.map((m) => m.id).sort()).toEqual(['tutorial_mon_a', 'tutorial_mon_b']);
  expect(floor.entities.some((e) => e.type === 'KEY')).toBe(true);
  expect(floor.revealed.every((row) => row.every(Boolean))).toBe(true);
  expect(floor.ap).toBeGreaterThanOrEqual(12);
});

test('steps cover charge then burst then key/portal', () => {
  expect(FIRST_TUTORIAL_STEPS.map((s) => s.id)).toEqual([
    'move', 'basic_attack', 'charge', 'charge_kill', 'approach_b',
    'burst', 'burst_charge', 'burst_kill', 'key', 'portal',
  ]);
  expect(FIRST_TUTORIAL_STEPS.find((s) => s.id === 'burst')?.onEnterFillSpirit).toBe(true);
});

test('monster B sits within warrior attack range of the approach_b landing cell', () => {
  const floor = buildFirstTutorialFloor(42);
  const monB = floor.monsters.find((m) => m.id === 'tutorial_mon_b');
  const approachStep = FIRST_TUTORIAL_STEPS.find((s) => s.id === 'approach_b');
  const burstKillStep = FIRST_TUTORIAL_STEPS.find((s) => s.id === 'burst_kill');
  expect(monB).toBeDefined();
  expect(approachStep?.completeOnPlayerPos).toBeDefined();
  const landing = approachStep!.completeOnPlayerPos!;
  const dist = Math.abs(monB!.pos.x - landing.x) + Math.abs(monB!.pos.y - landing.y);
  expect(dist).toBeLessThanOrEqual(1);
  expect(burstKillStep?.allowedCells).toEqual([{ x: monB!.pos.x, y: monB!.pos.y }]);
});
