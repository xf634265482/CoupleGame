// 第三章专属怪物工厂（冰原要塞）。
// 数值已按 ×3.0 缩放后取整（普通层设计V1 §四）。
//
// 变体 id：
//   SNOW_WOLF    — 普通怪：120HP/30攻/1射程，冲锋（CHASE 每回合移动 2 格）
//   ICE_SLIME    — 普通怪：120HP/30攻/1射程，减速（命中后移动 AP+1，2 回合，叠加）
//   FROST_SPRITE — 精英怪：240HP/60攻/3射程，减速（同冰史莱姆，远程）

import type { Coord, Monster } from './PveTypes';

export const VARIANT_SNOW_WOLF = 'SNOW_WOLF';
export const VARIANT_ICE_SLIME = 'ICE_SLIME';
export const VARIANT_FROST_SPRITE = 'FROST_SPRITE';

/** 雪狼（普通怪）：冲锋——感知半径 5 + CHASE 每回合移动 2 格。护甲 12。 */
export function makeSnowWolf(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_SNOW_WOLF, pos,
    hp: 120, maxHp: 120, attack: 30, range: 1, aggroRadius: 5, aiState: 'IDLE', armor: 12,
  };
}

/** 冰史莱姆（普通怪）：命中玩家后施加减速（移动AP+1持续2回合，叠加）。护甲 12。 */
export function makeIceSlime(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_ICE_SLIME, pos,
    hp: 120, maxHp: 120, attack: 30, range: 1, aggroRadius: 2, aiState: 'IDLE', armor: 12,
  };
}

/** 冰霜精灵（精英怪）：远程减速（射程3，命中后移动AP+1持续2回合，叠加）。护甲 20。 */
export function makeFrostSprite(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_FROST_SPRITE, pos,
    hp: 240, maxHp: 240, attack: 60, range: 3, aggroRadius: 5, aiState: 'IDLE', armor: 20,
  };
}
