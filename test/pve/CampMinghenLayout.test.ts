import {
  CAMP_MINGHEN_LAYOUT,
  cardBounds,
  intersects,
  minghenContentMetrics,
} from '../../assets/scripts/pve/views/CampMinghenLayout';

describe('camp Minghen layout geometry', () => {
  test('ten equipped slots use two square rows and stay above bag/synth', () => {
    const cards = Array.from({ length: CAMP_MINGHEN_LAYOUT.equippedSlots }, (_, index) => cardBounds(index));
    const rowCenters = [...new Set(cards.map((card) => card.centerY))];
    const metrics = minghenContentMetrics();

    expect(CAMP_MINGHEN_LAYOUT.equippedSlots).toBe(10);
    expect(CAMP_MINGHEN_LAYOUT.columns).toBe(5);
    expect(CAMP_MINGHEN_LAYOUT.cardWidth).toBe(96);
    expect(CAMP_MINGHEN_LAYOUT.cardHeight).toBe(96);
    expect(CAMP_MINGHEN_LAYOUT.bagSlots).toBe(25);
    expect(rowCenters).toHaveLength(2);

    for (const card of cards) {
      expect(card.bottom).toBeGreaterThan(metrics.filterY);
      expect(card.left).toBeGreaterThanOrEqual(-CAMP_MINGHEN_LAYOUT.viewportWidth / 2);
      expect(card.right).toBeLessThanOrEqual(CAMP_MINGHEN_LAYOUT.viewportWidth / 2);
    }

    expect(metrics.equippedTitleY).toBeGreaterThan(metrics.filterY);
    expect(metrics.filterY).toBeGreaterThan(metrics.bagTitleY);
    expect(metrics.bagTitleY).toBeGreaterThan(metrics.bagFirstRowY);
    // Title must sit fully above the first bag row (no overlap).
    expect(metrics.bagTitleY - 15).toBeGreaterThan(metrics.bagFirstRowY + CAMP_MINGHEN_LAYOUT.bagSize / 2);
    expect(metrics.bagFirstRowY).toBeGreaterThan(metrics.synthStageY);
    expect(metrics.synthStageY).toBeGreaterThan(metrics.synthButtonY);
    expect(metrics.synthResultY).toBeGreaterThan(metrics.synthInputY);
    expect(metrics.synthInputY).toBeGreaterThan(metrics.synthButtonY);
    expect(metrics.contentHeight).toBeGreaterThanOrEqual(CAMP_MINGHEN_LAYOUT.viewportHeight);

    // No large empty band above the first section title.
    expect(metrics.contentHeight / 2 - metrics.equippedTitleY).toBeLessThan(80);

    const leftInput = {
      left: metrics.synthInputLeftX - CAMP_MINGHEN_LAYOUT.synthSlotSize / 2,
      right: metrics.synthInputLeftX + CAMP_MINGHEN_LAYOUT.synthSlotSize / 2,
      top: metrics.synthInputY + CAMP_MINGHEN_LAYOUT.synthSlotSize / 2,
      bottom: metrics.synthInputY - CAMP_MINGHEN_LAYOUT.synthSlotSize / 2,
      centerY: metrics.synthInputY,
    };
    const result = {
      left: -CAMP_MINGHEN_LAYOUT.synthSlotSize / 2,
      right: CAMP_MINGHEN_LAYOUT.synthSlotSize / 2,
      top: metrics.synthResultY + CAMP_MINGHEN_LAYOUT.synthSlotSize / 2,
      bottom: metrics.synthResultY - CAMP_MINGHEN_LAYOUT.synthSlotSize / 2,
      centerY: metrics.synthResultY,
    };
    expect(intersects(leftInput, result)).toBe(false);
  });

  test('bag metrics grow when capacity upgrades', () => {
    const base = minghenContentMetrics(25);
    const upgraded = minghenContentMetrics(35);
    expect(upgraded.bagSlots).toBe(35);
    expect(upgraded.contentHeight).toBeGreaterThan(base.contentHeight);
    expect(base.bagFirstRowY).toBeGreaterThan(base.synthStageY);
    expect(upgraded.bagFirstRowY).toBeGreaterThan(upgraded.synthStageY);
  });
});
