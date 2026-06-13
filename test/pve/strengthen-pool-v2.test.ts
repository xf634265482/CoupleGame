// m2-systems-depth 阶段2（260613）：灵气强化词条池扩到 15/职业，新增 10 词条/职业（AC-404~407）。

import {
  applyStrengthen,
  ARCHER_STRENGTHEN_POOL,
  BERSERKER_STRENGTHEN_POOL,
  ROGUE_STRENGTHEN_POOL,
  rollChoices,
} from '../../assets/scripts/pve/core/AnimaSystem';
import { monsterAttack, playerAttack, playerAttackPower } from '../../assets/scripts/pve/core/CombatSystem';
import { makeExpeditionState, makeMonster, makeRunPlayer } from './helpers';

// 10 种新机制按 [BERSERKER, ARCHER, ROGUE] 词条 id 排列。
const LOW_HP_X2 = ['last_stand', 'headshot', 'shadow_strike'];
const LOW_HP_X1_5 = ['berserker_resolve', 'deadeye', 'survival_instinct'];
const VENGEANCE = ['vengeance', 'retreat_shot', 'retribution'];
const CLEAVE = ['cleave', 'scatter_shot', 'shockwave'];
const PAIN_TOLERANCE = ['pain_tolerance', 'steady_aim', 'evasion_training'];
const EXECUTIONER = ['executioner', 'finisher', 'coup_de_grace'];
const IRON_SKIN_STACK = ['iron_skin_stack', 'quiver_stack', 'nimble_stack'];
const BLOODLUST_STACK = ['bloodlust_stack', 'vital_shot_stack', 'bloodletter_stack'];
const RAGE_STRIKE_STACK = ['rage_strike_stack', 'focus_stack', 'flurry_stack'];
const FINAL_CHARGE = ['final_charge', 'last_arrow', 'desperate_gambit'];

const CLASS_NAMES = ['BERSERKER', 'ARCHER', 'ROGUE'] as const;
const CLASS_IDS = ['BERSERKER', 'ARCHER', 'ROGUE'] as const;

