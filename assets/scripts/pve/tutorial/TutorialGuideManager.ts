import type { Coord, ExpeditionState, PveEvent } from '../core/PveTypes';
import { FIRST_TUTORIAL_SCENARIO_ID, FIRST_TUTORIAL_STEPS } from './TutorialConfigs';
import type { TutorialAdvanceContext, TutorialStepAction, TutorialStepConfig } from './TutorialTypes';

function coordEquals(a: Coord | undefined, b: Coord | undefined): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

function includesCoord(list: Coord[] | undefined, coord: Coord): boolean {
  return !!list?.some((item) => item.x === coord.x && item.y === coord.y);
}

export class TutorialGuideManager {
  private _steps = FIRST_TUTORIAL_STEPS;
  private _currentStep: TutorialStepConfig | null = null;

  bind(state: ExpeditionState): void {
    const scenarioId = state.floorState.tutorialScenarioId;
    if (scenarioId !== FIRST_TUTORIAL_SCENARIO_ID) {
      this._currentStep = null;
      return;
    }
    const guide = state.floorState.tutorialGuide;
    const stepId = guide?.currentStepId ?? this._steps[0]?.id;
    this._currentStep = this._steps.find((step) => step.id === stepId) ?? this._steps[0] ?? null;
  }

  isActive(state: ExpeditionState | null | undefined): boolean {
    return !!state?.floorState.tutorialScenarioId && !!this._currentStep;
  }

  getMessage(): string | null {
    return this._currentStep?.message ?? null;
  }

  getAllowedCells(): Coord[] {
    return this._currentStep?.allowedCells ?? [];
  }

  shouldBlockAction(action: TutorialStepAction): boolean {
    if (!this._currentStep?.allowedAction || this._currentStep.allowedAction === 'ANY') return false;
    return this._currentStep.allowedAction !== action;
  }

  shouldBlockCell(coord: Coord): boolean {
    if (!this._currentStep?.allowedCells?.length) return false;
    return !includesCoord(this._currentStep.allowedCells, coord);
  }

  advanceIfNeeded(state: ExpeditionState, events: PveEvent[], ctx: TutorialAdvanceContext = {}): boolean {
    const guide = state.floorState.tutorialGuide;
    if (!this._currentStep || !guide) return false;

    const step = this._currentStep;
    const matchedByPos = coordEquals(step.completeOnPlayerPos, state.floorState.player);
    const matchedByEvent = step.completeOnEventTypes?.some((type) =>
      events.some((event) => event.type === type),
    ) ?? false;
    const matchedByCharge = step.completeOnChargeAp !== undefined
      && ctx.selectedChargeAp === step.completeOnChargeAp;
    const matchedByBurst = !!step.completeOnSpiritBurst && ctx.spiritBurstActive === true;
    const matchedByKill = !!step.completeOnKillMonsterId
      && events.some((event) => event.type === 'KILL' && event.monsterId === step.completeOnKillMonsterId);
    const matchedByAttack = !!step.completeOnAttackTargetId
      && events.some((event) =>
        event.type === 'ATTACK'
        && event.attackerId === 'PLAYER'
        && event.targetId === step.completeOnAttackTargetId
        && (event.cause === undefined || event.cause === 'DIRECT'),
      );

    if (!matchedByPos && !matchedByEvent && !matchedByCharge && !matchedByBurst && !matchedByKill && !matchedByAttack) {
      return false;
    }

    const currentIndex = this._steps.findIndex((s) => s.id === step.id);
    const completedStepIds = Array.from(new Set([...(guide.completedStepIds ?? []), step.id]));
    const nextStep = currentIndex >= 0 ? this._steps[currentIndex + 1] : null;
    state.floorState.tutorialGuide = {
      ...guide,
      completedStepIds,
      currentStepId: nextStep?.id ?? step.id,
    };
    this._currentStep = nextStep ?? null;
    return true;
  }

  shouldHighlightCharge(): boolean {
    return this._currentStep?.allowedAction === 'CHARGE';
  }

  shouldHighlightSpiritBurst(): boolean {
    return this._currentStep?.allowedAction === 'SPIRIT_BURST';
  }

  currentStep(): TutorialStepConfig | null {
    return this._currentStep;
  }
}
