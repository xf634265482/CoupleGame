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
  makeGoblinSentinel,
  makeGoblinWarrior,
  makeSpiritRat,
} from './Chapter1Monsters';
import {
  makeSpiritBeetle,
  makeSpiritElf,
  makeSpiritEmber,
  makeSpiritMirage,
} from './ChapterAnimaMonsters';
import { makeDesertRaider, makeDesertHopperLizard, makeDuneSentinel, makePoisonScorpion } from './Chapter2Monsters';
import { makeSnowWolf, makeFrostspikePorcupine, makeFrostSprite, makeGlacierShaper } from './Chapter3Monsters';
import { makeAshHound, makeLavaCrab, makeFireElemental } from './Chapter4Monsters';
import { makeShadowAssassin, makeFateWatcher, makeFateWheelBeast } from './Chapter5Monsters';
import type { Coord, Monster, MonsterAiState } from './PveTypes';

/** 单层怪物配比：各章填具体变体字段，通用 normal/elite/anima 仅作备用回退。 */
export interface MonsterFloorRule {
  /** 备用通用 NORMAL/ELITE/ANIMA 怪物数（已无章节使用，保留作回退）。 */
  normal?: number;
  elite?: number;
  anima?: number;
  // ── 第 1 章 ──
  goblinWarrior?: number;
  goblinArcher?: number;
  goblinSentinel?: number;
  fireGoblin?: number;
  frostGoblin?: number;
  spiritRat?: number;
  // ── 第 2 章 ──
  desertRaider?: number;
  desertHopperLizard?: number;
  duneSentinel?: number;
  poisonScorpion?: number;
  spiritBeetle?: number;
  // ── 第 3 章 ──
  snowWolf?: number;
  frostspikePorcupine?: number;
  frostSprite?: number;
  glacierShaper?: number;
  spiritElf?: number;
  // ── 第 4 章 ──
  ashHound?: number;
  lavaCrab?: number;
  fireElemental?: number;
  spiritEmber?: number;
  // ── 第 5 章 ──
  shadowAssassin?: number;
  fateWatcher?: number;
  fateWheelBeast?: number;
  spiritMirage?: number;
}

/**
 * 章节×章内层号 → 怪物配比表。
 * - chapter 1 fl 1-4：搬自原 generateChapter1Monsters
 * - chapter 2-5 fl 1-4：P0 阶段统一为 normal=4, elite=1, anima=1（与重构前等价）
 *   ↑ 待 P1 按章节主题（沙漠/冰原/熔岩/命运回廊）填新变体与逐层差异
 */
/**
 * 章节×章内层号 → 怪物配比表。V3（260628）：每章扩到章内 1-6（Boss 在章内 7）。
 * - 章内 1-2：探索铺垫，新怪登场，密度低
 * - 章内 3：精英关卡（精英怪 ≥ 2），章中记忆点
 * - 章内 4-6：机关地形主场，本章 gimmick 全开
 */
