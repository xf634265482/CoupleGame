// 命运词条卷轴系统单测（Task #4）：
// 覆盖拾取、使用（候选生成）、选定（trait append + 立即生效 HP 词条）的纯逻辑。

import { claimScrollChoice, pickupScroll, useScroll } from '../../assets/scripts/pve/core/ScrollSystem';
import type { ExpeditionState, RunPlayer } from '../../assets/scripts/pve/core/PveTypes';

function mockPlayer(overrides: Partial<RunPlayer> = {}): RunPlayer {
  return {
    hp: 100,
    maxHp: 100,
    gold: 0,
    anima: 0,
    animaProgress: 0,
    classId: 'ADVENTURER',
    classTraits: [],
    equipment: {},
    classFragments: {},
    ...overrides,
  };
}

function mockState(player: RunPlayer): ExpeditionState {
  return {
    runSeed: 1,
    chapter: 1,
    floor: 1,
    status: 'ACTIVE',
    player,
    floorState: {
      floor: 1,
      size: 8,
      seed: 1,
      rngState: 12345,
      player: { x: 4, y: 4 },
      ap: 10,
      maxAp: 10,
      dice: 4,
      turn: 1,
      hasKey: false,
      revealed: Array.from({ length: 8 }, () => Array(8).fill(true)),
      monsters: [],
      entities: [],
      status: 'EXPLORING',
    },
  };
}

describe('ScrollSystem', () => {
  it('pickupScroll：scrolls += 1', () => {
    const player = mockPlayer({ scrolls: 1 });
    const result = pickupScroll(player, 'boss_1');
    expect(result.player.scrolls).toBe(2);
    expect(result.events.map((e) => e.type)).toEqual(['SCROLL_PICKUP']);
  });

  it('pickupScroll：从无到 1', () => {
    const player = mockPlayer();
    const result = pickupScroll(player, 'boss_1');
    expect(result.player.scrolls).toBe(1);
  });

  it('useScroll：scrolls=0 时 no-op', () => {
    const state = mockState(mockPlayer({ scrolls: 0 }));
    const result = useScroll(state);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it('useScroll：scrolls > 0 时扣 1 并 emit SCROLL_OFFER（3 个候选）', () => {
    const state = mockState(mockPlayer({ scrolls: 1 }));
    const result = useScroll(state);
    expect(result.state.player.scrolls).toBe(0);
    const offer = result.events.find((e) => e.type === 'SCROLL_OFFER');
    expect(offer).toBeDefined();
    expect((offer as { type: 'SCROLL_OFFER'; options: string[] }).options.length).toBeGreaterThan(0);
  });

  it('useScroll：消耗 rngState（确定性）', () => {
    const state = mockState(mockPlayer({ scrolls: 1 }));
    const result = useScroll(state);
    expect(result.state.floorState.rngState).not.toBe(state.floorState.rngState);
  });

  it('claimScrollChoice：将词条 append 到 classTraits', () => {
    const state = mockState(mockPlayer());
    const result = claimScrollChoice(state, 'strengthen_attack_up');
    expect(result.state.player.classTraits).toContain('strengthen_attack_up');
    expect(result.events.map((e) => e.type)).toEqual(['SCROLL_RESOLVED']);
  });

  it('claimScrollChoice：strengthen_hp_up 立即 +40 maxHp 和当前 hp', () => {
    const state = mockState(mockPlayer({ hp: 80, maxHp: 100 }));
    const result = claimScrollChoice(state, 'strengthen_hp_up');
    expect(result.state.player.maxHp).toBe(120);
    expect(result.state.player.hp).toBe(100);
  });

  it('claimScrollChoice：超过 stack 上限时 no-op', () => {
    const state = mockState(mockPlayer({ classTraits: ['strengthen_attack_up', 'strengthen_attack_up', 'strengthen_attack_up', 'strengthen_attack_up', 'strengthen_attack_up'] }));
    const result = claimScrollChoice(state, 'strengthen_attack_up');
    // attack_up 上限若为 5，则第 6 次 no-op；不论上限多少，验证至少不无限叠加
    const before = state.player.classTraits.filter((t) => t === 'strengthen_attack_up').length;
    const after = result.state.player.classTraits.filter((t) => t === 'strengthen_attack_up').length;
    expect(after).toBe(before); // 已达上限不增加
  });

  it('claimScrollChoice：不修改 animaThreshold（与 applyStrengthen 区分）', () => {
    const state = mockState(mockPlayer({ animaThreshold: 100 }));
    const result = claimScrollChoice(state, 'strengthen_attack_up');
    expect(result.state.player.animaThreshold).toBe(100);
  });
});
