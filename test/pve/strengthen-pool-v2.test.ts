import {
  ADVENTURER_STRENGTHEN_POOL,
  ARCHER_STRENGTHEN_POOL,
  BERSERKER_STRENGTHEN_POOL,
  ROGUE_STRENGTHEN_POOL,
  applyStrengthen,
  strengthenPoolForClass,
} from '../../assets/scripts/pve/core/AnimaSystem';
import { playerAttack, monsterAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { payGoldWithTraits } from '../../assets/scripts/pve/core/strengthen/StrengthenEconomy';
import { makeExpeditionState, makeMonster, makeRunPlayer } from './helpers';

describe('强化词条 V2', () => {
  it('四个池各 20 条且互不重复', () => {
    for (const pool of [ADVENTURER_STRENGTHEN_POOL, BERSERKER_STRENGTHEN_POOL, ARCHER_STRENGTHEN_POOL, ROGUE_STRENGTHEN_POOL]) {
      expect(pool).toHaveLength(20);
      expect(new Set(pool).size).toBe(20);
    }
    expect(new Set([...ADVENTURER_STRENGTHEN_POOL, ...BERSERKER_STRENGTHEN_POOL, ...ARCHER_STRENGTHEN_POOL, ...ROGUE_STRENGTHEN_POOL]).size).toBe(80);
  });

  it('进阶后只使用对应职业池，普通词条仍保留', () => {
    expect(new Set(strengthenPoolForClass('ARCHER'))).toEqual(new Set(ARCHER_STRENGTHEN_POOL));
    const state = makeExpeditionState({ playerOverrides: { classId: 'ARCHER', classTraits: ['strengthen_hp_up'] } });
    const result = applyStrengthen(state, 'marksman');
    expect(result.state.player.classTraits).toEqual(['strengthen_hp_up', 'marksman']);
    expect(applyStrengthen(result.state, 'berserk').state).toBe(result.state);
  });

  it('狂战复仇为受伤后下一击 25% 加伤', () => {
    const state = makeExpeditionState({
      playerOverrides: { classId: 'BERSERKER', classTraits: ['vengeance'], hp: 200, maxHp: 200 },
      floorOverrides: { player: { x: 4, y: 4 }, ap: 10, monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 200, maxHp: 200, attack: 20 })] },
    });
    const hurt = monsterAttack(state, 'm1');
    const result = playerAttack(hurt.state, 'm1');
    const attack = result.events.find((event) => event.type === 'ATTACK');
    expect(attack && attack.type === 'ATTACK' ? attack.damage : 0).toBeGreaterThan(25);
    expect(result.state.floorState.vengeanceReady).toBe(false);
  });

  it('射手第 3 次主动攻击触发穿云箭', () => {
    const state = makeExpeditionState({
      playerOverrides: { classId: 'ARCHER', classTraits: ['last_arrow'] },
      floorOverrides: { player: { x: 4, y: 4 }, ap: 20, archerAttackCount: 2, monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 200, maxHp: 200 })] },
    });
    const result = playerAttack(state, 'm1');
    const attack = result.events.find((event) => event.type === 'ATTACK');
    expect(attack && attack.type === 'ATTACK' ? attack.damage : 0).toBe(23);
  });

  it('游侠毒刃附加两回合中毒', () => {
    const state = makeExpeditionState({
      playerOverrides: { classId: 'ROGUE', classTraits: ['retribution', 'nimble_stack'] },
      floorOverrides: { player: { x: 4, y: 4 }, ap: 10, monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 200, maxHp: 200 })] },
    });
    const result = playerAttack(state, 'm1');
    const monster = result.state.floorState.monsters.find((entry) => entry.id === 'm1');
    expect(monster?.poisonRounds).toBe(2);
    expect(monster?.poisonDamage).toBe(6);
  });

  it('血价交易最多用生命补足一半价格且不能致死', () => {
    const player = makeRunPlayer({ gold: 40, hp: 100, classTraits: ['general_blood_price'] });
    expect(payGoldWithTraits(player, 60)).toMatchObject({ gold: 0, hp: 60 });
    expect(payGoldWithTraits({ ...player, gold: 20 }, 60)).toBeUndefined();
    expect(payGoldWithTraits({ ...player, hp: 40 }, 60)).toBeUndefined();
  });
});
