import { playerAttack, playerAttackPower } from '../../assets/scripts/pve/core/CombatSystem';
import { CLASS_STATS, MONSTER_BASE, bossChapterScaling } from '../../assets/scripts/pve/core/PveConstants';
import { makeExpeditionState, makeMonster, makeRunPlayer } from './helpers';
import type { EquipItem } from '../../assets/scripts/pve/core/PveTypes';

function weapon(baseStat: number): EquipItem {
  return {
    id: `curve_weapon_${baseStat}`,
    name: '曲线测试武器',
    slot: 'WEAPON',
    quality: 'RARE',
    baseStat,
  };
}

describe('PVE difficulty curve guardrails', () => {
  it('advanced class attack bonuses stay at calibration baseline', () => {
    expect(CLASS_STATS.BERSERKER.attackBonus).toBe(0);
    expect(CLASS_STATS.ARCHER.attackBonus).toBe(0);
    expect(CLASS_STATS.ROGUE.attackBonus).toBe(0);
  });

  it('archer unarmed range is 2 and damage is 11', () => {
    const power = playerAttackPower(makeRunPlayer({ classId: 'ARCHER' }));
    expect(power.range).toBe(2);
    expect(power.damage).toBe(11);
  });

  it('unarmed attack ordering: warrior highest, archer mid, rogue lowest', () => {
    const adventurerAsWarrior = playerAttackPower(makeRunPlayer()).damage;
    const archer = playerAttackPower(makeRunPlayer({ classId: 'ARCHER' })).damage;
    const rogue = playerAttackPower(makeRunPlayer({ classId: 'ROGUE' })).damage;
    const berserker = playerAttackPower(makeRunPlayer({ classId: 'BERSERKER' })).damage;
    expect([adventurerAsWarrior, archer, rogue, berserker]).toEqual([13, 11, 10, 13]);
  });

  it('three fixed archer builds keep a clear damage ladder', () => {
    const normal = playerAttackPower(makeRunPlayer({
      classId: 'ARCHER',
      equipment: { WEAPON: weapon(10) },
    })).damage;
    const strong = playerAttackPower(makeRunPlayer({
      classId: 'ARCHER',
      equipment: { WEAPON: weapon(30) },
    })).damage;
    const extreme = playerAttackPower(makeRunPlayer({
      classId: 'ARCHER',
      equipment: { WEAPON: weapon(60) },
    })).damage;
    expect({ normal, strong, extreme }).toEqual({ normal: 21, strong: 41, extreme: 71 });
  });

  it('records boss HP baselines for chapter scaling budget', () => {
    const hp = [2, 3, 4, 5].map((chapter) => Math.round(MONSTER_BASE.BOSS.hp * bossChapterScaling(chapter).hpMult));
    expect(hp).toEqual([1680, 3600, 5100, 6900]);
  });

  it('caps one boss hit at the next phase threshold', () => {
    const state = makeExpeditionState({
      chapter: 5,
      floorOverrides: {
        player: { x: 1, y: 1 },
        ap: 10,
        monsters: [
          makeMonster('fate', { x: 1, y: 3 }, {
            type: 'BOSS',
            bossId: 'FATE_GUARDIAN',
            hp: 1000,
            maxHp: 1000,
            attack: 1,
            range: 1,
            aggroRadius: 99,
            aiState: 'CHASE',
          }),
        ],
        entities: [],
      },
      playerOverrides: {
        classId: 'ARCHER',
        equipment: { WEAPON: weapon(2000) },
      },
    });

    const result = playerAttack(state, 'fate');
    const boss = result.state.floorState.monsters.find((m) => m.id === 'fate');
    expect(boss?.hp).toBe(500);

    const attack = result.events.find((e) => e.type === 'ATTACK');
    expect(attack && attack.type === 'ATTACK' ? attack.targetHp : undefined).toBe(500);
  });
});
