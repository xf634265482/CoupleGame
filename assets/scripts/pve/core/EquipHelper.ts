// 装备替换 helper（260613 内容深化）：统一处理 HELMET baseStat 对 maxHp 的影响。
// 调用方：LootSystem.openChest / LootSystem.applySimpleDrop / NeutralEntities.upgradeEquip。
// 纯函数，零框架依赖。

import { equipTraitHpBonus } from './EquipTraitEffects';
import type { EquipItem, Equipment, RunPlayer } from './PveTypes';

/**
 * 将 newItem 装到玩家对应槽位，返回更新后的 RunPlayer。
 * - 任何槽位：替换 equipment[slot]（无条件覆盖旧装备）。
 * - HELMET 专属：按 baseStat 差值调整 maxHp；hp 仅在升级（delta>0）或首次装备时上抬，
 *   不会因换装下调当前 hp（避免拾取一件略弱头盔时被强制掉血）。
 * - 其他槽位（WEAPON/ARMOR/SHOES/TRINKET）的 baseStat 不直接影响 maxHp，
 *   由 CombatSystem / MovementSystem / AnimaSystem 在各自计算点读取。
 * - `equip_hp_up` 词条（任意槽位，AC-403）：换装后按新旧装备的词条加成差值调整 maxHp，
 *   升级（delta>0）时 hp 同步上抬，降级时 hp 不超过新 maxHp，与 HELMET baseStat 同时机处理。
 */
export function equipItem(player: RunPlayer, newItem: EquipItem): RunPlayer {
  const slot = newItem.slot;
  const old = player.equipment[slot];

  let { maxHp, hp } = player;
  if (slot === 'HELMET') {
    const oldStat = old?.baseStat ?? 0;
    const helmetDelta = newItem.baseStat - oldStat;
    maxHp = maxHp + helmetDelta;
    if (helmetDelta > 0) {
      // 升级或首次装备：hp 上抬等量（封顶 maxHp），避免出现 "10/30" 的视觉怪
      hp = Math.min(hp + helmetDelta, maxHp);
    } else if (helmetDelta < 0) {
      // 降级：当前 hp 不超过新 maxHp 即可（不主动扣血）
      hp = Math.min(hp, maxHp);
    }
  }

  const equipment: Equipment = { ...player.equipment, [slot]: newItem };

  const hpTraitDelta = equipTraitHpBonus(equipment) - equipTraitHpBonus(player.equipment);
  if (hpTraitDelta !== 0) {
    maxHp = maxHp + hpTraitDelta;
    if (hpTraitDelta > 0) {
      hp = Math.min(hp + hpTraitDelta, maxHp);
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
export function equipFromBag(player: RunPlayer, itemId: string): RunPlayer | null {
  const bag = player.bag ?? [];
  const idx = bag.findIndex((i) => i.id === itemId);
  if (idx === -1) return null;
  const item = bag[idx];
  const newBag = bag.filter((_, i) => i !== idx);
  const currentInSlot = player.equipment[item.slot];
  const finalBag = currentInSlot ? [...newBag, currentInSlot] : newBag;
  return equipItem({ ...player, bag: finalBag }, item);
}
