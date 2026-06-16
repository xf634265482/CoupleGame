// 第 2-5 章灵气怪变体（260616 灵气怪差异化升级）。
// 设计：每章灵气怪除「逃跑」基础行为外，叠加独特机制（详见 specs/game-design/普通层怪物设计V1.md）。
//
//   SPIRIT_BEETLE  CH2 沙漠：逃跑离开格留下沙坑（SAND_PIT，存续 8 回合，玩家踩入移动 AP+2）
//   SPIRIT_ELF     CH3 冰原：逃跑离开格留下冰面（ICE_TILE，存续 6 回合，玩家踩入触发滑行）
//   SPIRIT_EMBER   CH4 熔岩：被玩家击杀时在十字 4 格生成 LAVA_TILE（存续 3 回合，踩入扣 5 HP）
//   SPIRIT_MIRAGE  CH5 命运：被玩家击杀时 50/50 给玩家随机 Buff 或 Debuff（5 选 1，等概率）
//
// HP 按 specs/game-design/普通层怪物设计V1.md §三~§六硬编码（与 chapterScaling 大致吻合）。

import type { Coord, Monster } from './PveTypes';

export const VARIANT_SPIRIT_BEETLE = 'SPIRIT_BEETLE';
export const VARIANT_SPIRIT_ELF = 'SPIRIT_ELF';
export const VARIANT_SPIRIT_EMBER = 'SPIRIT_EMBER';
export const VARIANT_SPIRIT_MIRAGE = 'SPIRIT_MIRAGE';

/** 灵气甲虫（CH2 沙漠灵气怪）：逃跑离开格生成沙坑。 */
export function makeSpiritBeetle(id: string, pos: Coord): Monster {
  return {
    id, type: 'ANIMA', variantId: VARIANT_SPIRIT_BEETLE, pos,
    hp: 42, maxHp: 42, attack: 0, range: 0, aggroRadius: 6, aiState: 'IDLE',
  };
}

/** 灵气精灵（CH3 冰原灵气怪）：逃跑离开格生成冰面。 */
export function makeSpiritElf(id: string, pos: Coord): Monster {
  return {
    id, type: 'ANIMA', variantId: VARIANT_SPIRIT_ELF, pos,
    hp: 60, maxHp: 60, attack: 0, range: 0, aggroRadius: 6, aiState: 'IDLE',
  };
}

/** 灵气炎魂（CH4 熔岩灵气怪）：玩家击杀时四周生成熔岩。 */
export function makeSpiritEmber(id: string, pos: Coord): Monster {
  return {
    id, type: 'ANIMA', variantId: VARIANT_SPIRIT_EMBER, pos,
    hp: 84, maxHp: 84, attack: 0, range: 0, aggroRadius: 6, aiState: 'IDLE',
  };
}

/** 灵气幻象（CH5 命运灵气怪）：玩家击杀时随机 Buff/Debuff。 */
export function makeSpiritMirage(id: string, pos: Coord): Monster {
  return {
    id, type: 'ANIMA', variantId: VARIANT_SPIRIT_MIRAGE, pos,
    hp: 110, maxHp: 110, attack: 0, range: 0, aggroRadius: 6, aiState: 'IDLE',
  };
}
