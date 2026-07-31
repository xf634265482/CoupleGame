import { CAMP_SLOT_SIZE } from './CampLayoutConstants';

export const CAMP_SYNTH_STAGE_WIDTH = 520;
/** Taller so title band + 1+3 slots + furnace mouth stay inside the frame. */
export const CAMP_FURNACE_STAGE_HEIGHT = 360;
/** Taller so title band + 1+2 slots stay clear of each other. */
export const CAMP_STARCHART_STAGE_HEIGHT = 340;

/** Top inner band reserved for section title (px from stage top edge). */
export const CAMP_SYNTH_TITLE_BAND = 52;
/** Bottom inner padding so slots/mouth stay above the frame stroke. */
export const CAMP_SYNTH_BOTTOM_PAD = 28;

export interface SynthSlotPoint {
  x: number;
  y: number;
}

/** Stage-local coords; origin = stage center; +Y up. */
export function furnaceSlotLocals(): {
  result: SynthSlotPoint;
  inputs: [SynthSlotPoint, SynthSlotPoint, SynthSlotPoint];
} {
  const half = CAMP_FURNACE_STAGE_HEIGHT / 2;
  const slotHalf = CAMP_SLOT_SIZE / 2;
  // Title band above result; mouth/pad below inputs.
  const resultY = half - CAMP_SYNTH_TITLE_BAND - slotHalf;
  const inputY = -half + CAMP_SYNTH_BOTTOM_PAD + slotHalf + 8;
  return {
    result: { x: 0, y: resultY },
    inputs: [
      { x: -130, y: inputY },
      { x: 0, y: inputY },
      { x: 130, y: inputY },
    ],
  };
}

/** Stage-local coords; origin = stage center; +Y up. */
export function starchartSlotLocals(): {
  result: SynthSlotPoint;
  inputs: [SynthSlotPoint, SynthSlotPoint];
} {
  const half = CAMP_STARCHART_STAGE_HEIGHT / 2;
  const slotHalf = CAMP_SLOT_SIZE / 2;
  const resultY = half - CAMP_SYNTH_TITLE_BAND - slotHalf;
  const inputY = -half + CAMP_SYNTH_BOTTOM_PAD + slotHalf + 12;
  return {
    result: { x: 0, y: resultY },
    inputs: [
      { x: -110, y: inputY },
      { x: 110, y: inputY },
    ],
  };
}

export function slotFitsInStage(point: SynthSlotPoint, stageWidth: number, stageHeight: number): boolean {
  const half = CAMP_SLOT_SIZE / 2;
  return (
    Math.abs(point.x) + half <= stageWidth / 2 + 0.01
    && Math.abs(point.y) + half <= stageHeight / 2 + 0.01
  );
}

/** Title center Y in stage-local coords (near top inner edge). */
export function synthTitleLocalY(stageHeight: number): number {
  return stageHeight / 2 - CAMP_SYNTH_TITLE_BAND / 2;
}
