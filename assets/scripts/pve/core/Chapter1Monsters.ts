// 第一章专属怪物工厂（design §6 第一章怪物规则）。
// 数值调整记录（2026-06-10）：全套第一章怪物变体，供 MapGenerator 生成和 GoblinChief 增援号角使用。
//
// 第一章当前数值基准；章节整体完成前保持不变。
//
// 变体 id：
//   GOBLIN_WARRIOR  — 普通怪：40HP/13攻/1射程，基础格斗单位
//   GOBLIN_ARCHER   — 普通怪：30HP/13攻/3射程，远程单位
//   FROST_GOBLIN    — 精英怪：90HP/20攻/3射程，被击中2回合移动AP+1（可叠加）
//   FIRE_GOBLIN     — 精英怪：120HP/20攻/2射程，被击中2回合每回合5HP灼烧（可叠加）
//   SPIRIT_RAT      — 灵气怪：30HP/0攻/0射程，感知3格即逃，每次移动2格

import type { Coord, Monster } from './PveTypes';

export const VARIANT_GOBLIN_WARRIOR = 'GOBLIN_WARRIOR';
export const VARIANT_GOBLIN_ARCHER = 'GOBLIN_ARCHER';
//   GOBLIN_SENTINEL — 特殊怪：90HP / 0 攻 / 探查 3；不主动攻击，发现玩家后呼喊增幅同伴，
//                     每被玩家命中存活时立即逃离 1 格；怪物回合巡逻/远离玩家
export const VARIANT_GOBLIN_SENTINEL = 'GOBLIN_SENTINEL';
export const VARIANT_FROST_GOBLIN = 'FROST_GOBLIN';
export const VARIANT_FIRE_GOBLIN = 'FIRE_GOBLIN';
export const VARIANT_SPIRIT_RAT = 'SPIRIT_RAT';

/** 哥布林战士（普通怪）：与现有普通怪数值一致，作为第一章基础战斗单位。 */
export function makeGoblinWarrior(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_GOBLIN_WARRIOR, pos,
    hp: 40, maxHp: 40, attack: 13, range: 1, aggroRadius: 3, aiState: 'IDLE',
  };
}

/** 哥布林弓箭手（普通怪）：远程单位，攻击范围3，感知半径4。 */
export function makeGoblinArcher(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_GOBLIN_ARCHER, pos,
    hp: 30, maxHp: 30, attack: 13, range: 3, aggroRadius: 4, aiState: 'IDLE',
  };
}

/**
 * 哥布林哨兵（特殊怪）：高血支援单位，不主动攻击。
 * - 发现玩家 → 呼喊同伴（本层永久暴露，其它怪更积极追击）
 * - 被玩家命中且存活 → 立即逃离 1 格（第 4 层目标哨兵优先朝逃离点）
 * - 怪物回合：未发现则巡逻，发现后远离玩家（绝不普攻）
 */
export function makeGoblinSentinel(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_GOBLIN_SENTINEL, pos,
    hp: 90, maxHp: 90, attack: 0, range: 0, aggroRadius: 3, aiState: 'IDLE',
  };
}

/** 冰霜哥布林（精英怪）：被击中后移动AP+1持续2回合（叠加）。 */
export function makeFrostGoblin(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_FROST_GOBLIN, pos,
    hp: 90, maxHp: 90, attack: 20, range: 3, aggroRadius: 4, aiState: 'IDLE',
  };
}

/** 赤炎哥布林（精英怪）：被击中后每回合5HP灼烧持续2回合（叠加）。 */
export function makeFireGoblin(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_FIRE_GOBLIN, pos,
    hp: 120, maxHp: 120, attack: 20, range: 2, aggroRadius: 4, aiState: 'IDLE',
  };
}

/**
 * 灵鼠（灵气怪）：感知3格内玩家即逃跑，每次行动移动2格。
 * aggroRadius=3 对应"感知3格逃跑"规则（由 MonsterAI 中 SPIRIT_RAT 专属逻辑实现双格移动）。
 */
export function makeSpiritRat(id: string, pos: Coord): Monster {
  return {
    id, type: 'ANIMA', variantId: VARIANT_SPIRIT_RAT, pos,
    hp: 30, maxHp: 30, attack: 0, range: 0, aggroRadius: 3, aiState: 'IDLE',
  };
}
