// 楼层地图生成（design §3 章节结构、§5 地图系统、§12 楼层通关规则）。
// 纯函数：generateFloor(floor, seed) → FloorState。同 floor+seed 必然产生相同布局（AC-13 确定性）。

import { createRng } from './rng';
import { createFogGrid, revealAround } from './FogSystem';
import { generateChapterMonsters } from './ChapterMonsterRules';
import {
  CHAPTER1_BOSS_ROCK_COUNT,
  CHAPTER2_SAND_PIT_COUNT,
  CHAPTER3_ICE_WALL_COUNT,
  CHAPTER3_ICE_WALL_HP,
  CHAPTER3_NORMAL_ICE_TILE_COUNT,
  CHAPTER_BOSS,
  FLOORS_PER_CHAPTER,
  FOG_REVEAL_RADIUS,
  MONSTER_BASE,
  NORMAL_FLOOR_TERRAIN_COUNT,
  NORMAL_FLOOR_TERRAIN_TYPE,
  ROCK_HP,
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
const HOT_SPRING_COUNT = 1; // 温泉：每章第4层（精英后）和第6层（Boss前）各生成 1 个
const ALTAR_COUNT = 1;      // 祭坛：随机 20–35 灵气（每普通层 1 个）
const CHAPTER3_PRE_BOSS_EXTRA_ICE_WALLS = 2;
const CHAPTER3_PRE_BOSS_EXTRA_ICE_TILES = 2;
const CHAPTER4_PRE_BOSS_LAVA_TILES = 3;
const CHAPTER4_PRE_BOSS_LAVA_DURATION = 4;

/** 铁匠仅在章节营地（Boss 通关后）提供，楼层地图不生成铁匠实体。 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isBlacksmithFloor(_floor: number): boolean {
  return false;
}

function isHotSpringFloor(floor: number): boolean {
  const fi = floorInChapter(floor);
  // V3：每章 2 个温泉：章内第 4 层（精英后恢复）+ 章内第 6 层（Boss 前恢复）
  return fi === 4 || fi === FLOORS_PER_CHAPTER - 1;
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

/**
 * BFS 连通性检查：从 start 出发，blocked 格子视为墙，确认所有 targets 均可达。
 * 仅用于地形生成后的可解性校验（AC-MT-2）。
 */
function bfsAllReachable(size: number, blocked: Set<string>, start: Coord, targets: Coord[]): boolean {
  const needed = new Set<string>();
  for (const t of targets) {
    const k = `${t.x},${t.y}`;
    if (k !== `${start.x},${start.y}`) needed.add(k);
  }
  if (needed.size === 0) return true;

  const visited = new Set<string>();
  const queue: Coord[] = [start];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const neighbors: Coord[] = [
      { x: cur.x, y: cur.y - 1 },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x + 1, y: cur.y },
    ];
    for (const nb of neighbors) {
      if (nb.x < 0 || nb.y < 0 || nb.x >= size || nb.y >= size) continue;
      const k = `${nb.x},${nb.y}`;
      if (visited.has(k) || blocked.has(k)) continue;
      visited.add(k);
      needed.delete(k);
      if (needed.size === 0) return true;
      queue.push(nb);
    }
  }
  return false;
}

/** 各章 Boss 护甲（第一章 Boss 无护甲，第二章起逐步递增）。 */
const BOSS_ARMOR_BY_CHAPTER: Record<number, number> = { 1: 0, 2: 15, 3: 25, 4: 40, 5: 60 };

function makeBoss(id: string, pos: Coord, floor: number): Monster {
  const base = MONSTER_BASE.BOSS;
  const chapter = chapterOfFloor(floor) as keyof typeof CHAPTER_BOSS;
  const bossId = CHAPTER_BOSS[chapter];
  const { hpMult, attackMult } = bossChapterScaling(chapter);

  const hp = Math.round(base.hp * hpMult);
  // 哥布林酋长使用独立攻击范围
  const range = bossId === 'GOBLIN_CHIEF' ? GOBLIN_CHIEF_RANGE : base.range;
  const armor = BOSS_ARMOR_BY_CHAPTER[chapter] ?? 0;

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
    ...(armor > 0 ? { armor } : {}),
  };
}

function makeEntity(id: string, type: FixedEntity['type'], pos: Coord): FixedEntity {
  return { id, type, pos, consumed: false };
}

function isBlockingEntity(entity: FixedEntity): boolean {
  return !entity.consumed && (entity.type === 'ROCK' || entity.type === 'ICE_WALL' || entity.type === 'FREEZE_WALL');
}

