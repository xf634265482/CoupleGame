import {
  M1_STRENGTHEN_POOL,
  addAnima,
  applyStrengthen,
} from '../../assets/scripts/pve/core/AnimaSystem';
import { EMPTY_TREE_BONUSES } from '../../assets/scripts/pve/core/DestinyTreeSystem';
import { TREE_D3_ANIMA_GAIN_PCT } from '../../assets/scripts/pve/core/PveConstants';
import { makeExpeditionState } from './helpers';

describe('AnimaSystem — 灵气强化（AC-7）', () => {
  it('增加灵气未达 100 时仅累计进度，不触发强化', () => {
    const state = makeExpeditionState({ playerOverrides: { anima: 0, animaProgress: 30 } });
    const result = addAnima(state, 40);

    expect(result.state.player.anima).toBe(40);
    expect(result.state.player.animaProgress).toBe(70);
    expect(result.events).toEqual([]);
  });

  it('累计达到 100 时触发一次 3 选 1，产生 ANIMA_STRENGTHEN 事件且候选互不重复', () => {
    const state = makeExpeditionState({ playerOverrides: { anima: 0, animaProgress: 80 } });
    const result = addAnima(state, 30);

    expect(result.state.player.anima).toBe(30);
    expect(result.state.player.animaProgress).toBe(10);
    expect(result.events.length).toBe(1);

    const event = result.events[0];
    expect(event.type).toBe('ANIMA_STRENGTHEN');
    if (event.type === 'ANIMA_STRENGTHEN') {
      expect(event.choices.length).toBe(3);
      expect(new Set(event.choices).size).toBe(3);
      event.choices.forEach((c) => expect(M1_STRENGTHEN_POOL).toContain(c));
    }
  });

  it('一次性大额获取可连续触发多次强化', () => {
    const state = makeExpeditionState({ playerOverrides: { anima: 0, animaProgress: 0 } });
    const result = addAnima(state, 250);

    expect(result.state.player.anima).toBe(250);
    expect(result.state.player.animaProgress).toBe(50);
    expect(result.events.filter((e) => e.type === 'ANIMA_STRENGTHEN').length).toBe(2);
  });

  it('命运树 D3 灵脉共鸣：灵气获取额外 +10%（取整）', () => {
    const state = makeExpeditionState({
      playerOverrides: {
        anima: 0,
        animaProgress: 0,
        treeBonuses: { ...EMPTY_TREE_BONUSES, animaGainBonusPct: TREE_D3_ANIMA_GAIN_PCT },
      },
    });
    const result = addAnima(state, 10);
    expect(result.state.player.anima).toBe(Math.round(10 * (1 + TREE_D3_ANIMA_GAIN_PCT)));
  });

  it('增量为 0 或负数时为 no-op', () => {
    const state = makeExpeditionState({ playerOverrides: { anima: 10, animaProgress: 10 } });
    expect(addAnima(state, 0)).toEqual({ state, events: [] });
    expect(addAnima(state, -5)).toEqual({ state, events: [] });
  });

  it('rngState 推进且与重新生成结果一致（确定性，AC-13）', () => {
    const state = makeExpeditionState({ playerOverrides: { animaProgress: 90 } });
    const before = state.floorState.rngState;
    const a = addAnima(state, 20);
    const b = addAnima(state, 20);

    expect(a.state.floorState.rngState).not.toBe(before);
    expect(a).toEqual(b);
  });

  it('applyStrengthen 将所选词条计入 classTraits；数值型词条重复选择会叠加', () => {
    const state = makeExpeditionState();
    const first = applyStrengthen(state, 'strengthen_hp_up');
    expect(first.state.player.classTraits).toEqual(['strengthen_hp_up']);

    // strengthen_hp_up 为可叠加数值型词条：重复选择会再次生效（+40 maxHp/hp）
    const second = applyStrengthen(first.state, 'strengthen_hp_up');
    expect(second.state.player.classTraits).toEqual(['strengthen_hp_up', 'strengthen_hp_up']);
    expect(second.state.player.maxHp).toBe(first.state.player.maxHp + 40);
    expect(second.state.player.hp).toBe(first.state.player.hp + 40);

    const third = applyStrengthen(first.state, 'strengthen_attack_up');
    expect(third.state.player.classTraits).toEqual(['strengthen_hp_up', 'strengthen_attack_up']);
  });

  it('applyStrengthen 非数值型（开关型）词条重复选择为 no-op', () => {
    const state = makeExpeditionState();
    const first = applyStrengthen(state, 'eagle_eye');
    expect(first.state.player.classTraits).toEqual(['eagle_eye']);

    const second = applyStrengthen(first.state, 'eagle_eye');
    expect(second.state).toBe(first.state);
    expect(second.events).toEqual([]);
  });

  it('applyStrengthen 每次成功强化后 animaThreshold × 1.5（100→150→225）', () => {
    const state = makeExpeditionState();
    // 初始阈值：animaThreshold undefined → 等效 100
    const r1 = applyStrengthen(state, 'strengthen_hp_up');
    expect(r1.state.player.animaThreshold).toBe(150); // ceil(100 * 1.5)

    const r2 = applyStrengthen(r1.state, 'strengthen_attack_up');
    expect(r2.state.player.animaThreshold).toBe(225); // ceil(150 * 1.5)

    const r3 = applyStrengthen(r2.state, 'strengthen_ap_up');
    expect(r3.state.player.animaThreshold).toBe(338); // ceil(225 * 1.5)
  });

  it('addAnima 使用玩家当前 animaThreshold（阈值 150 需要 150 灵气才触发）', () => {
    // 模拟已触发一次（threshold=150）
    const state = makeExpeditionState({ playerOverrides: { animaProgress: 0, animaThreshold: 150 } });

    // 149 灵气不够触发
    const r1 = addAnima(state, 149);
    expect(r1.events.filter((e) => e.type === 'ANIMA_STRENGTHEN').length).toBe(0);
    expect(r1.state.player.animaProgress).toBe(149);

    // 150 灵气恰好触发
    const r2 = addAnima(state, 150);
    expect(r2.events.filter((e) => e.type === 'ANIMA_STRENGTHEN').length).toBe(1);
    expect(r2.state.player.animaProgress).toBe(0);
  });
});
