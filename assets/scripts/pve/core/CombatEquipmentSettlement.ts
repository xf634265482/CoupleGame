import type { EquipItem, EquipSlot, ExpeditionState } from './PveTypes';
import type {
  PveEquipmentInstance,
  PveEquipmentLoadout,
  PveProfile,
  SettleFloorChallengeRequest,
} from './PveProgressionTypes';
import type { PersistentExpeditionRuntime } from './PersistentExpeditionRuntime';

const SLOTS: readonly EquipSlot[] = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'];

function toInstance(item: EquipItem): PveEquipmentInstance | null {
  if (!item.name) return null;
  return {
    instanceId: item.id,
    definitionId: item.name,
    quality: item.quality,
    enhanceLevel: item.enhanceLevel ?? 0,
    locked: false,
    ...(item.baseStat != null ? { baseStat: item.baseStat } : {}),
  };
}

function collectOwnedFixedItems(player: ExpeditionState['player']): PveEquipmentInstance[] {
  const items: PveEquipmentInstance[] = [];
  for (const slot of SLOTS) {
    const equipped = player.equipment[slot];
    if (equipped) {
      const instance = toInstance(equipped);
      if (instance) items.push(instance);
    }
  }
  for (const bagItem of player.bag ?? []) {
    const instance = toInstance(bagItem);
    if (instance) items.push(instance);
  }
  return items;
}

/**
 * 从局内已穿戴/背包的固定装备提取结算字段：
 * - lootedEquipment：本层新获得（不在开局永久背包里）的实例
 * - equipmentLoadout：以局内当前穿戴为准，保证「继续远征」带上已穿武器
 * - lootedStardust：本层拾取的星尘（RunPlayer.gold）
 */
export function extractCombatEquipmentSettlement(
  runtime: PersistentExpeditionRuntime,
  profile: PveProfile,
): Pick<SettleFloorChallengeRequest, 'lootedEquipment' | 'equipmentLoadout' | 'lootedStardust'> {
  const ownedIds = new Set(profile.equipmentInventory.map((item) => item.instanceId));
  const player = runtime.battleState.expedition.player;
  const all = collectOwnedFixedItems(player);
  const lootedEquipment = all.filter((item) => !ownedIds.has(item.instanceId));

  const equipmentLoadout: PveEquipmentLoadout = {};
  for (const slot of SLOTS) {
    const equipped = player.equipment[slot];
    if (equipped?.name) {
      equipmentLoadout[slot] = equipped.id;
    }
  }

  const lootedStardust = Math.max(0, Math.floor(player.gold ?? 0));

  return {
    ...(lootedEquipment.length > 0 ? { lootedEquipment } : {}),
    ...(Object.keys(equipmentLoadout).length > 0 ? { equipmentLoadout } : {}),
    ...(lootedStardust > 0 ? { lootedStardust } : {}),
  };
}
