import { waveSpawnRushSteps, WAVE_SPAWN_RUSH_STEPS } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';

describe('waveSpawnRushSteps', () => {
  test('defaults to WAVE_SPAWN_RUSH_STEPS', () => {
    expect(waveSpawnRushSteps(6, 1)).toBe(WAVE_SPAWN_RUSH_STEPS);
    expect(waveSpawnRushSteps(6, 2)).toBe(4);
    expect(waveSpawnRushSteps(13, 3)).toBe(4);
    expect(waveSpawnRushSteps(26, 4)).toBe(4);
  });

  test('chapter1 floor 6 late waves rush farther', () => {
    expect(waveSpawnRushSteps(6, 3)).toBe(5);
    expect(waveSpawnRushSteps(6, 4)).toBe(5);
    expect(waveSpawnRushSteps(6, 5)).toBe(5);
  });
});
