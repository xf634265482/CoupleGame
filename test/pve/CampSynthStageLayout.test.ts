import { CAMP_SLOT_SIZE } from '../../assets/scripts/pve/views/CampLayoutConstants';
import {
  CAMP_FURNACE_STAGE_HEIGHT,
  CAMP_STARCHART_STAGE_HEIGHT,
  CAMP_SYNTH_STAGE_WIDTH,
  CAMP_SYNTH_TITLE_BAND,
  furnaceSlotLocals,
  slotFitsInStage,
  starchartSlotLocals,
  synthTitleLocalY,
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

  test('result slots clear the title band on both stages', () => {
    const f = furnaceSlotLocals();
    const s = starchartSlotLocals();
    expect(f.result.y + CAMP_SLOT_SIZE / 2).toBeLessThanOrEqual(
      CAMP_FURNACE_STAGE_HEIGHT / 2 - CAMP_SYNTH_TITLE_BAND + 0.01,
    );
    expect(s.result.y + CAMP_SLOT_SIZE / 2).toBeLessThanOrEqual(
      CAMP_STARCHART_STAGE_HEIGHT / 2 - CAMP_SYNTH_TITLE_BAND + 0.01,
    );
    expect(synthTitleLocalY(CAMP_FURNACE_STAGE_HEIGHT)).toBeGreaterThan(f.result.y + CAMP_SLOT_SIZE / 2);
    expect(synthTitleLocalY(CAMP_STARCHART_STAGE_HEIGHT)).toBeGreaterThan(s.result.y + CAMP_SLOT_SIZE / 2);
  });
});