export const CHAPTER_MONSTER_RULES: Record<number, Record<number, MonsterFloorRule>> = {
  1: {
    1: { goblinWarrior: 3, spiritRat: 1 },
    2: { goblinWarrior: 2, goblinArcher: 2, spiritRat: 1 },
    3: { goblinWarrior: 2, fireGoblin: 2, spiritRat: 1 },            // 精英关卡：2× fireGoblin(ELITE)
    4: { goblinArcher: 2, goblinSentinel: 1, frostGoblin: 1, spiritRat: 1 },
    5: { goblinWarrior: 1, goblinSentinel: 1, fireGoblin: 1, frostGoblin: 1, spiritRat: 1 }, // 火/冰机关全开
    6: { goblinWarrior: 1, goblinArcher: 2, goblinSentinel: 1, fireGoblin: 1, frostGoblin: 1, spiritRat: 1 },
  },
  // P1 完整变体（260616 落地）+ V3 扩层（260628）
  2: {
    1: { desertRaider: 3, spiritBeetle: 1 },
    2: { desertRaider: 2, desertHopperLizard: 1, duneSentinel: 1, spiritBeetle: 1 },
    3: { desertRaider: 1, duneSentinel: 1, poisonScorpion: 2, spiritBeetle: 1 },      // 精英关卡 + 危险单位教学
    4: { desertRaider: 1, desertHopperLizard: 2, duneSentinel: 1, poisonScorpion: 1, spiritBeetle: 1 },
    5: { desertHopperLizard: 2, duneSentinel: 1, poisonScorpion: 2, spiritBeetle: 1 }, // 沙坑/毒机关全开
    6: { desertRaider: 1, desertHopperLizard: 2, duneSentinel: 1, poisonScorpion: 2, spiritBeetle: 1 },
  },
  3: {
    1: { snowWolf: 2, spiritElf: 1 },
    2: { snowWolf: 2, frostspikePorcupine: 2, spiritElf: 1 },
    3: { snowWolf: 2, frostSprite: 1, glacierShaper: 1, spiritElf: 1 },                // 精英关卡：远程压制 + 封路教学
    4: { snowWolf: 2, frostspikePorcupine: 2, glacierShaper: 1, spiritElf: 1 },
    5: { frostspikePorcupine: 2, frostSprite: 1, glacierShaper: 1, spiritElf: 1 },     // 冰面机关全开
    6: { snowWolf: 2, frostspikePorcupine: 2, frostSprite: 1, glacierShaper: 1, spiritElf: 1 },
  },
  4: {
    1: { ashHound: 3, spiritEmber: 1 },
    2: { ashHound: 2, lavaCrab: 2, spiritEmber: 1 },
    3: { ashHound: 1, fireElemental: 2, spiritEmber: 1 },            // 精英关卡：先学“点燃区域”
    4: { ashHound: 2, lavaCrab: 1, fireElemental: 1, spiritEmber: 1 },
    5: { ashHound: 1, lavaCrab: 1, fireElemental: 2, spiritEmber: 1 }, // 熔岩机关全开
    6: { ashHound: 2, lavaCrab: 1, fireElemental: 2, spiritEmber: 1 },
  },
  5: {
    1: { fateWatcher: 2, spiritMirage: 1 },
    2: { shadowAssassin: 1, fateWatcher: 3, spiritMirage: 1 },
    3: { shadowAssassin: 1, fateWatcher: 2, fateWheelBeast: 1, spiritMirage: 1 },    // 精英关卡：先读守望者，再承受精英残局
    4: { shadowAssassin: 2, fateWatcher: 2, fateWheelBeast: 1, spiritMirage: 1 },
    5: { shadowAssassin: 1, fateWatcher: 2, fateWheelBeast: 2, spiritMirage: 1 },    // 命运机关全开
    6: { shadowAssassin: 2, fateWatcher: 3, fateWheelBeast: 1, spiritMirage: 1 },
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
  for (let i = 0; i < (rule.goblinSentinel ?? 0) && pool.length > 0; i++) {
    monsters.push(makeGoblinSentinel(nextMonsterId(), pool.shift() as Coord));
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

  // 第 2 章普通/精英变体（P1）
  for (let i = 0; i < (rule.desertRaider ?? 0) && pool.length > 0; i++) {
    monsters.push(makeDesertRaider(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.desertHopperLizard ?? 0) && pool.length > 0; i++) {
    monsters.push(makeDesertHopperLizard(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.duneSentinel ?? 0) && pool.length > 0; i++) {
    monsters.push(makeDuneSentinel(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.poisonScorpion ?? 0) && pool.length > 0; i++) {
    monsters.push(makePoisonScorpion(nextMonsterId(), pool.shift() as Coord));
  }

  // 第 3 章普通/精英变体（P1）
  for (let i = 0; i < (rule.snowWolf ?? 0) && pool.length > 0; i++) {
    monsters.push(makeSnowWolf(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.frostspikePorcupine ?? 0) && pool.length > 0; i++) {
    monsters.push(makeFrostspikePorcupine(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.frostSprite ?? 0) && pool.length > 0; i++) {
    monsters.push(makeFrostSprite(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.glacierShaper ?? 0) && pool.length > 0; i++) {
    monsters.push(makeGlacierShaper(nextMonsterId(), pool.shift() as Coord));
  }

  // 第 4 章普通/精英变体（P1）
  for (let i = 0; i < (rule.ashHound ?? 0) && pool.length > 0; i++) {
    monsters.push(makeAshHound(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.lavaCrab ?? 0) && pool.length > 0; i++) {
    monsters.push(makeLavaCrab(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.fireElemental ?? 0) && pool.length > 0; i++) {
    monsters.push(makeFireElemental(nextMonsterId(), pool.shift() as Coord));
  }

  // 第 5 章普通/精英变体（P1）
  for (let i = 0; i < (rule.shadowAssassin ?? 0) && pool.length > 0; i++) {
    monsters.push(makeShadowAssassin(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.fateWatcher ?? 0) && pool.length > 0; i++) {
    monsters.push(makeFateWatcher(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.fateWheelBeast ?? 0) && pool.length > 0; i++) {
    monsters.push(makeFateWheelBeast(nextMonsterId(), pool.shift() as Coord));
  }

  // 第 2-5 章灵气怪差异化变体（260616）
  for (let i = 0; i < (rule.spiritBeetle ?? 0) && pool.length > 0; i++) {
    monsters.push(makeSpiritBeetle(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.spiritElf ?? 0) && pool.length > 0; i++) {
    monsters.push(makeSpiritElf(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.spiritEmber ?? 0) && pool.length > 0; i++) {
    monsters.push(makeSpiritEmber(nextMonsterId(), pool.shift() as Coord));
  }
  for (let i = 0; i < (rule.spiritMirage ?? 0) && pool.length > 0; i++) {
    monsters.push(makeSpiritMirage(nextMonsterId(), pool.shift() as Coord));
  }

  // 通用 NORMAL / ELITE / ANIMA（备用回退，P1 章节表中不再触发）
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
