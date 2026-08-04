// 第二章专属怪物工厂（沙漠废墟）。
// 数值已按 ×1.8 缩放后取整（普通层设计V1 §三）。
//
// 变体 id：
//   DESERT_RAIDER   — 普通怪：135HP/21攻/15甲/1射程，近战游击
//   DESERT_HOPPER_LIZARD — 普通怪：135HP/21攻/15甲/1射程，双格追击 + 断尾狂跃
//   POISON_SCORPION      — 精英怪：270HP/36攻/23甲/1射程，穿甲施毒 + 蝎毒引爆

import type { Coord, Monster } from './PveTypes';

export const VARIANT_DESERT_RAIDER = 'DESERT_RAIDER';
export const VARIANT_DESERT_HOPPER_LIZARD = 'DESERT_HOPPER_LIZARD';
export const VARIANT_DUNE_SENTINEL = 'DUNE_SENTINEL';
export const VARIANT_POISON_SCORPION = 'POISON_SCORPION';

/** 沙漠劫匪（普通怪）：两格追击占据撤退路线，但移动回合不追加攻击。护甲 15。 */
export function makeDesertRaider(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_DESERT_RAIDER, pos,
    hp: 155, maxHp: 155, attack: 21, range: 1, aggroRadius: 5, aiState: 'IDLE', armor: 8,
  };
}

/** 沙漠跃蜥（普通怪）：双格追击；首次半血断尾跳离，下次成功攻击翻倍。 */
export function makeDesertHopperLizard(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_DESERT_HOPPER_LIZARD, pos,
    hp: 155, maxHp: 155, attack: 21, range: 1, aggroRadius: 2, aiState: 'IDLE', armor: 8,
  };
}

/** 沙暴警戒者（危险单位）：本体不高伤，但会放大周围敌人的围猎压力，逼玩家优先处理。 */
export function makeDuneSentinel(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_DUNE_SENTINEL, pos,
    hp: 190, maxHp: 190, attack: 14, range: 1, aggroRadius: 4, aiState: 'IDLE', armor: 6,
  };
}

/** 毒蝎（精英怪）：穿甲施毒；再次命中已中毒玩家时引爆剩余毒伤。 */
export function makePoisonScorpion(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_POISON_SCORPION, pos,
    hp: 305, maxHp: 305, attack: 36, range: 1, aggroRadius: 4, aiState: 'IDLE', armor: 14,
  };
}
