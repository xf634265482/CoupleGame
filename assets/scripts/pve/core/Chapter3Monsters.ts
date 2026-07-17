// 第三章专属怪物工厂（冰原要塞）。
// 数值已按 ×3.0 缩放后取整（普通层设计V1 §四）。
//
// 变体 id：
//   SNOW_WOLF    — 普通怪：218HP/33攻/25甲/1射程，冲锋（CHASE 每回合移动 2 格）
//   FROSTSPIKE_PORCUPINE — 普通怪：218HP/33攻/25甲/1射程，被玩家直接攻击时反伤
//   FROST_SPRITE — 精英怪：435HP/60攻/40甲/3射程，远程减速 + 寒冰光环

import type { Coord, Monster } from './PveTypes';

export const VARIANT_SNOW_WOLF = 'SNOW_WOLF';
export const VARIANT_FROSTSPIKE_PORCUPINE = 'FROSTSPIKE_PORCUPINE';
export const VARIANT_FROST_SPRITE = 'FROST_SPRITE';
export const VARIANT_GLACIER_SHAPER = 'GLACIER_SHAPER';

/** 雪狼（普通怪）：冲锋——感知半径 5 + CHASE 每回合移动 2 格。护甲 25。 */
export function makeSnowWolf(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_SNOW_WOLF, pos,
    hp: 250, maxHp: 250, attack: 33, range: 1, aggroRadius: 5, aiState: 'IDLE', armor: 14,
  };
}

/** 冰刺豪猪（普通怪）：受到玩家直接攻击时反弹 20% 最终伤害。 */
export function makeFrostspikePorcupine(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_FROSTSPIKE_PORCUPINE, pos,
    hp: 250, maxHp: 250, attack: 33, range: 1, aggroRadius: 2, aiState: 'IDLE', armor: 14,
  };
}

/** 冰霜精灵（精英怪）：远程减速（射程3，命中后移动AP+1持续2回合，叠加）。护甲 40。 */
export function makeFrostSprite(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_FROST_SPRITE, pos,
    hp: 490, maxHp: 490, attack: 60, range: 3, aggroRadius: 5, aiState: 'IDLE', armor: 24,
  };
}

/** 冰川筑墙者（精英怪）：中等伤害，但会优先封玩家退路，制造站位与拆墙抉择。 */
export function makeGlacierShaper(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_GLACIER_SHAPER, pos,
    hp: 435, maxHp: 435, attack: 44, range: 1, aggroRadius: 5, aiState: 'IDLE', armor: 20,
  };
}
