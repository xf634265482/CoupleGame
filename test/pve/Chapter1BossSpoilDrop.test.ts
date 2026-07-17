import { playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { createChapter1ExpeditionState } from '../../assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory';
import { extractCombatEquipmentSettlement } from '../../assets/scripts/pve/core/CombatEquipmentSettlement';
import {
  applyPersistentBattleResult,
  createPersistentFloorRuntime,
} from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import { applyPersistentAttack } from '../../assets/scripts/pve/core/PersistentCombatRules';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import { BOSS_SPOILS } from '../../assets/scripts/pve/core/bosses/BossSpoils';

const SPOIL_NAMES = BOSS_SPOILS.GOBLIN_CHIEF.map((t) => t.name);

function profile(): PveProfile {
  return {
    version: 1,
    highestUnlockedFloor: 7,
    highestClearedFloor: 6,
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
    tracking: null,
    activeChallengeId: null,
    updatedAt: 1,
  };
}

function snapshot(): FloorChallengeSnapshot {
  return {
    challengeId: 'c7',
    userId: 'u1',
    floor: 7,
    mode: 'PROGRESSION',
    seed: 42,
    status: 'ACTIVE',
    config: { professionId: 'WARRIOR', equipmentLoadout: {}, minghenLoadout: [], trackedMinghenId: null },
    startedAt: 1,
    updatedAt: 1,
  };
}

describe('Chapter1 floor7 boss exclusive spoil', () => {
  test('factory boss is GOBLIN_CHIEF with type BOSS', () => {
    const state = createChapter1ExpeditionState(snapshot(), profile());
    const boss = state.floorState.monsters.find((m) => m.id === 'GOBLIN_CHIEF');
    expect(boss?.type).toBe('BOSS');
    expect(boss?.bossId).toBe('GOBLIN_CHIEF');
    expect(boss?.summoned).toBeFalsy();
  });

  test('killing boss via playerAttack yields exclusive spoil LOOT and equips/bags it', () => {
    let state = createChapter1ExpeditionState(snapshot(), profile());
    const boss = state.floorState.monsters.find((m) => m.id === 'GOBLIN_CHIEF')!;
    // Reveal all + place player adjacent with lethal HP
    const revealed = state.floorState.revealed.map((row) => row.map(() => true));
    state = {
      ...state,
      floorState: {
        ...state.floorState,
        revealed,
        player: { x: boss.pos.x, y: boss.pos.y + 1 },
        ap: 99,
        maxAp: 99,
        monsters: state.floorState.monsters.map((m) =>
          m.id === boss.id ? { ...m, hp: 1, pos: { ...boss.pos } } : m,
        ),
      },
    };

    const result = playerAttack(state, 'GOBLIN_CHIEF');
    expect(result.events.map((e) => e.type)).toEqual(expect.arrayContaining(['ATTACK', 'KILL', 'LOOT']));
    const loot = result.events.filter((e) => e.type === 'LOOT');
    expect(loot.length).toBeGreaterThanOrEqual(1);
    const spoil = loot.find((e) => e.type === 'LOOT' && e.equip && SPOIL_NAMES.includes(e.equip.name));
    expect(spoil).toBeTruthy();
    if (spoil && spoil.type === 'LOOT' && spoil.equip) {
      const owned =
        result.state.player.equipment[spoil.equip.slot]?.name === spoil.equip.name
        || (result.state.player.bag ?? []).some((i) => i.name === spoil.equip!.name);
      expect(owned).toBe(true);
    }
  });

  test('persistent attack + battle result + settle extract keeps boss spoil', () => {
    const p = profile();
    let runtime = createPersistentFloorRuntime(snapshot(), p);
    const boss = runtime.battleState.expedition.floorState.monsters.find((m) => m.id === 'GOBLIN_CHIEF')!;
    const expedition = runtime.battleState.expedition;
    const revealed = expedition.floorState.revealed.map((row) => row.map(() => true));
    runtime = {
      ...runtime,
      resources: { ...runtime.resources, ap: 99, maxAp: 99 },
      battleState: {
        ...runtime.battleState,
        expedition: {
          ...expedition,
          floorState: {
            ...expedition.floorState,
            revealed,
            player: { x: boss.pos.x, y: boss.pos.y + 1 },
            ap: 99,
            maxAp: 99,
            monsters: expedition.floorState.monsters.map((m) =>
              m.id === boss.id ? { ...m, hp: 1 } : m,
            ),
          },
        },
      },
    };

    const attack = applyPersistentAttack(runtime, 'GOBLIN_CHIEF', p);
    expect(attack.result.events.map((e) => e.type)).toEqual(expect.arrayContaining(['KILL', 'LOOT']));
    expect(attack.result.events.some((e) => e.type === 'LOOT' && e.equip && SPOIL_NAMES.includes(e.equip.name))).toBe(true);

    const wrapped = applyPersistentBattleResult(attack.runtime, attack.result);
    const spoilLoot = wrapped.result.events.find(
      (e) => e.type === 'LOOT' && e.equip && SPOIL_NAMES.includes(e.equip.name),
    );
    expect(spoilLoot).toBeTruthy();

    const extracted = extractCombatEquipmentSettlement(wrapped.runtime, p);
    expect(extracted.lootedEquipment?.some((item) => SPOIL_NAMES.includes(item.definitionId))).toBe(true);
  });
});
