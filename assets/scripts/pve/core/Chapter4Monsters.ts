// 第四章专属怪物工厂（熔岩深渊）。
// 数值已按 ×5.0 缩放后取整（普通层设计V1 §五）。
//
// 变体 id：
//   ASH_HOUND       — 普通怪：350HP/53攻/38甲/1射程，踏火
//   LAVA_CRAB       — 普通怪：350HP/53攻/5甲/1射程，硬甲（受物理伤害减半）
//   FIRE_ELEMENTAL  — 精英怪：700HP/100攻/56甲/2射程，灼烧

import type { Coord, Monster } from './PveTypes';

export const VARIANT_ASH_HOUND = 'ASH_HOUND';
export const VARIANT_LAVA_CRAB = 'LAVA_CRAB';
export const VARIANT_FIRE_ELEMENTAL = 'FIRE_ELEMENTAL';

/** 灰烬猎犬（普通怪）：免疫熔岩伤害，站在熔岩上时攻击 +20%。 */
export function makeAshHound(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_ASH_HOUND, pos,
    hp: 410, maxHp: 410, attack: 53, range: 1, aggroRadius: 3, aiState: 'IDLE', armor: 22,
  };
}

/** 岩浆蟹（普通怪）：硬甲——受物理攻击伤害减半（向下取整）。已有伤害减半机制，不额外加平甲。 */
export function makeLavaCrab(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_LAVA_CRAB, pos,
    hp: 410, maxHp: 410, attack: 53, range: 1, aggroRadius: 2, aiState: 'IDLE', armor: 5,
  };
}

/** 火焰元素（精英怪）：灼烧——命中玩家后5HP/回合×2回合（叠加，复用赤炎哥布林机制）。射程2。护甲 56。 */
export function makeFireElemental(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_FIRE_ELEMENTAL, pos,
    hp: 790, maxHp: 790, attack: 100, range: 2, aggroRadius: 4, aiState: 'IDLE', armor: 34,
  };
}
