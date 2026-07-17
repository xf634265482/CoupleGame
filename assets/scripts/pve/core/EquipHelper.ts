// 装备替换 helper（260613 内容深化）：统一处理 HELMET baseStat 对 maxHp 的影响。

// 调用方：LootSystem.openChest / LootSystem.applySimpleDrop / NeutralEntities.upgradeEquip。

// 纯函数，零框架依赖。

import { equipmentMaxHpBonus } from "./equipment/EquipmentProgression";

import type { EquipItem, Equipment, RunPlayer } from "./PveTypes";

/**

 * 将 newItem 装到玩家对应槽位，返回更新后的 RunPlayer。

 * - 任何槽位：替换 equipment[slot]（无条件覆盖旧装备）。

 * - 固定装备目录：按全槽位生命加成差值调整 maxHp（护甲/鞋/饰品上的 maxHp 一并结算）。

 * - 旧随机头盔仍按 baseStat 计入生命；hp 仅在加成增加时上抬，降级时不超过新 maxHp。

 * - 武器威力 / 护甲减伤等在 CombatSystem 等计算点读取 baseStat 或固定定义。

 */

export function equipItem(player: RunPlayer, newItem: EquipItem): RunPlayer {
  const slot = newItem.slot;

  const equipment: Equipment = { ...player.equipment, [slot]: newItem };

  let { maxHp, hp } = player;

  const maxHpDelta =
    equipmentMaxHpBonus(equipment) - equipmentMaxHpBonus(player.equipment);

  if (maxHpDelta !== 0) {
    maxHp = maxHp + maxHpDelta;

    if (maxHpDelta > 0) {
      hp = Math.min(hp + maxHpDelta, maxHp);
    } else {
      hp = Math.min(hp, maxHp);
    }
  }

  return { ...player, equipment, maxHp, hp };
}

/**

 * 将装备放入背包（槽位已占时调用），不修改已装备的槽位。

 */

export function putInBag(player: RunPlayer, item: EquipItem): RunPlayer {
  return { ...player, bag: [...(player.bag ?? []), item] };
}

/**

 * 将背包中的装备装备到对应槽位，当前槽位有装备则移入背包。

 * itemId 不存在时返回 null（无副作用）。

 */

export function equipFromBag(
  player: RunPlayer,
  itemId: string,
): RunPlayer | null {
  const bag = player.bag ?? [];

  const idx = bag.findIndex((i) => i.id === itemId);

  if (idx === -1) return null;

  const item = bag[idx];

  const newBag = bag.filter((_, i) => i !== idx);

  const currentInSlot = player.equipment[item.slot];

  const finalBag = currentInSlot ? [...newBag, currentInSlot] : newBag;

  return equipItem({ ...player, bag: finalBag }, item);
}
