import {
  CAMP_EQUIPMENT_LAYOUT,
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
});
