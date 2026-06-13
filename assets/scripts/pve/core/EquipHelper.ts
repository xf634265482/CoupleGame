// 装备替换 helper（260613 内容深化）：统一处理 HELMET baseStat 对 maxHp 的影响。
// 调用方：LootSystem.openChest / LootSystem.applySimpleDrop / NeutralEntities.upgradeEquip。
// 纯函数，零框架依赖。

import type { EquipItem, Equipment, RunPlayer } from './PveTypes';

/**
 * 将 newItem 装到玩家对应槽位，返回更新后的 RunPlayer。
 * - 任何槽位：替换 equipment[slot]（无条件覆盖旧装备）。
 * - HELMET 专属：按 baseStat 差值调整 maxHp；hp 仅在升级（delta>0）或首次装备时上抬，
 *   不会因换装下调当前 hp（避免拾取一件略弱头盔时被强制掉血）。
 * - 其他槽位（WEAPON/ARMOR/SHOES/TRINKET）的 baseStat 不直接影响 maxHp，
 *   由 CombatSystem / MovementSystem / AnimaSystem 在各自计算点读取。
 */
export function equipItem(player: RunPlayer, newItem: EquipItem): RunPlayer {
  const slot = newItem.slot;
  const old = player.equipment[slot];

  let { maxHp, hp } = player;
  if (slot === 'HELMET') {
    const oldStat = old?.baseStat ?? 0;
    const delta = newItem.baseStat - oldStat;
    maxHp = maxHp + delta;
    if (delta > 0) {
      // 升级或首次装备：hp 上抬等量（封顶 maxHp），避免出现 "10/30" 的视觉怪
      hp = Math.min(hp + delta, maxHp);
    } else if (delta < 0) {
      // 降级：当前 hp 不超过新 maxHp 即可（不主动扣血）
      hp = Math.min(hp, maxHp);
    }
  }

  const equipment: Equipment = { ...player.equipment, [slot]: newItem };
  return { ...player, equipment, maxHp, hp };
}
