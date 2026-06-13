// 楼层地图生成（design §3 章节结构、§5 地图系统、§12 楼层通关规则）。
// 纯函数：generateFloor(floor, seed) → FloorState。同 floor+seed 必然产生相同布局（AC-13 确定性）。

import { createRng } from './rng';
import { createFogGrid, revealAround } from './FogSystem';
import { generateChapterMonsters } from './ChapterMonsterRules';
import {
  ADVANCABLE_CLASSES,
  CHAPTER1_BOSS_ROCK_COUNT,
  CHAPTER2_SAND_PIT_COUNT,
  CHAPTER3_ICE_WALL_COUNT,
  CHAPTER3_ICE_WALL_HP,
  CHAPTER_BOSS,
  FLOORS_PER_CHAPTER,
  FOG_REVEAL_RADIUS,
  FRAGMENT_COUNT,
  MONSTER_BASE,
  bossChapterScaling,
  chapterOfFloor,
  isBossFloor,
  mapSizeOfFloor,
} from './PveConstants';
import { GOBLIN_CHIEF_RANGE } from './bosses/GoblinChief';
import type { ClassId } from './PveConstants';
import type { Coord, FixedEntity, FloorState, Monster } from './PveTypes';

/** 章节内层号（1-based，1~5）。 */
function floorInChapter(floor: number): number {
  return ((floor - 1) % FLOORS_PER_CHAPTER) + 1;
}
const CHEST_COUNT = 1;
const IDOL_COUNT = 1;       // 神像：+1 maxHp（每普通层 1 个）
const HOT_SPRING_COUNT = 1; // 温泉：HP 回满（每普通层 1 个）
const ALTAR_COUNT = 1;      // 祭坛：随机 20–35 灵气（每普通层 1 个）

/**
 * 第 floor 层是否放铁匠（每章第 3 层）。
 * 章内序号：((floor-1) % FLOORS_PER_CHAPTER) + 1 → 1~5；第 3 层 = Boss 前两层，给玩家强化窗口。
 */
function isBlacksmithFloor(floor: number): boolean {
  return !isBossFloor(floor) && (floor - 1) % FLOORS_PER_CHAPTER === 2; // 2 = 0-based 第3层
}

