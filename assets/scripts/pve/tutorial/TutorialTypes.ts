import type { Coord } from '../core/PveTypes';

export type TutorialStepAction =
  | 'MOVE'
  | 'ATTACK'
  | 'INTERACT'
  | 'TAP_CELL'
  | 'ANY'
  | 'CHARGE'
  | 'SPIRIT_BURST';

export interface TutorialAdvanceContext {
  selectedChargeAp?: number;
  spiritBurstActive?: boolean;
}

export interface TutorialStepConfig {
  id: string;
  message: string;
  allowedAction?: TutorialStepAction;
  allowedCells?: Coord[];
  completeOnPlayerPos?: Coord;
  completeOnEventTypes?: string[];
  completeOnChargeAp?: number;
  completeOnSpiritBurst?: boolean;
  completeOnKillMonsterId?: string;
  completeOnAttackTargetId?: string;
  onEnterFillSpirit?: boolean;
  /** 进入本步时先弹一次说明窗（知道了之后才允许点蓄力/爆发）。 */
  onEnterExplain?: string;
}

export interface TutorialScenarioConfig {
  id: string;
  floor: number;
  size: number;
  player: Coord;
}
