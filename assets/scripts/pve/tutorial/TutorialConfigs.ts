import type { FloorState } from '../core/PveTypes';
import type { TutorialScenarioConfig, TutorialStepConfig } from './TutorialTypes';

const FIRST_SCENARIO: TutorialScenarioConfig = {
  id: 'first_expedition_intro',
  floor: 1,
  size: 6,
  player: { x: 0, y: 2 },
};

export const FIRST_TUTORIAL_SCENARIO_ID = FIRST_SCENARIO.id;

export function buildFirstTutorialFloor(seed: number): FloorState {
  const size = FIRST_SCENARIO.size;
  const revealed = Array.from({ length: size }, () => Array.from({ length: size }, () => true));

  return {
    floor: 1,
    size,
    seed,
    rngState: seed,
    player: { ...FIRST_SCENARIO.player },
    ap: 0,
    maxAp: 0,
    dice: 0,
    turn: 0,
    hasKey: false,
    revealed,
    monsters: [
      {
        id: 'tutorial_mon_0',
        type: 'NORMAL',
        pos: { x: 2, y: 2 },
        hp: 8,
        maxHp: 8,
        attack: 3,
        range: 1,
        aggroRadius: 3,
        aiState: 'IDLE',
        variantId: 'GOBLIN_WARRIOR',
        tutorialDrop: { gold: 8, anima: 20 },
      },
    ],
    entities: [
      { id: 'tutorial_rock_0', type: 'ROCK', pos: { x: 0, y: 1 }, consumed: false },
      { id: 'tutorial_rock_1', type: 'ROCK', pos: { x: 0, y: 3 }, consumed: false },
      { id: 'tutorial_rock_2', type: 'ROCK', pos: { x: 1, y: 1 }, consumed: false },
      { id: 'tutorial_rock_3', type: 'ROCK', pos: { x: 1, y: 3 }, consumed: false },
      { id: 'tutorial_rock_4', type: 'ROCK', pos: { x: 2, y: 1 }, consumed: false },
      { id: 'tutorial_rock_5', type: 'ROCK', pos: { x: 2, y: 3 }, consumed: false },
      { id: 'tutorial_rock_6', type: 'ROCK', pos: { x: 3, y: 1 }, consumed: false },
      { id: 'tutorial_rock_7', type: 'ROCK', pos: { x: 3, y: 3 }, consumed: false },
      { id: 'tutorial_rock_8', type: 'ROCK', pos: { x: 4, y: 1 }, consumed: false },
      { id: 'tutorial_rock_9', type: 'ROCK', pos: { x: 4, y: 3 }, consumed: false },
      { id: 'tutorial_key_0', type: 'KEY', pos: { x: 3, y: 2 }, consumed: false },
      { id: 'tutorial_exit_0', type: 'EXIT', pos: { x: 4, y: 2 }, consumed: false },
    ],
    status: 'EXPLORING',
    tutorialScenarioId: FIRST_SCENARIO.id,
    tutorialGuide: {
      currentStepId: 'move',
      completedStepIds: [],
    },
  };
}

export const FIRST_TUTORIAL_STEPS: TutorialStepConfig[] = [
  {
    id: 'move',
    message: '每个回合都有 AP。\n先点前方格子，移动一步。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 1, y: 2 }],
    completeOnPlayerPos: { x: 1, y: 2 },
  },
  {
    id: 'attack',
    message: '靠近敌人后，点击怪物即可攻击。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 2, y: 2 }],
    completeOnEventTypes: ['KILL'],
  },
  {
    id: 'reward',
    message: '前进到敌人原来的位置。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 2, y: 2 }],
    completeOnPlayerPos: { x: 2, y: 2 },
  },
  {
    id: 'key',
    message: '继续前进，拿到钥匙。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 3, y: 2 }],
    completeOnEventTypes: ['PICK_KEY'],
  },
  {
    id: 'exit',
    message: '拿到钥匙后，出口就能离开本层。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 4, y: 2 }],
    completeOnEventTypes: ['FLOOR_CLEARED'],
  },
];