function addPreBossPressure(
  chapter: number,
  fi: number,
  size: number,
  player: Coord,
  keyPos: Coord,
  exitPos: Coord,
  pool: Coord[],
  entities: FixedEntity[],
  nextEntityId: (prefix: string) => string,
): void {
  if (fi !== FLOORS_PER_CHAPTER - 1) return;

  if (chapter === 3) {
    const blockedSet = new Set<string>();
    for (const entity of entities) {
      if (!isBlockingEntity(entity)) continue;
      blockedSet.add(`${entity.pos.x},${entity.pos.y}`);
    }
    let wallsPlaced = 0;
    while (wallsPlaced < CHAPTER3_PRE_BOSS_EXTRA_ICE_WALLS && pool.length > 0) {
      const pos = pool.shift() as Coord;
      const key = `${pos.x},${pos.y}`;
      blockedSet.add(key);
      if (!bfsAllReachable(size, blockedSet, player, [keyPos, exitPos])) {
        blockedSet.delete(key);
        continue;
      }
      entities.push({
        id: nextEntityId('preboss_icewall'),
        type: 'ICE_WALL',
        pos,
        consumed: false,
        hp: CHAPTER3_ICE_WALL_HP,
      });
      wallsPlaced += 1;
    }
    for (let i = 0; i < CHAPTER3_PRE_BOSS_EXTRA_ICE_TILES && pool.length > 0; i++) {
      const pos = pool.shift() as Coord;
      entities.push(makeEntity(nextEntityId('preboss_icetile'), 'ICE_TILE', pos));
    }
  }

  if (chapter === 4) {
    for (let i = 0; i < CHAPTER4_PRE_BOSS_LAVA_TILES && pool.length > 0; i++) {
      const pos = pool.shift() as Coord;
      entities.push({
        id: nextEntityId('preboss_lava'),
        type: 'LAVA_TILE',
        pos,
        consumed: false,
        remaining: CHAPTER4_PRE_BOSS_LAVA_DURATION,
      });
    }
  }
}

/**
 * 生成第 floor 层（1-based）地图。普通层：钥匙×1 + 出口门×1 + 宝箱 + 普通怪×N；
 * Boss 层：钥匙×1 + Boss×1（无出口门，Boss 死亡后由 FloorRules 在原地生成传送门）。
 *
 * @param classId 保留给旧调用签名；地图内容不再按职业生成。
 */
export function generateFloor(floor: number, seed: number, classId: ClassId = 'ADVENTURER'): FloorState {
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
    // 第一章 Boss 房：随机生成石块地形，玩家可利用石块抵挡 AOE；HP=ROCK_HP 可被玩家击碎
    if (chapter === 1) {
      for (let i = 0; i < CHAPTER1_BOSS_ROCK_COUNT && pool.length > 0; i++) {
        const pos = pool.shift() as Coord;
        entities.push({ id: nextEntityId('rock'), type: 'ROCK', pos, consumed: false, hp: ROCK_HP });
      }
    }
    // 第二章 Boss 房：8 个永久沙坑（移动 AP+2；Boss 钻出优先玩家相邻的沙坑位）
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
    if (isHotSpringFloor(floor)) {
      for (let i = 0; i < HOT_SPRING_COUNT && pool.length > 0; i++) {
        const pos = pool.shift() as Coord;
        entities.push(makeEntity(nextEntityId('spring'), 'HOT_SPRING', pos));
      }
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

    // 普通层地形生成 pass（Phase 1，AC-MT-1/2/3）：按章调色板 + 章内节拍强度铺设地形。
    // 阻挡型地形（ROCK/ICE_WALL）每放一块都做 BFS 校验，不通则跳过该格，保证可解性。
    const fi = floorInChapter(floor);
    const terrainRange = NORMAL_FLOOR_TERRAIN_COUNT[fi];
    if (terrainRange) {
      const [tMin, tMax] = terrainRange;
      const terrainCount = tMin + Math.floor(rng.next() * (tMax - tMin + 1));
      const primaryType = NORMAL_FLOOR_TERRAIN_TYPE[chapter as keyof typeof NORMAL_FLOOR_TERRAIN_TYPE] ?? 'ROCK';
      const isBlocking = primaryType === 'ROCK' || primaryType === 'ICE_WALL';
      const blockedSet = new Set<string>();

      for (let ti = 0; ti < terrainCount && pool.length > 0; ti++) {
        const tPos = pool.shift() as Coord;
        const tKey = `${tPos.x},${tPos.y}`;

        if (isBlocking) {
          blockedSet.add(tKey);
          if (!bfsAllReachable(size, blockedSet, player, [keyPos, exitPos])) {
            blockedSet.delete(tKey);
            continue;
          }
        }

        if (primaryType === 'ICE_WALL') {
          entities.push({ id: nextEntityId('iwall'), type: 'ICE_WALL', pos: tPos, consumed: false, hp: CHAPTER3_ICE_WALL_HP });
        } else if (primaryType === 'ROCK') {
          entities.push({ id: nextEntityId('terrain'), type: 'ROCK', pos: tPos, consumed: false, hp: ROCK_HP });
        } else {
          entities.push(makeEntity(nextEntityId('terrain'), primaryType, tPos));
        }
      }

      // 第3章：额外铺冰面（非阻挡，踩上引发滑行走位）
      if (chapter === 3) {
        for (let ti = 0; ti < CHAPTER3_NORMAL_ICE_TILE_COUNT && pool.length > 0; ti++) {
          const tPos = pool.shift() as Coord;
          entities.push(makeEntity(nextEntityId('icetile'), 'ICE_TILE', tPos));
        }
      }
    }

    addPreBossPressure(chapter, fi, size, player, keyPos, exitPos, pool, entities, nextEntityId);
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
