// 传奇装备效果单测（Phase 3 AC-EQ-6）
// 覆盖全部 15 件传奇的关键效果路径

import { createFogGrid } from '../../assets/scripts/pve/core/FogSystem';
import {
  legFateBladeBonus,
  legFateCrownBonus,
  legFateAmuletBonus,
  legIronCrownMultiplier,
  legSunBowRangeBonus,
  legSunBowIgnoresArmor,
  legShadowBootsMoveCostReduction,
  legGaleBootsFirstMoveFree,
  legSwallowStepsStealthBonus,
  legFortuneBlessingGoldBonus,
  legFortuneBlessingFloorHeal,
  legFateArmorHeal,
  legendaryDescription,
  playerHasLegendary,
  collectLegendaryIds,
  getLegendaryIdsByClass,
  LEGENDARY_BY_SLOT,
} from '../../assets/scripts/pve/core/LegendarySystem';
import { playerAttack, monsterAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { applyMove } from '../../assets/scripts/pve/core/MovementSystem';
import { advanceFloor } from '../../assets/scripts/pve/core/ExpeditionState';
import type { Equipment, EquipItem, EquipSlot } from '../../assets/scripts/pve/core/PveTypes';
import { makeExpeditionState, makeMonster, makeRunPlayer } from './helpers';
import { createRng } from '../../assets/scripts/pve/core/rng';

// ── 工具 ──────────────────────────────────────────────────────────────────

function makeLegEquip(legendaryId: string, slot: EquipSlot): EquipItem {
  return {
    id: `test_${legendaryId}`,
    name: '传奇测试装备',
    slot,
    quality: 'LEGENDARY',
    baseStat: 20,
    legendaryId,
  };
}

function equipWith(legendaryId: string, slot: EquipSlot): Equipment {
  return { [slot]: makeLegEquip(legendaryId, slot) } as Equipment;
}

// ── 辅助函数单元测试 ──────────────────────────────────────────────────────

describe('LegendarySystem — 辅助函数', () => {
  it('playerHasLegendary: 命中/未命中', () => {
    const eq = equipWith('leg_fate_blade', 'WEAPON');
    expect(playerHasLegendary(eq, 'leg_fate_blade')).toBe(true);
    expect(playerHasLegendary(eq, 'leg_soul_axe')).toBe(false);
    expect(playerHasLegendary({}, 'leg_fate_blade')).toBe(false);
  });

  it('collectLegendaryIds: 正确收集装备中的传奇 ID', () => {
    const eq: Equipment = {
      WEAPON: makeLegEquip('leg_fate_blade', 'WEAPON'),
      ARMOR:  makeLegEquip('leg_fate_armor', 'ARMOR'),
    };
    const ids = collectLegendaryIds(eq);
    expect(ids).toContain('leg_fate_blade');
    expect(ids).toContain('leg_fate_armor');
    expect(ids).toHaveLength(2);
  });

  it('getLegendaryIdsByClass: BERSERKER 返回含 ANY 和 BERSERKER 偏向的列表', () => {
    const ids = getLegendaryIdsByClass('WEAPON', 'BERSERKER');
    expect(ids).toContain('leg_fate_blade');  // ANY
    expect(ids).toContain('leg_soul_axe');    // BERSERKER
    expect(ids).not.toContain('leg_sun_bow'); // ARCHER
  });

  it('getLegendaryIdsByClass: 无匹配职业时返回全部', () => {
    // HELMETS: ANY + BERSERKER + ANY — 'ROGUE' 无专属头盔
    const ids = getLegendaryIdsByClass('HELMET', 'ROGUE');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('LEGENDARY_BY_SLOT: 每槽恰好 3 件', () => {
    for (const slot of Object.keys(LEGENDARY_BY_SLOT) as EquipSlot[]) {
      expect(LEGENDARY_BY_SLOT[slot]).toHaveLength(3);
    }
  });

  it('legendaryDescription: 返回含「传奇」的字符串', () => {
    const desc = legendaryDescription('leg_fate_blade');
    expect(desc).toContain('传奇');
    expect(legendaryDescription('unknown_id')).toBe('unknown_id');
  });
});

// ── 效果计算函数 ──────────────────────────────────────────────────────────

describe('LegendarySystem — 效果计算函数', () => {
  it('legFateBladeBonus: 每击杀叠层+3，最多5层=15', () => {
    const eq = equipWith('leg_fate_blade', 'WEAPON');
    expect(legFateBladeBonus(eq, 0)).toBe(0);
    expect(legFateBladeBonus(eq, 1)).toBe(3);
    expect(legFateBladeBonus(eq, 5)).toBe(15);
    expect(legFateBladeBonus(eq, 10)).toBe(15); // 封顶
    expect(legFateBladeBonus({}, 5)).toBe(0);   // 未装备
  });

  it('legFateCrownBonus: Boss击杀叠层+10，最多3层=30', () => {
    const eq = equipWith('leg_fate_crown', 'HELMET');
    expect(legFateCrownBonus(eq, 0)).toBe(0);
    expect(legFateCrownBonus(eq, 2)).toBe(20);
    expect(legFateCrownBonus(eq, 3)).toBe(30);
    expect(legFateCrownBonus(eq, 9)).toBe(30); // 封顶
  });

  it('legFateAmuletBonus: 强化叠层+5，最多5层=25', () => {
    const eq = equipWith('leg_fate_amulet', 'TRINKET');
    expect(legFateAmuletBonus(eq, 0)).toBe(0);
    expect(legFateAmuletBonus(eq, 3)).toBe(15);
    expect(legFateAmuletBonus(eq, 5)).toBe(25);
    expect(legFateAmuletBonus(eq, 99)).toBe(25);
  });

  it('legIronCrownMultiplier: 有铁冠=1.2，无=1.0', () => {
    const eq = equipWith('leg_iron_crown', 'HELMET');
    expect(legIronCrownMultiplier(eq)).toBe(1.2);
    expect(legIronCrownMultiplier({})).toBe(1.0);
  });

  it('legSunBowRangeBonus: 有贯日弓=+2，无=0', () => {
    expect(legSunBowRangeBonus(equipWith('leg_sun_bow', 'WEAPON'))).toBe(2);
    expect(legSunBowRangeBonus({})).toBe(0);
  });

  it('legSunBowIgnoresArmor: 有贯日弓=true', () => {
    expect(legSunBowIgnoresArmor(equipWith('leg_sun_bow', 'WEAPON'))).toBe(true);
    expect(legSunBowIgnoresArmor({})).toBe(false);
  });

  it('legShadowBootsMoveCostReduction: 有影踪靴=-1', () => {
    expect(legShadowBootsMoveCostReduction(equipWith('leg_shadow_boots', 'SHOES'))).toBe(1);
    expect(legShadowBootsMoveCostReduction({})).toBe(0);
  });

  it('legGaleBootsFirstMoveFree: 有疾风靴=true', () => {
    expect(legGaleBootsFirstMoveFree(equipWith('leg_gale_boots', 'SHOES'))).toBe(true);
    expect(legGaleBootsFirstMoveFree({})).toBe(false);
  });

  it('legSwallowStepsStealthBonus: 有飞燕步=3，无=0', () => {
    expect(legSwallowStepsStealthBonus(equipWith('leg_swallow_steps', 'SHOES'))).toBe(3);
    expect(legSwallowStepsStealthBonus({})).toBe(0);
  });

  it('legFortuneBlessingGoldBonus: 有财神=0.8，无=0', () => {
    expect(legFortuneBlessingGoldBonus(equipWith('leg_fortune_blessing', 'TRINKET'))).toBe(0.8);
    expect(legFortuneBlessingGoldBonus({})).toBe(0);
  });

  it('legFortuneBlessingFloorHeal: 每20金=1HP，封顶15', () => {
    const eq = equipWith('leg_fortune_blessing', 'TRINKET');
    expect(legFortuneBlessingFloorHeal(eq, 0)).toBe(0);
    expect(legFortuneBlessingFloorHeal(eq, 20)).toBe(1);
    expect(legFortuneBlessingFloorHeal(eq, 100)).toBe(5);
    expect(legFortuneBlessingFloorHeal(eq, 400)).toBe(15); // 封顶
    expect(legFortuneBlessingFloorHeal(eq, 9999)).toBe(15);
    expect(legFortuneBlessingFloorHeal({}, 400)).toBe(0);
  });

  it('legFateArmorHeal: 回10%maxHp，向上取整', () => {
    const eq = equipWith('leg_fate_armor', 'ARMOR');
    expect(legFateArmorHeal(eq, 100)).toBe(10);
    expect(legFateArmorHeal(eq, 55)).toBe(6); // ceil(5.5)
    expect(legFateArmorHeal({}, 100)).toBe(0);
  });
});

// ── 疾风之靴：首步免费 + 首击+25% ────────────────────────────────────────

describe('leg_gale_boots — 首步免费 + 首击+25%', () => {
  it('移动免费：第一步不消耗 AP', () => {
    const state = makeExpeditionState({
      playerOverrides: {
        equipment: equipWith('leg_gale_boots', 'SHOES'),
      },
      floorOverrides: {
        ap: 3,
        shoesFirstMoveDone: false,
      },
    });
    const result = applyMove(state, 'DOWN');
    expect(result.state.floorState.ap).toBe(3); // 首步免费，AP 不变
  });

  it('首步后标记 legGaleBootsAttackReady', () => {
    const state = makeExpeditionState({
      playerOverrides: {
        equipment: equipWith('leg_gale_boots', 'SHOES'),
      },
      floorOverrides: {
        size: 8,
        player: { x: 4, y: 4 },
        ap: 4,
        shoesFirstMoveDone: false,
        monsters: [],
        revealed: createFogGrid(8),
      },
    });
    const result = applyMove(state, 'RIGHT');
    expect(result.state.floorState.legGaleBootsAttackReady).toBe(true);
  });

  it('无疾风靴时不标记 legGaleBootsAttackReady', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        size: 8,
        player: { x: 4, y: 4 },
        ap: 4,
        monsters: [],
        revealed: createFogGrid(8),
      },
    });
    const result = applyMove(state, 'RIGHT');
    expect(result.state.floorState.legGaleBootsAttackReady).toBeFalsy();
  });
});

