// 第四章专属怪物工厂（熔岩深渊）。
// 数值已按 ×5.0 缩放后取整（普通层设计V1 §五）。
//
// 变体 id：
//   LAVA_GRUNT      — 普通怪：200HP/50攻/1射程，无特殊行为
//   LAVA_CRAB       — 普通怪：200HP/50攻/1射程，硬甲（受物理伤害减半，向下取整）
//   FIRE_ELEMENTAL  — 精英怪：400HP/100攻/2射程，灼烧（命中后5HP/回合×2回合，叠加）

import type { Coord, Monster } from './PveTypes';

export const VARIANT_LAVA_GRUNT = 'LAVA_GRUNT';
export const VARIANT_LAVA_CRAB = 'LAVA_CRAB';
export const VARIANT_FIRE_ELEMENTAL = 'FIRE_ELEMENTAL';

/** 熔岩暴徒（普通怪）：近战基础单位，无特殊行为。护甲 20。 */
export function makeLavaGrunt(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_LAVA_GRUNT, pos,
    hp: 200, maxHp: 200, attack: 50, range: 1, aggroRadius: 3, aiState: 'IDLE', armor: 20,
  };
}

/** 岩浆蟹（普通怪）：硬甲——受物理攻击伤害减半（向下取整）。已有伤害减半机制，不额外加平甲。 */
export function makeLavaCrab(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_LAVA_CRAB, pos,
    hp: 200, maxHp: 200, attack: 50, range: 1, aggroRadius: 2, aiState: 'IDLE',
  };
}

/** 火焰元素（精英怪）：灼烧——命中玩家后5HP/回合×2回合（叠加，复用赤炎哥布林机制）。射程2。护甲 30。 */
export function makeFireElemental(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_FIRE_ELEMENTAL, pos,
    hp: 400, maxHp: 400, attack: 100, range: 2, aggroRadius: 4, aiState: 'IDLE', armor: 30,
  };
}