/** 关键实体（钥匙/出口门/Boss）之间的最小曼哈顿间距，避免扎堆。 */
function minSpacing(size: number): number {
  return Math.max(2, Math.floor(size / 2));
}

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function allCells(size: number): Coord[] {
  const cells: Coord[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * 从 pool 中取出一个与 from 曼哈顿距离 ≥ minDist 的格子（按 pool 顺序找第一个命中）；
 * 找不到时退化为取距离最远的格子。原地修改 pool（splice 移除）。
 */
function takeFarFrom(pool: Coord[], from: Coord, minDist: number): Coord {
  let idx = pool.findIndex((c) => manhattan(c, from) >= minDist);
  if (idx === -1) {
    let bestIdx = 0;
    let bestDist = -1;
    for (let i = 0; i < pool.length; i++) {
      const d = manhattan(pool[i], from);
      if (d > bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    idx = bestIdx;
  }
  const [picked] = pool.splice(idx, 1);
  return picked;
}

function makeBoss(id: string, pos: Coord, floor: number): Monster {
  const base = MONSTER_BASE.BOSS;
  const chapter = chapterOfFloor(floor) as keyof typeof CHAPTER_BOSS;
  const bossId = CHAPTER_BOSS[chapter];
  const { hpMult, attackMult } = bossChapterScaling(chapter);

  const hp = Math.round(base.hp * hpMult);
  // 哥布林酋长使用独立攻击范围
  const range = bossId === 'GOBLIN_CHIEF' ? GOBLIN_CHIEF_RANGE : base.range;

  return {
    id,
    type: 'BOSS',
    pos,
    hp,
    maxHp: hp,
    attack: Math.round(base.attack * attackMult),
    range,
    aggroRadius: base.aggroRadius,
    aiState: 'IDLE',
    bossId,
  };
}

function makeEntity(id: string, type: FixedEntity['type'], pos: Coord): FixedEntity {
  return { id, type, pos, consumed: false };
}

function makeFragment(id: string, pos: Coord, fragmentClass: ClassId): FixedEntity {
  return { id, type: 'FRAGMENT', pos, consumed: false, fragmentClass };
}

/**
 * 生成第 floor 层（1-based）地图。普通层：钥匙×1 + 出口门×1 + 宝箱 + 普通怪×N；
 * Boss 层：钥匙×1 + Boss×1（无出口门，Boss 死亡后由 FloorRules 在原地生成传送门）。
 */
export function generateFloor(floor: number, seed: number): FloorState {
  const size = mapSizeOfFloor(floor);
  const rng = createRng(seed);
  const pool = rng.shuffle(allCells(size));
  const spacing = minSpacing(size);

  const player = pool.shift();
  if (!player) {
    throw new Error('generateFloor: empty cell pool');
  }

  const revealed = createFogGrid(size);
  revealAround(revealed, player, FOG_REVEAL_RADIUS);

  const entities: FixedEntity[] = [];
  const monsters: Monster[] = [];
  let entitySeq = 0;
  let monsterSeq = 0;
  const nextEntityId = (prefix: string): string => `${prefix}_${floor}_${entitySeq++}`;
  const nextMonsterId = (): string => `mon_${floor}_${monsterSeq++}`;

  const chapter = chapterOfFloor(floor);
  const keyPos = takeFarFrom(pool, player, spacing);
  entities.push(makeEntity(nextEntityId('key'), 'KEY', keyPos));

  if (isBossFloor(floor)) {
    const bossPos = takeFarFrom(pool, keyPos, spacing);
    monsters.push(makeBoss(nextMonsterId(), bossPos, floor));
    // 第一章 Boss 房：随机生成石块地形，玩家可利用石块抵挡 AOE
    if (chapter === 1) {
      for (let i = 0; i < CHAPTER1_BOSS_ROCK_COUNT && pool.length > 0; i++) {
        const pos = pool.shift() as Coord;
        entities.push({ id: nextEntityId('rock'), type: 'ROCK', pos, consumed: false });
      }
    }
    // 第二章 Boss 房：沙坑地形（移动 AP+1；Boss 钻出优先沙坑位）
    if (chapter === 2) {
      for (let i = 0; i < CHAPTER2_SAND_PIT_COUNT && pool.length > 0; i++) {
        const pos = pool.shift() as Coord;
        entities.push({ id: nextEntityId('pit'), type: 'SAND_PIT', pos, consumed: false });
      }
    }
    // 第三章 Boss 房：冰墙（阻挡移动，HP=CHAPTER3_ICE_WALL_HP 可破坏）
    if (chapter === 3) {
      for (let i = 0; i < CHAPTER3_ICE_WALL_COUNT && pool.length > 0; i++) {
        const pos = pool.shift() as Coord;
        entities.push({
          id: nextEntityId('icewall'),
          type: 'ICE_WALL',
          pos,
          consumed: false,
          hp: CHAPTER3_ICE_WALL_HP,
        });
      }
    }
  } else {
    const exitPos = takeFarFrom(pool, keyPos, spacing);
    entities.push(makeEntity(nextEntityId('exit'), 'EXIT', exitPos));

    for (let i = 0; i < CHEST_COUNT && pool.length > 0; i++) {
      const pos = pool.shift() as Coord;
      entities.push(makeEntity(nextEntityId('chest'), 'CHEST', pos));
    }

    // 中立交互实体：神像 + 温泉 + 祭坛（+ 铁匠仅每章第3层）
    for (let i = 0; i < IDOL_COUNT && pool.length > 0; i++) {
      const pos = pool.shift() as Coord;
      entities.push(makeEntity(nextEntityId('idol'), 'IDOL', pos));
    }
    for (let i = 0; i < HOT_SPRING_COUNT && pool.length > 0; i++) {
      const pos = pool.shift() as Coord;
      entities.push(makeEntity(nextEntityId('spring'), 'HOT_SPRING', pos));
    }
    for (let i = 0; i < ALTAR_COUNT && pool.length > 0; i++) {
      const pos = pool.shift() as Coord;
      entities.push(makeEntity(nextEntityId('altar'), 'ALTAR', pos));
    }
    // 铁匠：每章第 3 层（Boss 前两层），给玩家强化装备的窗口期
    if (isBlacksmithFloor(floor) && pool.length > 0) {
      const pos = pool.shift() as Coord;
      entities.push(makeEntity(nextEntityId('smith'), 'BLACKSMITH', pos));
    }

    // 按 (chapter, 章内层号) 查 CHAPTER_MONSTER_RULES 表生成怪物（260613 内容深化 P0）
    generateChapterMonsters(chapter, floorInChapter(floor), pool, nextMonsterId, monsters);

    // M2 AC-15：职业碎片（每层 FRAGMENT_COUNT 个，洗牌后取互不相同的职业 —— 防止单层集中同一职业，V2 节奏调整）
    const fragmentClasses = rng.shuffle(ADVANCABLE_CLASSES);
    for (let i = 0; i < FRAGMENT_COUNT && pool.length > 0; i++) {
      const pos = pool.shift() as Coord;
      entities.push(makeFragment(nextEntityId('frag'), pos, fragmentClasses[i]));
    }
  }

  return {
    floor,
    size,
    seed,
    rngState: rng.state(),
    player,
    ap: 0,
    maxAp: 0,
    dice: 0,
    turn: 0,
    hasKey: false,
    revealed,
    monsters,
    entities,
    status: 'EXPLORING',
  };
}
