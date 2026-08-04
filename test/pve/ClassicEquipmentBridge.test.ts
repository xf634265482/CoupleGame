import { listClassicEquipmentNames, getClassicEquipmentTemplate } from '../../assets/scripts/pve/core/EquipmentSystem';
import { createFixedEquipmentInstance, fixedWeaponAction, getFixedEquipmentDefinition } from '../../assets/scripts/pve/core/equipment/EquipmentDefinition';
import { equipmentPoolForFloor } from '../../assets/scripts/pve/core/equipment/FixedEquipmentLoot';
import {
  enhanceEquipment,
  equipmentSellPrice,
  effectiveEquipPrimaryRange,
  scaledEquipmentStats,
  toFixedEquipItem,
} from '../../assets/scripts/pve/core/equipment/EquipmentProgression';
import { playerAttackPower } from '../../assets/scripts/pve/core/CombatSystem';
import { makeRunPlayer } from './helpers';

describe('classic equipment bridge', () => {
  test('indexes old equipment pool by Chinese name', () => {
    const names = listClassicEquipmentNames();
    expect(names.length).toBeGreaterThanOrEqual(80);
    expect(getClassicEquipmentTemplate('皮革轻甲')?.slot).toBe('ARMOR');
    expect(JSON.stringify(names)).not.toContain('W01');
  });

  test('quality and enhancement scale rolled base stat', () => {
    const base = createFixedEquipmentInstance('i1', '铁制长剑', 'COMMON', 10);
    const rare = { ...base, quality: 'RARE' as const, enhanceLevel: 3 };
    const a = scaledEquipmentStats(base);
    const b = scaledEquipmentStats(rare);
    expect(b.power).toBeGreaterThan(a.power);
  });

  test('toFixedEquipItem keeps raw float; combat uses quality-scaled power', () => {
    const instance = {
      instanceId: 'axe1',
      definitionId: '铁战斧',
      quality: 'FINE' as const,
      enhanceLevel: 0,
      locked: false,
      baseStat: 24,
    };
    const item = toFixedEquipItem(instance);
    expect(item.baseStat).toBe(24);
    expect(item.baseStatMax).toBe(27);
    const { current, max } = effectiveEquipPrimaryRange(item);
    expect(current).toBe(Math.round(24 * 1.15));
    expect(max).toBe(Math.round(27 * 1.15));
    const damage = playerAttackPower(makeRunPlayer({
      classId: 'ROGUE',
      equipment: { WEAPON: item },
    })).damage;
    expect(damage).toBe(10 + current);
  });

  test('boss spoil without stored baseStat falls back to spoil template (camp 0/0 regression)', () => {
    const item = toFixedEquipItem({
      instanceId: 'boss_crown',
      definitionId: '破旧王冠',
      quality: 'RARE',
      enhanceLevel: 0,
      locked: false,
      // 云端旧结算曾剥离 baseStat
    });
    expect(item.slot).toBe('HELMET');
    expect(item.baseStat).toBe(60);
    const { current, max } = effectiveEquipPrimaryRange(item);
    expect(current).toBe(Math.round(60 * 1.32));
    expect(max).toBe(current);
  });

  test('enhancement always succeeds with fixed cost and sale returns half investment', () => {
    const item = createFixedEquipmentInstance('i1', '皮革轻甲', 'COMMON', 20);
    const upgraded = enhanceEquipment(item, 100);
    expect(upgraded).toMatchObject({ gold: 70, cost: 30, instance: { enhanceLevel: 1 } });
    // COMMON 基础价 5 + 强化投入 30 的一半
    expect(equipmentSellPrice(upgraded.instance)).toBe(20);
  });

  test('floor pools use classic names from chapter catalogs', () => {
    expect(equipmentPoolForFloor(1)).toEqual(['生锈短刃', '皮革轻甲', '旅行皮靴']);
    expect(equipmentPoolForFloor(7)).toEqual(['铁战斧', '铁制板甲', '铁制战靴', '铁制重盔', '灵力宝珠']);
    expect(getFixedEquipmentDefinition('铁战斧').slot).toBe('WEAPON');
  });

  test('weapon action derives from implicit sword/spear', () => {
    expect(fixedWeaponAction('生锈短刃')).toEqual({ apCost: 2, knockback: 0, hasSweep: false, straightProjectile: false });
    expect(fixedWeaponAction('铁制长矛').straightProjectile).toBe(true);
  });
});
