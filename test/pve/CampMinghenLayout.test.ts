import {
  CAMP_MINGHEN_LAYOUT,
  cardBounds,
  intersects,
  minghenContentMetrics,
  ownedRows,
} from '../../assets/scripts/pve/views/CampMinghenLayout';

describe('camp Minghen layout geometry', () => {
  test('ten equipped slots use two rows and stay above owned/synth sections', () => {
    const cards = Array.from({ length: CAMP_MINGHEN_LAYOUT.equippedSlots }, (_, index) => cardBounds(index));
    const rowCenters = [...new Set(cards.map((card) => card.centerY))];
    const metrics = minghenContentMetrics(6);

    expect(CAMP_MINGHEN_LAYOUT.equippedSlots).toBe(10);
    expect(CAMP_MINGHEN_LAYOUT.columns).toBe(5);
    expect(rowCenters).toHaveLength(2);
    expect(CAMP_MINGHEN_LAYOUT.cardWidth).toBeGreaterThanOrEqual(104);
    expect(CAMP_MINGHEN_LAYOUT.cardHeight).toBeGreaterThanOrEqual(64);

    for (const card of cards) {
      expect(card.bottom).toBeGreaterThan(metrics.ownedTitleY);
      expect(card.left).toBeGreaterThanOrEqual(-CAMP_MINGHEN_LAYOUT.viewportWidth / 2);
      expect(card.right).toBeLessThanOrEqual(CAMP_MINGHEN_LAYOUT.viewportWidth / 2);
    }

    expect(metrics.ownedTitleY).toBeGreaterThan(metrics.synthTitleY);
    expect(metrics.synthResultY).toBeGreaterThan(metrics.synthInputY);
    expect(metrics.synthInputY).toBeGreaterThan(metrics.synthButtonY);
    expect(metrics.contentHeight).toBeGreaterThanOrEqual(CAMP_MINGHEN_LAYOUT.viewportHeight);

    const leftInput = {
      left: -CAMP_MINGHEN_LAYOUT.synthInputX - CAMP_MINGHEN_LAYOUT.synthSlotWidth / 2,
      right: -CAMP_MINGHEN_LAYOUT.synthInputX + CAMP_MINGHEN_LAYOUT.synthSlotWidth / 2,
      top: metrics.synthInputY + CAMP_MINGHEN_LAYOUT.synthSlotHeight / 2,
      bottom: metrics.synthInputY - CAMP_MINGHEN_LAYOUT.synthSlotHeight / 2,
      centerY: metrics.synthInputY,
    };
    const result = {
      left: -CAMP_MINGHEN_LAYOUT.synthSlotWidth / 2,
      right: CAMP_MINGHEN_LAYOUT.synthSlotWidth / 2,
      top: metrics.synthResultY + CAMP_MINGHEN_LAYOUT.synthSlotHeight / 2,
      bottom: metrics.synthResultY - CAMP_MINGHEN_LAYOUT.synthSlotHeight / 2,
      centerY: metrics.synthResultY,
    };
    expect(intersects(leftInput, result)).toBe(false);
  });

  test('empty owned list does not reserve a blank inventory row', () => {
    expect(ownedRows(0)).toBe(0);
    const empty = minghenContentMetrics(0);
    const withItems = minghenContentMetrics(4);
    expect(empty.synthTitleY).toBeGreaterThan(withItems.synthTitleY);
    expect(empty.ownedTitleY - empty.synthTitleY).toBeLessThan(80);
  });
});
