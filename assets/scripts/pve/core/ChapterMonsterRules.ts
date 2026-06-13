// 章节怪物表（260613 内容深化 P0）：把 generateChapter1Monsters 抽成通用框架，
// 让 2-5 章也能查表配怪物数量。变体（goblin warrior/archer 等）仅第 1 章使用，
// 第 2-5 章用通用 NORMAL/ELITE/ANIMA 怪物 + chapterScaling 缩放。
//
// P0 范围：架构重构，2-5 章配比与重构前完全一致（NORMAL=4, ELITE=1, ANIMA=1）。
// P1 后续：填充 2-5 章逐层怪物变体（沙漠/冰原/熔岩/命运回廊）。

import { chapterScaling, MONSTER_BASE } from './PveConstants';
import {
  makeFireGoblin,
  makeFrostGoblin,
  makeGoblinArcher,
  makeGoblinWarrior,
  makeSpiritRat,
} from './Chapter1Monsters';
import type { Coord, Monster, MonsterAiState } from './PveTypes';

/** 单层怪物配比：第 1 章用变体字段，其余章节用 normal/elite/anima 通用字段。 */
export interface MonsterFloorRule {
  /** 通用 NORMAL 怪物数（2-5 章主用）。 */
  normal?: number;
  /** 通用 ELITE 怪物数。 */
  elite?: number;
  /** 通用 ANIMA 怪物数。 */
  anima?: number;
  /** 第 1 章专属：哥布林战士数。 */
  goblinWarrior?: number;
  /** 第 1 章专属：哥布林弓箭手数。 */
  goblinArcher?: number;
  /** 第 1 章专属：赤炎哥布林数。 */
  fireGoblin?: number;
  /** 第 1 章专属：冰霜哥布林数。 */
  frostGoblin?: number;
  /** 第 1 章专属：灵鼠数。 */
  spiritRat?: number;
}

/**
 * 章节×章内层号 → 怪物配比表。
 * - chapter 1 fl 1-4：搬自原 generateChapter1Monsters
 * - chapter 2-5 fl 1-4：P0 阶段统一为 normal=4, elite=1, anima=1（与重构前等价）
 *   ↑ 待 P1 按章节主题（沙漠/冰原/熔岩/命运回廊）填新变体与逐层差异
 */
export const CHAPTER_MONSTER_RULES: Record<number, Record<number, MonsterFloorRule>> = {
  1: {
    1: { goblinWarrior: 3, spiritRat: 1 },
    2: { goblinWarrior: 2, goblinArcher: 2, spiritRat: 1 },
    3: { goblinWarrior: 3, fireGoblin: 1, spiritRat: 1 },
    4: { goblinArcher: 3, frostGoblin: 1, spiritRat: 1 },
  },
  2: {
    1: { normal: 4, elite: 1, anima: 1 },
    2: { normal: 4, elite: 1, anima: 1 },
    3: { normal: 4, elite: 1, anima: 1 },
    4: { normal: 4, elite: 1, anima: 1 },
  },
  3: {
    1: { normal: 4, elite: 1, anima: 1 },
    2: { normal: 4, elite: 1, anima: 1 },
    3: { normal: 4, elite: 1, anima: 1 },
    4: { normal: 4, elite: 1, anima: 1 },
  },
  4: {
    1: { normal: 4, elite: 1, anima: 1 },
    2: { normal: 4, elite: 1, anima: 1 },
    3: { normal: 4, elite: 1, anima: 1 },
    4: { normal: 4, elite: 1, anima: 1 },
  },
  5: {
    1: { normal: 4, elite: 1, anima: 1 },
    2: { normal: 4, elite: 1, anima: 1 },
    3: { normal: 4, elite: 1, anima: 1 },
    4: { normal: 4, elite: 1, anima: 1 },
  },
};

// ── 通用怪物工厂（chapter 2-5 用，缩放后） ───────────────────

function makeGenericMonster(id: string, pos: Coord, chapter: number, type: 'NORMAL' | 'ELITE' | 'ANIMA'): Monster {
  const base = MONSTER_BASE[type];
  const { hpMult, attackMult } = chapterScaling(chapter);
  const hp = Math.round(base.hp * hpMult);
  const aiState: MonsterAiState = 'IDLE';
  return {
    id,
    type,
    pos,
    hp,
    maxHp: hp,
    attack: type === 'ANIMA' ? base.attack : Math.round(base.attack * attackMult),
    range: base.range,
    aggroRadius: base.aggroRadius,
    aiState,
  };
}

/**
 * 按 (chapter, flInChapter) 查 CHAPTER_MONSTER_RULES 表生成本层怪物，原地 push 到 monsters。
 * 找不到对应规则时回退为 normal=4, elite=1, anima=1（旧默认行为）。
 */
export function generateChapterMonsters(
  chapter: number,
  flInChapter: number,
  pool: Coord[],
  nextMonsterId: () => string,
  monsters: Monster[],
): void {
  const rule: MonsterFloorRule =
    CHAPTER_MONSTER_RULES[chapter]?.[flInChapter] ?? { normal: 4, elite: 1, anima: 1 };

  // 第 1 章专属变体（按原 generateChapter1Monsters 顺序：warrior → archer → fire → frost → rat）
  for (let i = 0; i < (rule.goblinWarrior ?? 0) && pool.length > 0; i++) {
    monsters.push(makeGoblinWarrior(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.goblinArcher ?? 0) && pool.length > 0; i++) {
    monsters.push(makeGoblinArcher(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.fireGoblin ?? 0) && pool.length > 0; i++) {
    monsters.push(makeFireGoblin(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.frostGoblin ?? 0) && pool.length > 0; i++) {
    monsters.push(makeFrostGoblin(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.spiritRat ?? 0) && pool.length > 0; i++) {
    monsters.push(makeSpiritRat(nextMonsterId(), pool.shift() as Coord));
  }

  // 通用 NORMAL / ELITE / ANIMA（chapter 2-5 主用；chapter 1 表中不会触发）
  for (let i = 0; i < (rule.normal ?? 0) && pool.length > 0; i++) {
    monsters.push(makeGenericMonster(nextMonsterId(), pool.shift() as Coord, chapter, 'NORMAL'));
  }
  for (let i = 0; i < (rule.elite ?? 0) && pool.length > 0; i++) {
    monsters.push(makeGenericMonster(nextMonsterId(), pool.shift() as Coord, chapter, 'ELITE'));
  }
  for (let i = 0; i < (rule.anima ?? 0) && pool.length > 0; i++) {
    monsters.push(makeGenericMonster(nextMonsterId(), pool.shift() as Coord, chapter, 'ANIMA'));
  }
}
