import {
  isCellRevealed,
  moveGhostRestoreMode,
  shouldHideOccupantForMoveGhost,
} from '../../assets/scripts/pve/core/MoveGhostVisibility';

describe('MoveGhostVisibility', () => {
  test('revealed destinations are hidden during ghost playback and activated on restore', () => {
    expect(shouldHideOccupantForMoveGhost(true)).toBe(true);
    expect(moveGhostRestoreMode(true)).toBe('activate');
  });

  test('fog destinations must not keep suppression (warrior heavy knockback into fog)', () => {
    expect(shouldHideOccupantForMoveGhost(false)).toBe(false);
    expect(moveGhostRestoreMode(false)).toBe('clear_suppression_only');
  });

  test('isCellRevealed treats missing rows/cols as fog', () => {
    const revealed = [[true, false], [false]];
    expect(isCellRevealed(revealed, { x: 0, y: 0 })).toBe(true);
    expect(isCellRevealed(revealed, { x: 1, y: 0 })).toBe(false);
    expect(isCellRevealed(revealed, { x: 1, y: 1 })).toBe(false);
    expect(isCellRevealed(revealed, { x: 0, y: 2 })).toBe(false);
  });
});
