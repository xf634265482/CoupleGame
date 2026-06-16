// 遗物系统纯函数单测（Task #3 验证 + Task #8 起步）：
// 覆盖 5 件遗物的核心 hook 函数；不涉及战斗系统集成（集成验证在 LootSystem/CombatSystem 测试中）。

import {
  CHIEF_ROAR_DAMAGE_MULT,
  FATE_ECHO_REVIVE_HP_PCT,
  MAGMA_HEART_REFLECT_PCT,
  PERMAFROST_CORE_FREEZE_ROUNDS,
  PERMAFROST_CORE_STEPS,
  QUICKSAND_HEART_ATTACK_BONUS,
  QUICKSAND_HEART_PIT_COUNT,
  applyFreezeToMonsters,
  pickupRelic,
  playerHasRelic,
  relicComputeAttackBonus,
  relicOnHitTarget,
  relicOnKill,
  relicOnMoveStep,
  relicOnNewFloor,
  relicReflectDamage,
  relicTryRevive,
} from '../../assets/scripts/pve/core/RelicSystem';
import type { ExpeditionState, RelicId, RunPlayer } from '../../assets/scripts/pve/core/PveTypes';

function mockPlayer(relics: RelicId[] = []): RunPlayer {
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
    relics,
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

describe('RelicSystem - pickup & codex', () => {
  it('首次拾取：append 到 player.relics 且解锁图鉴', () => {
    const player = mockPlayer();
    const result = pickupRelic(player, 'CHIEF_ROAR', 'boss_1');
    expect(result.player.relics).toEqual(['CHIEF_ROAR']);
    expect(result.player.codexRelics).toEqual(['CHIEF_ROAR']);
    expect(result.events.map((e) => e.type)).toEqual(['RELIC_PICKUP', 'CODEX_RELIC_UNLOCKED']);
  });

  it('重复拾取（已在图鉴）：不重复解锁图鉴', () => {
    const player = { ...mockPlayer(['CHIEF_ROAR']), codexRelics: ['CHIEF_ROAR' as const] };
    const result = pickupRelic(player, 'CHIEF_ROAR', 'boss_1');
    expect(result.player.relics).toEqual(['CHIEF_ROAR']);
    expect(result.player.codexRelics).toEqual(['CHIEF_ROAR']);
    expect(result.events.map((e) => e.type)).toEqual(['RELIC_PICKUP']);
  });
});

describe('RelicSystem - CHIEF_ROAR', () => {
  it('击杀后 pending=true', () => {
    const player = mockPlayer(['CHIEF_ROAR']);
    const { nextPlayer } = relicOnKill(player);
    expect(nextPlayer.relicState?.chiefRoarPending).toBe(true);
  });

  it('未持有遗物时 onKill 无效', () => {
    const player = mockPlayer();
    const { nextPlayer } = relicOnKill(player);
    expect(nextPlayer.relicState).toBeUndefined();
  });

  it('pending 时下次普攻 +50%（消费 pending）', () => {
    const player = mockPlayer(['CHIEF_ROAR']);
    const withPending = relicOnKill(player).nextPlayer;
    const state = mockState(withPending);
    const baseDamage = 40;
    const result = relicComputeAttackBonus(state, baseDamage);
    expect(result.bonus).toBe(Math.round(baseDamage * (CHIEF_ROAR_DAMAGE_MULT - 1.0)));
    expect(result.nextPlayer.relicState?.chiefRoarPending).toBe(false);
    expect(result.events.length).toBe(1);
  });
});

describe('RelicSystem - QUICKSAND_HEART', () => {
  it('未站沙坑时无加成', () => {
    const player = mockPlayer(['QUICKSAND_HEART']);
    const state = mockState(player);
    const result = relicComputeAttackBonus(state, 40);
    expect(result.bonus).toBe(0);
  });

  it('站沙坑时 +10', () => {
    const player = mockPlayer(['QUICKSAND_HEART']);
    const state = mockState(player);
    state.floorState.entities = [
      { id: 'sand_1', type: 'SAND_PIT', pos: { x: 4, y: 4 }, consumed: false },
    ];
    const result = relicComputeAttackBonus(state, 40);
    expect(result.bonus).toBe(QUICKSAND_HEART_ATTACK_BONUS);
  });

  it('relicOnNewFloor 生成 N 格沙坑', () => {
    const player = mockPlayer(['QUICKSAND_HEART']);
    const state = mockState(player);
    const result = relicOnNewFloor(state);
    const newPits = result.state.floorState.entities.filter((e) => e.type === 'SAND_PIT');
    expect(newPits.length).toBe(QUICKSAND_HEART_PIT_COUNT);
    expect(result.events.find((e) => e.type === 'SAND_TIDE_SPAWNED')).toBeDefined();
  });

  it('未持有遗物：relicOnNewFloor 不生成沙坑', () => {
    const player = mockPlayer();
    const state = mockState(player);
    const result = relicOnNewFloor(state);
    expect(result.state.floorState.entities.length).toBe(0);
    expect(result.events).toEqual([]);
  });
});

describe('RelicSystem - PERMAFROST_CORE', () => {
  it(`每 ${PERMAFROST_CORE_STEPS} 步置 pending=true 并归零`, () => {
    let player = mockPlayer(['PERMAFROST_CORE']);
    for (let i = 0; i < PERMAFROST_CORE_STEPS - 1; i++) {
      player = relicOnMoveStep(player).nextPlayer;
    }
    expect(player.relicState?.permafrostSteps).toBe(PERMAFROST_CORE_STEPS - 1);
    expect(player.relicState?.permafrostPending).toBeFalsy();

    const finalStep = relicOnMoveStep(player);
    expect(finalStep.nextPlayer.relicState?.permafrostSteps).toBe(0);
    expect(finalStep.nextPlayer.relicState?.permafrostPending).toBe(true);
    expect(finalStep.events.length).toBe(1);
  });

  it('pending 时 onHitTarget 返回冰冻目标并清除 pending', () => {
    const player = { ...mockPlayer(['PERMAFROST_CORE']), relicState: { permafrostPending: true } };
    const result = relicOnHitTarget(player, 'monster_x');
    expect(result.freezeTargetId).toBe('monster_x');
    expect(result.nextPlayer.relicState?.permafrostPending).toBe(false);
  });

  it('applyFreezeToMonsters 设置 frozenRounds', () => {
    const monsters = [
      { id: 'm1', type: 'NORMAL' as const, pos: { x: 0, y: 0 }, hp: 30, maxHp: 30, attack: 10, range: 1, aggroRadius: 3, aiState: 'IDLE' as const },
      { id: 'm2', type: 'NORMAL' as const, pos: { x: 0, y: 1 }, hp: 30, maxHp: 30, attack: 10, range: 1, aggroRadius: 3, aiState: 'IDLE' as const },
    ];
    const updated = applyFreezeToMonsters(monsters, 'm1');
    expect(updated[0].frozenRounds).toBe(PERMAFROST_CORE_FREEZE_ROUNDS);
    expect(updated[1].frozenRounds).toBeUndefined();
  });
});

describe('RelicSystem - MAGMA_HEART', () => {
  it('反弹 30%（向上取整，最低 1）', () => {
    const player = mockPlayer(['MAGMA_HEART']);
    expect(relicReflectDamage(player, 30)).toBe(Math.ceil(30 * MAGMA_HEART_REFLECT_PCT));
    expect(relicReflectDamage(player, 1)).toBe(1);
    expect(relicReflectDamage(player, 0)).toBe(0);
  });

  it('未持有遗物时不反弹', () => {
    const player = mockPlayer();
    expect(relicReflectDamage(player, 100)).toBe(0);
  });
});

describe('RelicSystem - FATE_ECHO', () => {
  it('首次致死兜底回 30% maxHp', () => {
    const player = mockPlayer(['FATE_ECHO']);
    const result = relicTryRevive(player);
    expect(result.revived).toBe(true);
    expect(result.restoredHp).toBe(Math.round(player.maxHp * FATE_ECHO_REVIVE_HP_PCT));
    expect(result.nextPlayer.relicState?.fateEchoUsed).toBe(true);
  });

  it('再次致死不触发', () => {
    const player = { ...mockPlayer(['FATE_ECHO']), relicState: { fateEchoUsed: true } };
    const result = relicTryRevive(player);
    expect(result.revived).toBe(false);
  });
});

describe('playerHasRelic', () => {
  it('正确识别持有/未持有', () => {
    expect(playerHasRelic(mockPlayer(['CHIEF_ROAR']), 'CHIEF_ROAR')).toBe(true);
    expect(playerHasRelic(mockPlayer(['CHIEF_ROAR']), 'FATE_ECHO')).toBe(false);
    expect(playerHasRelic(mockPlayer(), 'CHIEF_ROAR')).toBe(false);
  });
});
