import { applyMonsterKillDrop } from '../../assets/scripts/pve/core/LootSystem';
import { equipItem } from '../../assets/scripts/pve/core/EquipHelper';
import { playerArmorPower } from '../../assets/scripts/pve/core/CombatSystem';
import { createChapter1ExpeditionState } from '../../assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory';
import { extractCombatEquipmentSettlement } from '../../assets/scripts/pve/core/CombatEquipmentSettlement';
import { createPersistentFloorRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import { clearFloorRuntime } from '../../assets/scripts/pve/core/FloorChallengeLifecycle';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import { createRng } from '../../assets/scripts/pve/core/rng';
import {
  rollPersistentNormalEquip,
  toFixedEquipItem,
} from '../../assets/scripts/pve/core/equipment/FixedEquipmentLoot';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';

function profile(overrides: Partial<PveProfile> = {}): PveProfile {
  const partnerDefaults = createDefaultPartners();
  return {
    version: 1,
    highestUnlockedFloor: 1,
    highestClearedFloor: 0,
    floorRecords: {},
    minghenCollection: {},
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    gold: 0,
    minghenDust: 0,
    professions: {
      WARRIOR: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      ARCHER: { unlocked: false, xp: 0, level: 1, unlockedTechniqueIds: [] },
      RANGER: { unlocked: false, xp: 0, level: 1, unlockedTechniqueIds: [] },
    },
    selectedProfessionId: 'WARRIOR',
    partners: partnerDefaults.partners,
    equippedPartnerId: partnerDefaults.equippedPartnerId,
    tracking: null,
    activeChallengeId: null,
    updatedAt: 1,
    ...overrides,
  };
}

function snapshot(floor = 1): FloorChallengeSnapshot {
  return {
    challengeId: `c${floor}`,
    userId: 'u1',
    floor,
    mode: 'PROGRESSION',
    seed: 42,
    status: 'ACTIVE',
    config: { professionId: 'WARRIOR', equipmentLoadout: {}, minghenLoadout: [], trackedMinghenId: null },
    startedAt: 1,
    updatedAt: 1,
  };
}

describe('FixedEquipmentLoot / combat settle carry', () => {
  test('persistent normal drop uses fixed pool and auto-equips empty weapon slot', () => {
    const state = createChapter1ExpeditionState(snapshot(1), profile());
    expect(state.equipmentDropPool).toEqual(expect.arrayContaining(['生锈短刃', '皮革轻甲', '旅行皮靴']));
    const monster = state.floorState.monsters.find((m) => !m.summoned && m.type === 'NORMAL');
    expect(monster).toBeTruthy();

    // Force many kill drops until an equip appears (seeded, finite).
    let current = state;
    let foundEquip = false;
    for (let i = 0; i < 200; i += 1) {
      const result = applyMonsterKillDrop(current, monster!.id);
      current = result.state;
      const loot = result.events.find((e) => e.type === 'LOOT');
      if (loot && loot.type === 'LOOT' && loot.equip) {
        foundEquip = true;
        expect(loot.equip.name).toBeTruthy();
        expect(['生锈短刃', '皮革轻甲', '旅行皮靴']).toContain(loot.equip.name);
        if (!loot.bagged && loot.equip.slot === 'WEAPON') {
          expect(current.player.equipment.WEAPON?.name).toBe(loot.equip.name);
        }
        break;
      }
      // Rematerialize dead monster for next attempt
      current = {
        ...current,
        floorState: {
          ...current.floorState,
          monsters: state.floorState.monsters.map((m) => ({ ...m })),
        },
      };
    }
    expect(foundEquip).toBe(true);
  });

  test('settlement extract carries equipped loot into loadout payload', () => {
    const p = profile();
    let runtime = createPersistentFloorRuntime(snapshot(1), p);
    const weapon = toFixedEquipItem({
      instanceId: 'loot_42_1_1',
      definitionId: '生锈短刃',
      quality: 'COMMON',
      enhanceLevel: 0,
      locked: false,
    });
    runtime = {
      ...runtime,
      battleState: {
        ...runtime.battleState,
        expedition: {
          ...runtime.battleState.expedition,
          player: {
            ...runtime.battleState.expedition.player,
            equipment: { WEAPON: weapon },
          },
          lootSeq: 1,
        },
      },
    };
    runtime = clearFloorRuntime(runtime);
    const extracted = extractCombatEquipmentSettlement(runtime, p);
    expect(extracted.lootedEquipment).toEqual([{
      instanceId: 'loot_42_1_1',
      definitionId: '生锈短刃',
      quality: 'COMMON',
      enhanceLevel: 0,
      locked: false,
      baseStat: 5,
    }]);
    expect(extracted.equipmentLoadout).toEqual({ WEAPON: 'loot_42_1_1' });
  });

  test('persistent elite kill drops from floor pool at elevated chance (not guaranteed)', () => {
    const state = createChapter1ExpeditionState(snapshot(2), profile());
    const elite = state.floorState.monsters.find((m) => m.type === 'ELITE');
    expect(elite).toBeTruthy();
    let found = false;
    let current = state;
    for (let i = 0; i < 80; i += 1) {
      const result = applyMonsterKillDrop(current, elite!.id);
      const loot = result.events.find((e) => e.type === 'LOOT');
      if (loot && loot.type === 'LOOT' && loot.equip) {
        found = true;
        expect(['铁制长矛', '木矛', '皮革头盔']).toContain(loot.equip.name);
        break;
      }
      current = {
        ...result.state,
        floorState: {
          ...result.state.floorState,
          monsters: state.floorState.monsters.map((m) => ({ ...m })),
        },
      };
    }
    expect(found).toBe(true);
  });

  test('empty equipmentDropPool falls back to chapter floor catalog', () => {
    const state = {
      ...createChapter1ExpeditionState(snapshot(1), profile()),
      equipmentDropPool: [],
    };
    const rng = createRng(7);
    // 10% chance �?enough trials to hit within a few hundred.
    let found = false;
    for (let i = 0; i < 200; i += 1) {
      const rolled = rollPersistentNormalEquip(rng, state);
      if (rolled) {
        found = true;
        expect(['生锈短刃', '皮革轻甲', '旅行皮靴']).toContain(rolled.equip.name);
        break;
      }
    }
    expect(found).toBe(true);
  });

  test('fixed helmet drop applies maxHp and shows scaled stats', () => {
    const state = createChapter1ExpeditionState(snapshot(3), profile());
    const helmet = toFixedEquipItem({
      instanceId: 'loot_h02',
      definitionId: '皮革头盔',
      quality: 'COMMON',
      enhanceLevel: 0,
      locked: false,
    });
    expect(helmet.baseStat).toBe(20);
    const before = state.player.maxHp;
    const next = equipItem(state.player, helmet);
    expect(next.maxHp).toBe(before + 20);
    expect(next.hp).toBe(before + 20);
    expect(playerArmorPower(next).baseArmor).toBe(0);
  });

  test('fixed armor drop applies maxHp and armor reduction', () => {
    const state = createChapter1ExpeditionState(snapshot(1), profile());
    const armor = toFixedEquipItem({
      instanceId: 'loot_a01',
      definitionId: '皮革轻甲',
      quality: 'COMMON',
      enhanceLevel: 0,
      locked: false,
    });
    expect(armor.baseStat).toBe(10);
    const before = state.player.maxHp;
    const next = equipItem(state.player, armor);
    expect(next.maxHp).toBe(before);
    expect(playerArmorPower(next).baseArmor).toBe(10);
  });
});