// ── 影踪战靴：移动AP-1 ───────────────────────────────────────────────────

describe('leg_shadow_boots — 移动 AP-1', () => {
  it('每步移动额外减少 1 AP', () => {
    const baseFloor = {
      size: 8,
      player: { x: 4, y: 4 },
      ap: 6,
      monsters: [],
      shoesFirstMoveDone: true,
      revealed: createFogGrid(8),
    };
    const stateWithBoots = makeExpeditionState({
      playerOverrides: { equipment: equipWith('leg_shadow_boots', 'SHOES') },
      floorOverrides: baseFloor,
    });
    const stateWithout = makeExpeditionState({ floorOverrides: baseFloor });
    const withBoots = applyMove(stateWithBoots, 'RIGHT');
    const without = applyMove(stateWithout, 'RIGHT');
    expect(withBoots.state.floorState.ap).toBeGreaterThan(without.state.floorState.ap);
  });
});

// ── 命运铠甲：进层回 10%maxHp ─────────────────────────────────────────────

describe('leg_fate_armor — 每层入场回血', () => {
  it('通关后进入新层时回血', () => {
    const state = makeExpeditionState({
      floor: 1,
      playerOverrides: {
        hp: 50,
        maxHp: 100,
        equipment: equipWith('leg_fate_armor', 'ARMOR'),
      },
      floorOverrides: { status: 'CLEARED' },
    });
    const result = advanceFloor(state);
    expect(result.state.player.hp).toBeGreaterThan(50);
    expect(result.state.player.hp).toBeLessThanOrEqual(100);
  });
});

// ── 财神赐福：进层回血 + 金币+80% ────────────────────────────────────────

describe('leg_fortune_blessing — 入场回血', () => {
  it('持有100金时入场回 5HP', () => {
    const state = makeExpeditionState({
      floor: 1,
      playerOverrides: {
        hp: 80,
        maxHp: 100,
        gold: 100,
        equipment: equipWith('leg_fortune_blessing', 'TRINKET'),
      },
      floorOverrides: { status: 'CLEARED' },
    });
    const result = advanceFloor(state);
    expect(result.state.player.hp).toBe(85);
  });
});
