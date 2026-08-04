import { masteryProgressForXp } from '../../assets/scripts/pve/core/professions/ProfessionMastery';

describe('profession mastery progress', () => {
  test('calculates the current level interval and remaining experience', () => {
    expect(masteryProgressForXp(150)).toEqual({ level: 2, current: 150, next: 350, remaining: 200, ratio: 0 });
    expect(masteryProgressForXp(250)).toEqual({ level: 2, current: 150, next: 350, remaining: 100, ratio: 0.5 });
  });

  test('marks the final threshold as full progress', () => {
    expect(masteryProgressForXp(3200)).toEqual({ level: 10, current: 3200, next: null, remaining: 0, ratio: 1 });
  });
});
