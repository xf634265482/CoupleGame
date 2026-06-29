// PVE 单测公共夹具：组装最小可用的 ExpeditionState/RunPlayer，供各 core 模块测试复用。

import { generateFloor } from '../../assets/scripts/pve/core/MapGenerator';
import {
  INITIAL_ANIMA,
  INITIAL_CLASS,
  INITIAL_GOLD,
  INITIAL_HP,
} from '../../assets/scripts/pve/core/PveConstants';
import type {
  Coord,
  ExpeditionState,
  FixedEntity,
  FixedEntityType,
  FloorState,
  Monster,
  RunPlayer,
} from '../../assets/scripts/pve/core/PveTypes';

export function makeRunPlayer(overrides: Partial<RunPlayer> = {}): RunPlayer {
  return {
    hp: INITIAL_HP,
    maxHp: INITIAL_HP,
    gold: INITIAL_GOLD,
    anima: INITIAL_ANIMA,
    animaProgress: 0,
    classId: INITIAL_CLASS,
    classTraits: [],
    equipment: {},
    classFragments: {},
    ...overrides,
  };
}

export function makeMonster(id: string, pos: Coord, overrides: Partial<Monster> = {}): Monster {
  return {
    id,
    type: 'NORMAL',
    pos,
    hp: 4,
    maxHp: 4,
    attack: 1,
    range: 1,
    aggroRadius: 3,
    aiState: 'IDLE',
    ...overrides,
  };
}

export function makeEntity(
  id: string,
  type: FixedEntityType,
  pos: Coord,
  overrides: Partial<FixedEntity> = {},
): FixedEntity {
  return { id, type, pos, consumed: false, ...overrides };
}

export interface MakeStateOptions {
  floor?: number;
  seed?: number;
  chapter?: number;
  floorOverrides?: Partial<FloorState>;
  playerOverrides?: Partial<RunPlayer>;
}

export function makeExpeditionState(options: MakeStateOptions = {}): ExpeditionState {
  const floorNum = options.floor ?? 1;
  const seed = options.seed ?? 1;
  const generated = generateFloor(floorNum, seed);
  const floorState: FloorState = {
    ...generated,
    ...options.floorOverrides,
    ...(options.floorOverrides?.monsters && !options.floorOverrides.revealed
      ? { revealed: generated.revealed.map((row) => row.map(() => true)) }
      : {}),
  };
  return {
    runSeed: seed,
    chapter: options.chapter ?? 1,
    floor: floorNum,
    status: 'ACTIVE',
    player: makeRunPlayer(options.playerOverrides),
    floorState,
  };
}
