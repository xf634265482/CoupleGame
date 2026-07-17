import { addAnima } from '../../assets/scripts/pve/core/AnimaSystem';
import { makeExpeditionState } from './helpers';

describe('AnimaSystem — 灵气资源（旧三选一已退役）', () => {
  it('永久逐层模式 addAnima 为 no-op', () => {
    const state = makeExpeditionState({ playerOverrides: { anima: 0, animaProgress: 90 } });
    state.persistentFloorMode = true;
    const result = addAnima(state, 50);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it('非永久模式仅累加灵气与进度，不 emit 事件', () => {
    const state = makeExpeditionState({ playerOverrides: { anima: 0, animaProgress: 30 } });
    const result = addAnima(state, 40);

    expect(result.state.player.anima).toBe(40);
    expect(result.state.player.animaProgress).toBe(70);
    expect(result.events).toEqual([]);
  });

  it('大额获取只累加灵气资源', () => {
    const state = makeExpeditionState({ playerOverrides: { anima: 0, animaProgress: 0 } });
    const result = addAnima(state, 250);

    expect(result.state.player.anima).toBe(250);
    expect(result.state.player.animaProgress).toBe(250);
    expect(result.events).toEqual([]);
  });

  it('增量为 0 或负数时为 no-op', () => {
    const state = makeExpeditionState({ playerOverrides: { anima: 10, animaProgress: 10 } });
    expect(addAnima(state, 0)).toEqual({ state, events: [] });
    expect(addAnima(state, -5)).toEqual({ state, events: [] });
  });

  it('addAnima 不推进 rngState（无随机抽选）', () => {
    const state = makeExpeditionState({ playerOverrides: { animaProgress: 90 } });
    const before = state.floorState.rngState;
    const result = addAnima(state, 20);
    expect(result.state.floorState.rngState).toBe(before);
  });
});
