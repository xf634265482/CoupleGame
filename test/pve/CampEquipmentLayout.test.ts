import {
  CAMP_EQUIPMENT_LAYOUT,
  bagRows,
  equipmentContentMetrics,
  intersects,
} from '../../assets/scripts/pve/views/CampEquipmentLayout';

describe('camp equipment layout geometry', () => {
  test('equipment synth sits below bag and uses three input slots', () => {
    const m = equipmentContentMetrics(8);
    expect(CAMP_EQUIPMENT_LAYOUT.synthInputCount).toBe(3);
    expect(m.bagTitleY).toBeGreaterThan(m.synthTitleY);
    expect(m.synthResultY).toBeGreaterThan(m.synthInputY);
    expect(m.synthInputY).toBeGreaterThan(m.synthButtonY);
    expect(m.contentHeight).toBeGreaterThanOrEqual(CAMP_EQUIPMENT_LAYOUT.viewportHeight);
    const buttonBottom = m.synthButtonY - CAMP_EQUIPMENT_LAYOUT.synthButtonHeight / 2;
    expect(m.contentHeight / 2).toBeGreaterThanOrEqual(Math.abs(Math.min(0, buttonBottom)) - 1);
    const slots = CAMP_EQUIPMENT_LAYOUT.synthInputXs.map((x) => ({
      left: x - CAMP_EQUIPMENT_LAYOUT.synthSlotWidth / 2,
      right: x + CAMP_EQUIPMENT_LAYOUT.synthSlotWidth / 2,
      top: m.synthInputY + CAMP_EQUIPMENT_LAYOUT.synthSlotHeight / 2,
      bottom: m.synthInputY - CAMP_EQUIPMENT_LAYOUT.synthSlotHeight / 2,
      centerY: m.synthInputY,
    }));
    expect(intersects(slots[0]!, slots[1]!)).toBe(false);
    expect(intersects(slots[1]!, slots[2]!)).toBe(false);
  });

  test('empty bag does not reserve a blank inventory row', () => {
    expect(bagRows(0)).toBe(0);
    const empty = equipmentContentMetrics(0);
    const withItems = equipmentContentMetrics(3);
    expect(empty.synthTitleY).toBeGreaterThan(withItems.synthTitleY);
    expect(empty.bagTitleY - empty.synthTitleY).toBeLessThan(80);
  });
});
