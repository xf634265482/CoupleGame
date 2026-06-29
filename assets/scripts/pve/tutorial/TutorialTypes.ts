import type { Coord } from '../core/PveTypes';

export type TutorialStepAction = 'MOVE' | 'ATTACK' | 'INTERACT' | 'TAP_CELL' | 'ANY';

export interface TutorialStepConfig {
  id: string;
  message: string;
  allowedAction?: TutorialStepAction;
  allowedCells?: Coord[];
  completeOnPlayerPos?: Coord;
  completeOnEventTypes?: string[];
}

export interface TutorialScenarioConfig {
  id: string;
  floor: number;
  size: number;
  player: Coord;
}
