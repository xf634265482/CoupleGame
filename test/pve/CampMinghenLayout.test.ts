import {
  CAMP_MINGHEN_LAYOUT,
  cardBounds,
  intersects,
  rectBounds,
} from '../../assets/scripts/pve/views/CampMinghenLayout';

describe('camp Minghen layout geometry', () => {
  test('eight equipped slots use two rows without covering owned inventory controls', () => {
    const cards = Array.from({ length: 8 }, (_, index) => cardBounds(index));
    const rowCenters = [...new Set(cards.map((card) => card.centerY))];
    const ownedTitle = rectBounds(CAMP_MINGHEN_LAYOUT.ownedTitle);
    const inventory = rectBounds(CAMP_MINGHEN_LAYOUT.inventory);
    const saveButton = rectBounds(CAMP_MINGHEN_LAYOUT.saveButton);

    expect(rowCenters).toHaveLength(2);
    for (const card of cards) {
      expect(intersects(card, ownedTitle)).toBe(false);
      expect(intersects(card, inventory)).toBe(false);
      expect(card.left).toBeGreaterThanOrEqual(-CAMP_MINGHEN_LAYOUT.bodyWidth / 2);
      expect(card.right).toBeLessThanOrEqual(CAMP_MINGHEN_LAYOUT.bodyWidth / 2);
      expect(card.bottom).toBeGreaterThanOrEqual(-CAMP_MINGHEN_LAYOUT.bodyHeight / 2);
      expect(card.top).toBeLessThanOrEqual(CAMP_MINGHEN_LAYOUT.bodyHeight / 2);
    }
    expect(intersects(ownedTitle, inventory)).toBe(false);
    expect(intersects(inventory, saveButton)).toBe(false);
    expect(saveButton.bottom).toBeGreaterThanOrEqual(-CAMP_MINGHEN_LAYOUT.bodyHeight / 2);
  });
});
