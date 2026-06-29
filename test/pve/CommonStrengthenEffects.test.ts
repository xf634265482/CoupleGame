import {
  cappedGeneralTraitCount,
  distinctGeneralTraitCount,
  generalAnimaGainPct,
  generalAttackBonusPct,
  generalChestGoldPct,
  generalDynamicMaxHpBonus,
  generalFlatAttackBonus,
  generalGoldGainPct,
  reduceGeneralIncomingDamage,
} from '../../assets/scripts/pve/core/strengthen/CommonStrengthenEffects';
import { makeMonster, makeRunPlayer } from './helpers';

describe('CommonStrengthenEffects V2', () => {
  it('稳定数值词条按层数计算', () => {
    const traits = ['strengthen_attack_up', 'strengthen_attack_up', 'general_anima_sense', 'strengthen_gold_find', 'general_chest_lore'];
    expect(generalFlatAttackBonus(traits)).toBe(6);
    expect(generalAnimaGainPct(traits)).toBeCloseTo(0.1);
    expect(generalGoldGainPct(traits)).toBeCloseTo(0.15);
    expect(generalChestGoldPct(traits)).toBeCloseTo(0.15);
  });

  it('博采众长和厚积薄发只统计普通词条', () => {
    const traits = ['general_polymath', 'strengthen_hp_up', 'strengthen_attack_up', 'life_steal'];
    expect(distinctGeneralTraitCount(traits)).toBe(3);
    expect(generalDynamicMaxHpBonus(traits)).toBe(10);
    expect(cappedGeneralTraitCount(['strengthen_hp_up', 'strengthen_hp_up', 'strengthen_hp_up', 'life_steal'])).toBe(1);
  });

  it('条件增伤采用加法汇总', () => {
    const player = makeRunPlayer({ classTraits: ['general_first_strike', 'general_steady_finish', 'general_setback_counter'] });
    const target = makeMonster('m', { x: 1, y: 1 }, { hp: 20, maxHp: 100 });
    expect(generalAttackBonusPct({ player, target, isFirstAttackThisFloor: true, setbackReady: true })).toBeCloseTo(0.45);
  });

  it('防护训练与绝境防护共同减伤且最低为1', () => {
    const player = makeRunPlayer({ hp: 30, maxHp: 100, classTraits: ['general_guard_training', 'general_last_defense'] });
    expect(reduceGeneralIncomingDamage(player, 20)).toBe(16);
    expect(reduceGeneralIncomingDamage(player, 1)).toBe(1);
  });
});
