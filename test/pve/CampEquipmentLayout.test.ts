import {
  CAMP_EQUIPMENT_LAYOUT,
  equipmentContentMetrics,
  intersects,
} from '../../assets/scripts/pve/views/CampEquipmentLayout';

describe('camp equipment layout geometry', () => {
  test('equipment synth sits below fixed bag and uses three input slots', () => {
    const m = equipmentContentMetrics();
    expect(CAMP_EQUIPMENT_LAYOUT.synthInputCount).toBe(3);
    expect(CAMP_EQUIPMENT_LAYOUT.bagSize).toBe(96);
    expect(CAMP_EQUIPMENT_LAYOUT.loadoutSlotSize).toBe(96);
    expect(CAMP_EQUIPMENT_LAYOUT.synthSlotSize).toBe(96);
    expect(CAMP_EQUIPMENT_LAYOUT.bagSlots).toBe(25);
    expect(m.summaryY).toBeGreaterThan(m.loadoutTitleY);
    expect(m.bagTitleY).toBeGreaterThan(m.synthTitleY);
    expect(m.bagTitleY - 15).toBeGreaterThan(m.bagFirstRowY + CAMP_EQUIPMENT_LAYOUT.bagSize / 2);
    expect(m.synthResultY).toBeGreaterThan(m.synthInputY);
    expect(m.synthInputY).toBeGreaterThan(m.synthButtonY);
    expect(m.contentHeight).toBeGreaterThanOrEqual(CAMP_EQUIPMENT_LAYOUT.viewportHeight);
    expect(m.contentHeight / 2 - m.summaryY).toBeLessThan(80);
    const buttonBottom = m.synthButtonY - CAMP_EQUIPMENT_LAYOUT.synthButtonHeight / 2;
    expect(m.contentHeight / 2).toBeGreaterThanOrEqual(Math.abs(Math.min(0, buttonBottom)) - 1);
    const slots = CAMP_EQUIPMENT_LAYOUT.synthInputXs.map((x) => ({
      left: x - CAMP_EQUIPMENT_LAYOUT.synthSlotSize / 2,
      right: x + CAMP_EQUIPMENT_LAYOUT.synthSlotSize / 2,
      top: m.synthInputY + CAMP_EQUIPMENT_LAYOUT.synthSlotSize / 2,
      bottom: m.synthInputY - CAMP_EQUIPMENT_LAYOUT.synthSlotSize / 2,
      centerY: m.synthInputY,
    }));
    expect(intersects(slots[0]!, slots[1]!)).toBe(false);
    expect(intersects(slots[1]!, slots[2]!)).toBe(false);
    expect(CAMP_EQUIPMENT_LAYOUT.synthSlotSize).toBe(CAMP_EQUIPMENT_LAYOUT.bagSize);
  });

  test('bag metrics are fixed regardless of call count', () => {
    const empty = equipmentContentMetrics();
    const full = equipmentContentMetrics();
    expect(empty.synthTitleY).toBe(full.synthTitleY);
    expect(empty.contentHeight).toBe(full.contentHeight);
  });
});
