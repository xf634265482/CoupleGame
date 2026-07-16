import type { FloorState } from '../core/PveTypes';
import type { TutorialScenarioConfig, TutorialStepConfig } from './TutorialTypes';

const FIRST_SCENARIO: TutorialScenarioConfig = {
  id: 'first_expedition_intro',
  floor: 1,
  size: 6,
  player: { x: 0, y: 2 },
};

export const FIRST_TUTORIAL_SCENARIO_ID = FIRST_SCENARIO.id;

function buildCorridorRocks(size: number): FloorState['entities'] {
  const rocks: FloorState['entities'] = [];
  for (let x = 0; x < size; x += 1) {
    rocks.push({ id: `tutorial_rock_${x}_1`, type: 'ROCK', pos: { x, y: 1 }, consumed: false });
    rocks.push({ id: `tutorial_rock_${x}_3`, type: 'ROCK', pos: { x, y: 3 }, consumed: false });
  }
  return rocks;
}

export function buildFirstTutorialFloor(seed: number): FloorState {
  const size = FIRST_SCENARIO.size;
  const revealed = Array.from({ length: size }, () => Array.from({ length: size }, () => true));

  return {
    floor: 1,
    size,
    seed,
    rngState: seed,
    player: { ...FIRST_SCENARIO.player },
    ap: 14,
    maxAp: 14,
    dice: 6,
    turn: 1,
    hasKey: false,
    revealed,
    monsters: [
      {
        id: 'tutorial_mon_a',
        type: 'NORMAL',
        pos: { x: 2, y: 2 },
        hp: 22,
        maxHp: 22,
        attack: 0,
        range: 1,
        aggroRadius: 0,
        aiState: 'IDLE',
        variantId: 'GOBLIN_WARRIOR',
        tutorialDrop: { gold: 0, anima: 0 },
      },
      {
        id: 'tutorial_mon_b',
        type: 'NORMAL',
        pos: { x: 3, y: 2 },
        hp: 18,
        maxHp: 18,
        attack: 0,
        range: 1,
        aggroRadius: 0,
        aiState: 'IDLE',
        variantId: 'GOBLIN_WARRIOR',
        tutorialDrop: { gold: 8, anima: 0 },
      },
    ],
    entities: [
      ...buildCorridorRocks(size),
      { id: 'tutorial_key_0', type: 'KEY', pos: { x: 5, y: 2 }, consumed: false },
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
    id: 'basic_attack',
    message: '靠近后点击怪物，先普攻一次。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 2, y: 2 }],
    completeOnAttackTargetId: 'tutorial_mon_a',
  },
  {
    id: 'charge',
    message: '点「蓄力」投入 1 点 AP。\n蓄力会让下一次攻击更强。',
    allowedAction: 'CHARGE',
    completeOnChargeAp: 1,
  },
  {
    id: 'charge_kill',
    message: '再用蓄力攻击击杀这只怪物。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 2, y: 2 }],
    completeOnKillMonsterId: 'tutorial_mon_a',
  },
  {
    id: 'approach_b',
    message: '怪物已清除，靠近下一只怪物。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 2, y: 2 }],
    completeOnPlayerPos: { x: 2, y: 2 },
  },
  {
    id: 'burst',
    message: '灵气已满！点「灵气爆发」开启破阵。',
    allowedAction: 'SPIRIT_BURST',
    onEnterFillSpirit: true,
    completeOnSpiritBurst: true,
  },
  {
    id: 'burst_charge',
    message: '破阵强化下一次蓄力攻击。\n再点一次「蓄力」。',
    allowedAction: 'CHARGE',
    completeOnChargeAp: 1,
  },
  {
    id: 'burst_kill',
    message: '用破阵蓄力击杀第二只怪物。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 3, y: 2 }],
    completeOnKillMonsterId: 'tutorial_mon_b',
  },
  {
    id: 'key',
    message: '继续前进，拿起钥匙。\n传送门会出现在钥匙位置。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 5, y: 2 }],
    completeOnEventTypes: ['PICK_KEY', 'PORTAL_SPAWNED'],
  },
  {
    id: 'portal',
    message: '传送门已出现。\n点「互动」通关。',
    allowedAction: 'ANY',
    allowedCells: [{ x: 5, y: 2 }],
    completeOnEventTypes: ['FLOOR_CLEARED'],
  },
];
