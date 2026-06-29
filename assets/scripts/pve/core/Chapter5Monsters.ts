// 第五章专属怪物工厂（命运回廊）。
// 数值已按 ×8.0 缩放（普通层设计V1 §六）。
//
// 变体 id：
//   SHADOW_ASSASSIN — 普通怪：320HP/80攻/2射程，远程攻击
//   FATE_WATCHER    — 普通怪：320HP/80攻/1射程，无特殊行为
//   VOID_WORM       — 精英怪：640HP/160攻/1射程，冲锋（CHASE 每回合移动 2 格）

import type { Coord, Monster } from './PveTypes';

export const VARIANT_SHADOW_ASSASSIN = 'SHADOW_ASSASSIN';
export const VARIANT_FATE_WATCHER = 'FATE_WATCHER';
export const VARIANT_VOID_WORM = 'VOID_WORM';

/** 影子刺客（普通怪）：远程攻击（射程 2，不近战）。护甲 30。 */
export function makeShadowAssassin(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_SHADOW_ASSASSIN, pos,
    hp: 320, maxHp: 320, attack: 80, range: 2, aggroRadius: 4, aiState: 'IDLE', armor: 30,
  };
}

/** 命运守望者（普通怪）：高HP高攻基础单位，无特殊行为。护甲 30。 */
export function makeFateWatcher(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_FATE_WATCHER, pos,
    hp: 320, maxHp: 320, attack: 80, range: 1, aggroRadius: 3, aiState: 'IDLE', armor: 30,
  };
}

/** 虚空虫（精英怪）：冲锋——CHASE 每回合移动 2 格，高伤重压。护甲 50。 */
export function makeVoidWorm(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_VOID_WORM, pos,
    hp: 640, maxHp: 640, attack: 160, range: 1, aggroRadius: 4, aiState: 'IDLE', armor: 50,
  };
}
