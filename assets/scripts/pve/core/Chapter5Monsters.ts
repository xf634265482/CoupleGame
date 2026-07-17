// 第五章专属怪物工厂（命运回廊）。
// 数值已按 ×8.0 缩放（普通层设计V1 §六）。
//
// 变体 id：
//   SHADOW_ASSASSIN — 普通怪：540HP/83攻/53甲/2射程，远程攻击
//   FATE_WATCHER    — 普通怪：540HP/83攻/53甲/1射程
//   FATE_WHEEL_BEAST — 精英怪：1080HP/160攻/81甲/1射程，首次死亡回溯 50% 生命

import type { Coord, Monster } from './PveTypes';

export const VARIANT_SHADOW_ASSASSIN = 'SHADOW_ASSASSIN';
export const VARIANT_FATE_WATCHER = 'FATE_WATCHER';
export const VARIANT_FATE_WHEEL_BEAST = 'FATE_WHEEL_BEAST';

/** 影子刺客（普通怪）：远程攻击（射程 2，不近战）。护甲 53。 */
export function makeShadowAssassin(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_SHADOW_ASSASSIN, pos,
    hp: 635, maxHp: 635, attack: 83, range: 2, aggroRadius: 4, aiState: 'IDLE', armor: 32,
  };
}

/** 命运守望者（普通怪）：高HP高攻基础单位，无特殊行为。护甲 53。 */
export function makeFateWatcher(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_FATE_WATCHER, pos,
    hp: 635, maxHp: 635, attack: 83, range: 1, aggroRadius: 3, aiState: 'IDLE', armor: 32,
  };
}

/** 命轮兽（精英怪）：首次死亡时命轮回溯至 50% 最大生命，不再冲锋。 */
export function makeFateWheelBeast(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_FATE_WHEEL_BEAST, pos,
    hp: 1220, maxHp: 1220, attack: 160, range: 1, aggroRadius: 4, aiState: 'IDLE', armor: 50,
  };
}
