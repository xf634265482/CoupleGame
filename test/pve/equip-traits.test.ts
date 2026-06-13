// M2 系统深度补全 阶段1（260613-m2-systems-depth）：装备词条 atk/def/hp 三条接入战斗。

import { equipItem } from '../../assets/scripts/pve/core/EquipHelper';
import { equipTraitAtkBonus, equipTraitDefBonus, equipTraitHpBonus } from '../../assets/scripts/pve/core/EquipTraitEffects';
import { monsterAttack, playerAttackPower } from '../../assets/scripts/pve/core/CombatSystem';
import type { EquipItem } from '../../assets/scripts/pve/core/PveTypes';
import { makeExpeditionState, makeRunPlayer } from './helpers';

function makeEquip(slot: EquipItem['slot'], trait: string, id = `equip_${slot}_${trait}`): EquipItem {
  return { id, slot, quality: 'EPIC', name: '测试装备', baseStat: 0, trait };
}

describe('m2-systems-depth: 装备词条 atk/def/hp 接入战斗', () => {
  it('equip_atk_up：每件 +1 攻击，可叠加', () => {
    const player = makeRunPlayer({
      equipment: {
        WEAPON: makeEquip('WEAPON', 'equip_atk_up'),
        ARMOR: makeEquip('ARMOR', 'equip_atk_up'),
      },
    });
    expect(equipTraitAtkBonus(player)).toBe(2);
    const { damage } = playerAttackPower(player);
    const base = playerAttackPower(makeRunPlayer()).damage;
    expect(damage).toBe(base + 2);
  });

  it('equip_def_up：在护甲减伤后再扣 1（每件叠加）', () => {
    const player = makeRunPlayer({
      equipment: {
        ARMOR: makeEquip('ARMOR', 'equip_def_up'),
        HELMET: makeEquip('HELMET', 'equip_def_up'),
      },
    });
    expect(equipTraitDefBonus(player)).toBe(2);

    const state = makeExpeditionState({
      playerOverrides: { hp: 200, maxHp: 200, equipment: player.equipment },
      floorOverrides: {
        size: 10,
        player: { x: 5, y: 5 },
        monsters: [
          {
            id: 'm1', type: 'NORMAL', bossId: undefined, pos: { x: 5, y: 6 },
            hp: 50, maxHp: 50, attack: 30, range: 1, aggroRadius: 99, aiState: 'CHASE',
          },
        ],
      },
    });
    const result = monsterAttack(state, 'm1');
    const dmgEvent = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
    expect(dmgEvent && dmgEvent.type === 'PLAYER_DAMAGED' && dmgEvent.damage).toBe(30 - 2);
  });

  it('equip_hp_up：装备替换时 maxHp +2/件，hp 同步上抬', () => {
    const base = makeRunPlayer({ hp: 30, maxHp: 30 });
    expect(equipTraitHpBonus(base.equipment)).toBe(0);

    const withTrinket = equipItem(base, makeEquip('TRINKET', 'equip_hp_up'));
    expect(withTrinket.maxHp).toBe(32);
    expect(withTrinket.hp).toBe(32);

    const withShoes = equipItem(withTrinket, makeEquip('SHOES', 'equip_hp_up'));
    expect(withShoes.maxHp).toBe(34);
    expect(withShoes.hp).toBe(34);
  });

  it('equip_hp_up：替换为无该词条的装备时 maxHp -2，hp 不超过新 maxHp', () => {
    const base = makeRunPlayer({
      hp: 32,
      maxHp: 32,
      equipment: { TRINKET: makeEquip('TRINKET', 'equip_hp_up') },
    });
    const replaced = equipItem(base, makeEquip('TRINKET', 'equip_gold_up', 'equip_trinket_gold'));
    expect(replaced.maxHp).toBe(30);
    expect(replaced.hp).toBe(30);
  });
});
