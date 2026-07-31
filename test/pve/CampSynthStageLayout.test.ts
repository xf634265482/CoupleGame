import { CAMP_SLOT_SIZE } from '../../assets/scripts/pve/views/CampLayoutConstants';
import {
  CAMP_FURNACE_STAGE_HEIGHT,
  CAMP_STARCHART_STAGE_HEIGHT,
  CAMP_SYNTH_STAGE_WIDTH,
  furnaceSlotLocals,
  slotFitsInStage,
  starchartSlotLocals,
} from '../../assets/scripts/pve/views/CampSynthStageLayout';

describe('CampSynthStageLayout', () => {
  test('furnace has 1 result above 3 inputs inside stage bounds', () => {
    const f = furnaceSlotLocals();
    expect(f.result.y).toBeGreaterThan(f.inputs[0]!.y);
    expect(f.inputs).toHaveLength(3);
    for (const p of [f.result, ...f.inputs]) {
      expect(slotFitsInStage(p, CAMP_SYNTH_STAGE_WIDTH, CAMP_FURNACE_STAGE_HEIGHT)).toBe(true);
      expect(Math.abs(p.x) + CAMP_SLOT_SIZE / 2).toBeLessThanOrEqual(CAMP_SYNTH_STAGE_WIDTH / 2);
    }
  });

  test('starchart has 1 result above 2 inputs inside stage bounds', () => {
    const s = starchartSlotLocals();
    expect(s.inputs).toHaveLength(2);
    expect(s.result.y).toBeGreaterThan(s.inputs[0]!.y);
    for (const p of [s.result, ...s.inputs]) {
      expect(slotFitsInStage(p, CAMP_SYNTH_STAGE_WIDTH, CAMP_STARCHART_STAGE_HEIGHT)).toBe(true);
    }
  });
});
