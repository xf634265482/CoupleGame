// 装备词条数值效果（design §11 M2 / 260613-m2-systems-depth §一）：
// equip_atk_up/equip_def_up/equip_hp_up 三条原为"仅展示"占位，本文件统一计算其数值加成。
// 仅 EPIC/LEGENDARY 装备带词条槽，全身最多 5 件，单件加成可叠加。

import type { Equipment, EquipSlot, RunPlayer } from './PveTypes';

const EQUIP_SLOTS: readonly EquipSlot[] = ['WEAPON', 'ARMOR', 'HELMET', 'SHOES', 'TRINKET'];

/** equip_atk_up：每件 +1 攻击，直接加，不缩放章节。 */
export function equipTraitAtkBonus(player: RunPlayer): number {
  let bonus = 0;
  for (const slot of EQUIP_SLOTS) {
    if (player.equipment[slot]?.trait === 'equip_atk_up') bonus += 1;
  }
  return bonus;
}

/** equip_def_up：每件 +1 减伤，在护甲减伤后再扣。 */
export function equipTraitDefBonus(player: RunPlayer): number {
  let bonus = 0;
  for (const slot of EQUIP_SLOTS) {
    if (player.equipment[slot]?.trait === 'equip_def_up') bonus += 1;
  }
  return bonus;
}

/** equip_hp_up：每件 +2 maxHp，hp 不主动补（与 HELMET baseStat 同时机处理）。 */
export function equipTraitHpBonus(equipment: Equipment): number {
  let bonus = 0;
  for (const slot of EQUIP_SLOTS) {
    if (equipment[slot]?.trait === 'equip_hp_up') bonus += 2;
  }
  return bonus;
}
