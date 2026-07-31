import { CAMP_SLOT_SIZE } from './CampLayoutConstants';

export const CAMP_SYNTH_STAGE_WIDTH = 520;
export const CAMP_FURNACE_STAGE_HEIGHT = 300;
export const CAMP_STARCHART_STAGE_HEIGHT = 280;

export interface SynthSlotPoint {
  x: number;
  y: number;
}

/** Stage-local coords; origin = stage center; +Y up. */
export function furnaceSlotLocals(): {
  result: SynthSlotPoint;
  inputs: [SynthSlotPoint, SynthSlotPoint, SynthSlotPoint];
} {
  const inputY = -CAMP_FURNACE_STAGE_HEIGHT / 2 + 78;
  const resultY = CAMP_FURNACE_STAGE_HEIGHT / 2 - 78;
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
  const inputY = -CAMP_STARCHART_STAGE_HEIGHT / 2 + 72;
  const resultY = CAMP_STARCHART_STAGE_HEIGHT / 2 - 72;
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