describe('m2-systems-depth 阶段2：15 词条强化池（每职业新增 10 条）', () => {
  it('每职业强化池均扩展到 15 条', () => {
    expect(BERSERKER_STRENGTHEN_POOL).toHaveLength(15);
    expect(ARCHER_STRENGTHEN_POOL).toHaveLength(15);
    expect(ROGUE_STRENGTHEN_POOL).toHaveLength(15);
  });

  describe.each(CLASS_NAMES.map((name, i) => [name, i] as const))('%s', (className, i) => {
    const classId = CLASS_IDS[i];

    it('HP≤25%：攻击力 ×2', () => {
      const lowHp = makeRunPlayer({ classId, classTraits: [LOW_HP_X2[i]], hp: 40, maxHp: 200 });
      const full = makeRunPlayer({ classId, classTraits: [], hp: 200, maxHp: 200 });
      expect(playerAttackPower(lowHp).damage).toBe(playerAttackPower(full).damage * 2);
    });

    it('进阶：HP≤30%（但>25%）：攻击力 ×1.5', () => {
      const lowHp = makeRunPlayer({ classId, classTraits: [LOW_HP_X1_5[i]], hp: 55, maxHp: 200 });
      const full = makeRunPlayer({ classId, classTraits: [], hp: 200, maxHp: 200 });
      expect(playerAttackPower(lowHp).damage).toBe(Math.max(10, Math.round(playerAttackPower(full).damage * 1.5)));
    });

    it('复仇系：受击后下次攻击 +5 伤害（一次性消耗）', () => {
      const state = makeExpeditionState({
        playerOverrides: { classId, classTraits: [VENGEANCE[i]], hp: 200, maxHp: 200 },
        floorOverrides: {
          size: 10,
          player: { x: 5, y: 5 },
          ap: 99,
          monsters: [
            makeMonster('m1', { x: 5, y: 6 }, { attack: 10, hp: 100, maxHp: 100, aiState: 'CHASE' }),
          ],
        },
      });

      const hit = monsterAttack(state, 'm1');
      expect(hit.state.floorState.vengeanceReady).toBe(true);

      const base = playerAttackPower(hit.state.player).damage;
      const result = playerAttack(hit.state, 'm1');
      const atkEvent = result.events.find((e) => e.type === 'ATTACK');
      expect(atkEvent && atkEvent.type === 'ATTACK' && atkEvent.damage).toBe(base + 5);
      expect(result.state.floorState.vengeanceReady).toBe(false);
    });

    it('横扫系：命中后对相邻敌人造成 50% 溅射伤害', () => {
      const state = makeExpeditionState({
        playerOverrides: { classId, classTraits: [CLEAVE[i]], hp: 200, maxHp: 200 },
        floorOverrides: {
          size: 10,
          player: { x: 5, y: 5 },
          ap: 99,
          monsters: [
            makeMonster('m1', { x: 5, y: 6 }, { hp: 999, maxHp: 999, aiState: 'CHASE' }),
            makeMonster('m2', { x: 5, y: 7 }, { hp: 999, maxHp: 999, aiState: 'CHASE' }),
          ],
        },
      });

      const { damage } = playerAttackPower(state.player);
      const result = playerAttack(state, 'm1');
      const splashEvent = result.events.find((e) => e.type === 'ATTACK' && e.targetId === 'm2');
      expect(splashEvent && splashEvent.type === 'ATTACK' && splashEvent.damage).toBe(
        Math.max(10, Math.round(damage * 0.5)),
      );
    });

    it('受到伤害 ≥5 时再 -2', () => {
      const withTrait = makeExpeditionState({
        playerOverrides: { classId, classTraits: [PAIN_TOLERANCE[i]], hp: 200, maxHp: 200 },
        floorOverrides: {
          size: 10,
          player: { x: 5, y: 5 },
          monsters: [makeMonster('m1', { x: 5, y: 6 }, { attack: 30, hp: 50, maxHp: 50, aiState: 'CHASE' })],
        },
      });
      const without = makeExpeditionState({
        playerOverrides: { classId, classTraits: [], hp: 200, maxHp: 200 },
        floorOverrides: {
          size: 10,
          player: { x: 5, y: 5 },
          monsters: [makeMonster('m1', { x: 5, y: 6 }, { attack: 30, hp: 50, maxHp: 50, aiState: 'CHASE' })],
        },
      });

      const dmgWith = monsterAttack(withTrait, 'm1').events.find((e) => e.type === 'PLAYER_DAMAGED');
      const dmgWithout = monsterAttack(without, 'm1').events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(dmgWith && dmgWith.type === 'PLAYER_DAMAGED' && dmgWith.damage).toBe(
        (dmgWithout && dmgWithout.type === 'PLAYER_DAMAGED' && dmgWithout.damage ? dmgWithout.damage : 0) - 2,
      );
    });

    it('目标 HP≤20%：攻击 +3 伤害', () => {
      const state = makeExpeditionState({
        playerOverrides: { classId, classTraits: [EXECUTIONER[i]], hp: 200, maxHp: 200 },
        floorOverrides: {
          size: 10,
          player: { x: 5, y: 5 },
          ap: 99,
          monsters: [makeMonster('m1', { x: 5, y: 6 }, { hp: 10, maxHp: 100, aiState: 'CHASE' })],
        },
      });
      const base = playerAttackPower(state.player).damage;
      const result = playerAttack(state, 'm1');
      const atkEvent = result.events.find((e) => e.type === 'ATTACK');
      expect(atkEvent && atkEvent.type === 'ATTACK' && atkEvent.damage).toBe(base + 3);
    });

    it('可叠加（上限5）：选中时立即 maxHp/HP +3', () => {
      let state = makeExpeditionState({ playerOverrides: { classId, hp: 200, maxHp: 200 } });
      for (let n = 1; n <= 5; n++) {
        const result = applyStrengthen(state, IRON_SKIN_STACK[i]);
        state = result.state;
        expect(state.player.maxHp).toBe(200 + n * 3);
        expect(state.player.hp).toBe(200 + n * 3);
      }
      // 第 6 次超过 stack 上限，no-op
      const overCap = applyStrengthen(state, IRON_SKIN_STACK[i]);
      expect(overCap.state.player.maxHp).toBe(215);
      expect(overCap.state.player.classTraits.filter((t) => t === IRON_SKIN_STACK[i])).toHaveLength(5);
    });

    it('可叠加（上限5）：击杀回复等同已选层数的 HP', () => {
      const stackN = 3;
      const traits = Array(stackN).fill(BLOODLUST_STACK[i]);
      const state = makeExpeditionState({
        playerOverrides: { classId, classTraits: traits, hp: 100, maxHp: 200 },
        floorOverrides: {
          size: 10,
          player: { x: 5, y: 5 },
          ap: 99,
          monsters: [makeMonster('m1', { x: 5, y: 6 }, { hp: 1, maxHp: 1, aiState: 'CHASE' })],
        },
      });
      const result = playerAttack(state, 'm1');
      expect(result.state.player.hp).toBe(100 + stackN);
    });

    it('可叠加（上限5）：攻击力 + 已选层数×0.5（向上取整）', () => {
      const stackN = 3;
      const traits = Array(stackN).fill(RAGE_STRIKE_STACK[i]);
      const withStack = makeRunPlayer({ classId, classTraits: traits, hp: 200, maxHp: 200 });
      const without = makeRunPlayer({ classId, classTraits: [], hp: 200, maxHp: 200 });
      expect(playerAttackPower(withStack).damage).toBe(
        playerAttackPower(without).damage + Math.round(stackN * 0.5),
      );
    });

    it('进阶 oneShot：本层首次 HP≤30% 时 AP+3', () => {
      const state = makeExpeditionState({
        playerOverrides: { classId, classTraits: [FINAL_CHARGE[i]], hp: 100, maxHp: 200 },
        floorOverrides: {
          size: 10,
          player: { x: 5, y: 5 },
          ap: 10,
          monsters: [makeMonster('m1', { x: 5, y: 6 }, { attack: 50, hp: 100, maxHp: 100, aiState: 'CHASE' })],
        },
      });
      // 受击后 hp = 100-50 = 50，maxHp=200 → 50/200=0.25 ≤ 0.3，首次触发 AP+3
      const result = monsterAttack(state, 'm1');
      expect(result.state.floorState.ap).toBe(13);
      expect(result.state.floorState.finalChargeAvailable).toBe(false);

      // 再次受击：finalChargeAvailable=false，不再触发
      const second = monsterAttack(result.state, 'm1');
      expect(second.state.floorState.ap).toBe(13);
    });
  });

  describe('强化池过滤（AC-405/406）', () => {
    it('stack 上限达到后该词条不再出现在候选池中', () => {
      const traits = Array(5).fill('marksman'); // ARCHER 射手精通 stack=5
      let everAppears = false;
      for (let seed = 1; seed <= 30; seed++) {
        const { choices } = rollChoices(seed, ARCHER_STRENGTHEN_POOL, traits);
        if (choices.includes('marksman')) everAppears = true;
      }
      expect(everAppears).toBe(false);
    });

    it('未拥有 ≥3 个基础/条件词条时，进阶词条不出现在候选池中', () => {
      let everAppears = false;
      for (let seed = 1; seed <= 30; seed++) {
        const { choices } = rollChoices(seed, BERSERKER_STRENGTHEN_POOL, []);
        if (choices.includes('berserker_resolve') || choices.includes('final_charge')) everAppears = true;
      }
      expect(everAppears).toBe(false);
    });

    it('拥有 ≥3 个基础/条件词条后，进阶词条可出现在候选池中', () => {
      const traits = ['life_steal', 'cleave', 'pain_tolerance']; // 均为 basic
      let everAppears = false;
      for (let seed = 1; seed <= 30; seed++) {
        const { choices } = rollChoices(seed, BERSERKER_STRENGTHEN_POOL, traits);
        if (choices.includes('berserker_resolve') || choices.includes('final_charge')) everAppears = true;
      }
      expect(everAppears).toBe(true);
    });

    it('oneShot 词条已选过后不再出现在候选池中', () => {
      const traits = ['undying'];
      let everAppears = false;
      for (let seed = 1; seed <= 30; seed++) {
        const { choices } = rollChoices(seed, BERSERKER_STRENGTHEN_POOL, traits);
        if (choices.includes('undying')) everAppears = true;
      }
      expect(everAppears).toBe(false);
    });
  });

  describe('跨端确定性（AC-13/407）', () => {
    it('同 seed + 同选择序列 → 同结果', () => {
      const run = () => {
        let state = makeExpeditionState({ playerOverrides: { classId: 'BERSERKER', hp: 200, maxHp: 200 } });
        const r1 = rollChoices(state.floorState.rngState, BERSERKER_STRENGTHEN_POOL, state.player.classTraits);
        state = { ...state, floorState: { ...state.floorState, rngState: r1.nextRngState } };
        let result = applyStrengthen(state, r1.choices[0]);
        const r2 = rollChoices(result.state.floorState.rngState, BERSERKER_STRENGTHEN_POOL, result.state.player.classTraits);
        result = { state: { ...result.state, floorState: { ...result.state.floorState, rngState: r2.nextRngState } }, events: [] };
        result = applyStrengthen(result.state, r2.choices[0]);
        return result.state.player;
      };

      expect(run()).toEqual(run());
    });
  });
});
