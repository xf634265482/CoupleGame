import {
  formatMinghenCampDetail,
  formatMinghenChoice,
  formatMinghenDetail,
  formatMinghenFullDetail,
  minghenLevelAfterGrant,
} from '../../assets/scripts/pve/core/minghen/MinghenDisplay';

describe('Minghen player-facing display', () => {
  test('camp detail hides the internal id', () => {
    const text = formatMinghenCampDetail('M06', 2);
    expect(text).toContain('LV.2');
    expect(text).not.toContain('M06');
  });

  test('previews the level obtained by this grant', () => {
    expect(minghenLevelAfterGrant()).toBe(1);
    expect(minghenLevelAfterGrant({ id: 'M01', level: 1, copies: 1, trialCompleted: false })).toBe(2);
    expect(minghenLevelAfterGrant({ id: 'M01', level: 2, copies: 3, trialCompleted: false })).toBe(2);
    expect(minghenLevelAfterGrant({ id: 'M01', level: 2, copies: 3, trialCompleted: true })).toBe(3);
  });

  test('choice contains name, obtained level and exact effect without internal id', () => {
    const text = formatMinghenChoice('M01');
    expect(text).toContain('血行 · I级');
    expect(text).toContain('流血');
    expect(text).not.toContain('M01');
  });

  test('detail uses the equipped level effect without internal id', () => {
    const text = formatMinghenDetail('M24', 3);
    expect(text).toContain('静界 · III级');
    expect(text).toContain('不能移动');
    expect(text).not.toContain('M24');
    expect(formatMinghenFullDetail('M24', 3)).toContain('升格试炼');
  });
});
