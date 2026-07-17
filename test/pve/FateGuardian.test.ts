import {
  chooseDestinyRewrite,
  fateGuardianAttack,
  fateProphecyStep,
  isProphecyTurn,
  mirrorBehaviorStep,
  recordPlayerActionForMirror,
  resolveDestinyRewrite,
  tryCrossEnrageThreshold,
  tryCrossMirrorThreshold,
  tryOfferDestinyRewrite,
} from '../../assets/scripts/pve/core/bosses/FateGuardian';
import {
  BASE_ATTACK,
  DESTINY_ATK_BUFF_DURATION_TURNS,
  DESTINY_ATK_BUFF_PCT,
  DESTINY_HEAL_RATIO,
  DESTINY_REWRITE_INTERVAL,
  FATE_MIRROR_BOSS_ID,
  FATE_PROPHECY_INTERVAL,
} from '../../assets/scripts/pve/core/PveConstants';
import { makeExpeditionState, makeMonster } from './helpers';
import type { Coord, Monster } from '../../assets/scripts/pve/core/PveTypes';

function makeBossState(
  playerHp: number,
  playerMaxHp = 200,
  turn = 1,
  fateProphecy?: { center: Coord },
) {
  return makeExpeditionState({
    chapter: 5,
    floorOverrides: {
      player: { x: 4, y: 4 },
      ap: 10,
      turn,
      monsters: [
        makeMonster('boss', { x: 4, y: 5 }, {
          type: 'BOSS',
          bossId: 'FATE_GUARDIAN',
          hp: 1200,
          maxHp: 1200,
          attack: 30,
          range: 1,
          aggroRadius: 99,
        }),
      ],
      ...(fateProphecy ? { fateProphecy } : {}),
    },
    playerOverrides: { hp: playerHp, maxHp: playerMaxHp },
  });
}

describe('FateGuardian', () => {
  describe('fateGuardianAttack — 高血双倍（保留）', () => {
    it('玩家 HP > 50% 时造成 2 倍有效伤害', () => {
      const state = makeBossState(200, 200); // HP = 100%
      const result = fateGuardianAttack(state, 'boss');
      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged && damaged.type === 'PLAYER_DAMAGED' ? damaged.damage : 0).toBe(60);
    });

    it('玩家 HP ≤ 50% 时造成普通伤害', () => {
      const state = makeBossState(100, 200); // HP = 50%
      const result = fateGuardianAttack(state, 'boss');
      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged && damaged.type === 'PLAYER_DAMAGED' ? damaged.damage : 0).toBe(30);
    });
  });

  describe('命运预言（反风筝，替代随机闪避）', () => {
    it(`isProphecyTurn 每 ${FATE_PROPHECY_INTERVAL} 回合触发`, () => {
      expect(isProphecyTurn(0)).toBe(false);
      expect(isProphecyTurn(FATE_PROPHECY_INTERVAL)).toBe(true);
      expect(isProphecyTurn(FATE_PROPHECY_INTERVAL * 2)).toBe(true);
      expect(isProphecyTurn(FATE_PROPHECY_INTERVAL + 1)).toBe(false);
    });

    it('预言回合无待定预言 → 标记玩家当前格（PROPHECY_MARKED + 写入 fateProphecy）', () => {
      const state = makeBossState(200, 200, FATE_PROPHECY_INTERVAL);
      const result = fateProphecyStep(state, 'boss');
      expect(result.events).toEqual([{ type: 'PROPHECY_MARKED', center: { x: 4, y: 4 } }]);
      expect(result.state.floorState.fateProphecy).toEqual({ center: { x: 4, y: 4 } });
    });

    it('存在待定预言且玩家仍在 3×3 内 → 结算 attack×1 伤害 + PROPHECY_RESOLVED，清空预言', () => {
      // 修复后：只有下一个 isProphecyTurn（INTERVAL * 2）才结算，而非 INTERVAL+1
      const state = makeBossState(200, 200, FATE_PROPHECY_INTERVAL * 2, { center: { x: 4, y: 4 } });
      const result = fateProphecyStep(state, 'boss');
      expect(result.events.some((e) => e.type === 'PROPHECY_RESOLVED')).toBe(true);
      const dmg = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(dmg && dmg.type === 'PLAYER_DAMAGED' ? dmg.damage : 0).toBe(30); // 30 × 1.0
      expect(result.state.player.hp).toBe(170);
      expect(result.state.floorState.fateProphecy).toBeUndefined();
    });

    it('结算时玩家已走出 3×3 → 仅 PROPHECY_RESOLVED，无伤害', () => {
      // 修复后：只有下一个 isProphecyTurn（INTERVAL * 2）才结算，而非 INTERVAL+1
      const state = makeBossState(200, 200, FATE_PROPHECY_INTERVAL * 2, { center: { x: 0, y: 0 } });
      const result = fateProphecyStep(state, 'boss');
      expect(result.events).toEqual([{ type: 'PROPHECY_RESOLVED', center: { x: 0, y: 0 } }]);
      expect(result.state.player.hp).toBe(200);
      expect(result.state.floorState.fateProphecy).toBeUndefined();
    });

    it('非预言回合且无待定预言 → no-op', () => {
      const state = makeBossState(200, 200, 1);
      const result = fateProphecyStep(state, 'boss');
      expect(result.events).toEqual([]);
      expect(result.state.floorState.fateProphecy).toBeUndefined();
    });

    it('狂暴态（boss.enraged=true）→ fateProphecyStep 直接 noop', () => {
      const state = makeBossState(200, 200, FATE_PROPHECY_INTERVAL);
      const stateWithEnrage = {
        ...state,
        floorState: {
          ...state.floorState,
          monsters: state.floorState.monsters.map((m) =>
            m.id === 'boss' ? { ...m, enraged: true, enrageTurn: 1 } : m,
          ),
        },
      };
      const result = fateProphecyStep(stateWithEnrage, 'boss');
      expect(result.events).toEqual([]);
      expect(result.state.floorState.fateProphecy).toBeUndefined();
    });
  });

  describe('行为镜像生成（HP 跨 50%）', () => {
    function makeBossWithHp(hp: number, maxHp = 1200): Monster {
      return {
        id: 'boss', type: 'BOSS' as const, bossId: 'FATE_GUARDIAN', pos: { x: 4, y: 5 },
        hp, maxHp, attack: 30, range: 1, aggroRadius: 99, aiState: 'CHASE' as const,
      };
    }

    it('Boss HP > 50% → tryCrossMirrorThreshold noop', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: {
          size: 10, player: { x: 0, y: 0 }, ap: 10,
          monsters: [makeBossWithHp(700)], // 700/1200 ≈ 58%
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });
      const result = tryCrossMirrorThreshold(state, 'boss');
      expect(result.events).toHaveLength(0);
      expect(result.state.floorState.monsters.some((m) => m.bossId === FATE_MIRROR_BOSS_ID)).toBe(false);
    });

    it('Boss HP ≤ 50% 且未生成过 → 在相邻空格生成镜像，HP/atk = 玩家快照 × 0.5', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: {
          size: 10, player: { x: 0, y: 0 }, ap: 10,
          monsters: [makeBossWithHp(500)], // 41%
        },
        playerOverrides: { hp: 200, maxHp: 200, classId: 'ADVENTURER' },
      });
      const result = tryCrossMirrorThreshold(state, 'boss');
      expect(result.events.some((e) => e.type === 'MIRROR_SPAWNED')).toBe(true);
      const mirror = result.state.floorState.monsters.find((m) => m.bossId === FATE_MIRROR_BOSS_ID);
      expect(mirror).toBeDefined();
      expect(mirror!.hp).toBe(100); // 200 × 0.5
      expect(mirror!.maxHp).toBe(100);
      // ADVENTURER 映射战士面板攻击 13；镜像 = round(13 × 0.5)
      expect(mirror!.attack).toBe(Math.round(13 * 0.5));
      // boss.mirrorSpawned 标记
      expect(result.state.floorState.monsters.find((m) => m.id === 'boss')!.mirrorSpawned).toBe(true);
    });

    it('已生成过镜像（boss.mirrorSpawned=true）→ 即使 HP ≤ 50% 也不再生成', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: {
          size: 10, player: { x: 0, y: 0 }, ap: 10,
          monsters: [{ ...makeBossWithHp(500), mirrorSpawned: true }],
        },
      });
      const result = tryCrossMirrorThreshold(state, 'boss');
      expect(result.events).toHaveLength(0);
      expect(result.state.floorState.monsters.some((m) => m.bossId === FATE_MIRROR_BOSS_ID)).toBe(false);
    });
  });

  describe('行为镜像 — recordPlayerActionForMirror（ATTACK > MOVE > IDLE 优先级）', () => {
    function mirrorOnFloor(): Monster {
      return {
        id: 'mirror_1', type: 'BOSS' as const, bossId: FATE_MIRROR_BOSS_ID, pos: { x: 3, y: 3 },
        hp: 100, maxHp: 100, attack: 20, range: 1, aggroRadius: 99, aiState: 'CHASE' as const,
      };
    }

    it('玩家本回合攻击过 → 镜像写入 ATTACK', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: { size: 10, player: { x: 5, y: 5 }, monsters: [mirrorOnFloor()] },
      });
      const result = recordPlayerActionForMirror(state, true, 2);
      const mirror = result.state.floorState.monsters.find((m) => m.id === 'mirror_1');
      expect(mirror!.pendingBehavior).toEqual({ action: 'ATTACK', distance: 0 });
    });

    it('玩家未攻击但移动了 2 格 → 镜像写入 MOVE distance=2', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: { size: 10, player: { x: 5, y: 5 }, monsters: [mirrorOnFloor()] },
      });
      const result = recordPlayerActionForMirror(state, false, 2);
      const mirror = result.state.floorState.monsters.find((m) => m.id === 'mirror_1');
      expect(mirror!.pendingBehavior).toEqual({ action: 'MOVE', distance: 2 });
    });

    it('玩家未攻击未移动 → 镜像写入 IDLE', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: { size: 10, player: { x: 5, y: 5 }, monsters: [mirrorOnFloor()] },
      });
      const result = recordPlayerActionForMirror(state, false, 0);
      const mirror = result.state.floorState.monsters.find((m) => m.id === 'mirror_1');
      expect(mirror!.pendingBehavior).toEqual({ action: 'IDLE', distance: 0 });
    });

    it('无活镜像 → noop', () => {
      const state = makeExpeditionState({ chapter: 5, floorOverrides: { size: 10, monsters: [] } });
      const result = recordPlayerActionForMirror(state, true, 1);
      expect(result.events).toHaveLength(0);
    });
  });

  describe('行为镜像 — mirrorBehaviorStep 执行', () => {
    function stateWithMirror(
      pendingBehavior: { action: 'ATTACK' | 'MOVE' | 'IDLE'; distance: number },
      mirrorPos: Coord,
      playerPos: Coord,
      shieldStacks?: 0 | 1,
    ) {
      return makeExpeditionState({
        chapter: 5,
        floorOverrides: {
          size: 10,
          player: playerPos,
          monsters: [{
            id: 'mirror_1', type: 'BOSS' as const, bossId: FATE_MIRROR_BOSS_ID, pos: mirrorPos,
            hp: 100, maxHp: 100, attack: 30, range: 1, aggroRadius: 99, aiState: 'CHASE' as const,
            pendingBehavior, shieldStacks,
          }],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });
    }

    it('ATTACK + 曼哈顿距离 1 → 命中（MIRROR_ATTACKED hit:true）+ 玩家扣血', () => {
      const state = stateWithMirror({ action: 'ATTACK', distance: 0 }, { x: 5, y: 5 }, { x: 5, y: 6 });
      const result = mirrorBehaviorStep(state, 'mirror_1');
      const attacked = result.events.find((e) => e.type === 'MIRROR_ATTACKED');
      expect(attacked && attacked.type === 'MIRROR_ATTACKED' ? attacked.hit : false).toBe(true);
      expect(result.state.player.hp).toBeLessThan(200);
    });

    it('ATTACK + 曼哈顿距离 2 → 命中', () => {
      const state = stateWithMirror({ action: 'ATTACK', distance: 0 }, { x: 5, y: 5 }, { x: 5, y: 7 });
      const result = mirrorBehaviorStep(state, 'mirror_1');
      const attacked = result.events.find((e) => e.type === 'MIRROR_ATTACKED');
      expect(attacked && attacked.type === 'MIRROR_ATTACKED' ? attacked.hit : false).toBe(true);
    });

    it('ATTACK + 曼哈顿距离 3 → 空挥（hit:false）+ 玩家 HP 不变', () => {
      const state = stateWithMirror({ action: 'ATTACK', distance: 0 }, { x: 5, y: 5 }, { x: 5, y: 8 });
      const result = mirrorBehaviorStep(state, 'mirror_1');
      const attacked = result.events.find((e) => e.type === 'MIRROR_ATTACKED');
      expect(attacked && attacked.type === 'MIRROR_ATTACKED' ? attacked.hit : true).toBe(false);
      expect(result.state.player.hp).toBe(200);
    });

    it('MOVE distance=2 → 朝玩家最短路径推进 2 格', () => {
      const state = stateWithMirror({ action: 'MOVE', distance: 2 }, { x: 0, y: 0 }, { x: 5, y: 0 });
      const result = mirrorBehaviorStep(state, 'mirror_1');
      const moves = result.events.filter((e) => e.type === 'MIRROR_MOVED');
      expect(moves.length).toBe(2);
      const mirror = result.state.floorState.monsters.find((m) => m.id === 'mirror_1');
      expect(mirror!.pos.x).toBe(2);
    });

    it('IDLE → 获得 1 层护盾（MIRROR_SHIELDED）', () => {
      const state = stateWithMirror({ action: 'IDLE', distance: 0 }, { x: 5, y: 5 }, { x: 0, y: 0 });
      const result = mirrorBehaviorStep(state, 'mirror_1');
      expect(result.events.some((e) => e.type === 'MIRROR_SHIELDED')).toBe(true);
      const mirror = result.state.floorState.monsters.find((m) => m.id === 'mirror_1');
      expect(mirror!.shieldStacks).toBe(1);
    });

    it('IDLE + 已有护盾 → 不重复 emit', () => {
      const state = stateWithMirror({ action: 'IDLE', distance: 0 }, { x: 5, y: 5 }, { x: 0, y: 0 }, 1);
      const result = mirrorBehaviorStep(state, 'mirror_1');
      expect(result.events.some((e) => e.type === 'MIRROR_SHIELDED')).toBe(false);
      const mirror = result.state.floorState.monsters.find((m) => m.id === 'mirror_1');
      expect(mirror!.shieldStacks).toBe(1);
    });

    it('执行后清空 pendingBehavior', () => {
      const state = stateWithMirror({ action: 'IDLE', distance: 0 }, { x: 5, y: 5 }, { x: 0, y: 0 });
      const result = mirrorBehaviorStep(state, 'mirror_1');
      const mirror = result.state.floorState.monsters.find((m) => m.id === 'mirror_1');
      expect(mirror!.pendingBehavior).toBeUndefined();
    });
  });

  describe('狂暴跨阈值（HP 跨 30%）', () => {
    function bossWithHp(hp: number, overrides: Partial<Monster> = {}): Monster {
      return {
        id: 'boss', type: 'BOSS' as const, bossId: 'FATE_GUARDIAN', pos: { x: 4, y: 5 },
        hp, maxHp: 1200, attack: 30, range: 1, aggroRadius: 99, aiState: 'CHASE' as const,
        ...overrides,
      };
    }

    it('HP > 30% → tryCrossEnrageThreshold noop', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: { size: 10, monsters: [bossWithHp(400)] }, // 33%
      });
      const result = tryCrossEnrageThreshold(state, 'boss');
      expect(result.state.floorState.monsters.find((m) => m.id === 'boss')!.enraged).toBeUndefined();
    });

    it('HP ≤ 30% → 写 enraged + enrageTurn + 清 fateProphecy', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: {
          size: 10, turn: 7, monsters: [bossWithHp(300)],
          fateProphecy: { center: { x: 4, y: 4 } },
        },
      });
      const result = tryCrossEnrageThreshold(state, 'boss');
      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss')!;
      expect(boss.enraged).toBe(true);
      expect(boss.enrageTurn).toBe(7);
      expect(result.state.floorState.fateProphecy).toBeUndefined();
    });

    it('已狂暴 → noop', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: { size: 10, monsters: [bossWithHp(300, { enraged: true, enrageTurn: 5 })] },
      });
      const result = tryCrossEnrageThreshold(state, 'boss');
      expect(result.state).toBe(state);
    });
  });

  describe('改写命运 — tryOfferDestinyRewrite + chooseDestinyRewrite', () => {
    function enragedBoss(turn: number): Monster {
      return {
        id: 'boss', type: 'BOSS' as const, bossId: 'FATE_GUARDIAN', pos: { x: 4, y: 5 },
        hp: 300, maxHp: 1200, attack: 30, range: 1, aggroRadius: 99, aiState: 'CHASE' as const,
        enraged: true, enrageTurn: turn,
      };
    }

    it('非狂暴 → noop', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: { size: 10, turn: 5, monsters: [{ ...enragedBoss(5), enraged: false }] },
      });
      const result = tryOfferDestinyRewrite(state, 'boss');
      expect(result.events).toHaveLength(0);
    });

    it('狂暴 + 周期到位 (turnsSinceEnrage % INTERVAL === 0) → 抽 3 + emit DESTINY_REWRITE_OFFERED', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: { size: 10, turn: 5, monsters: [enragedBoss(5)] },
      });
      const result = tryOfferDestinyRewrite(state, 'boss');
      const offered = result.events.find((e) => e.type === 'DESTINY_REWRITE_OFFERED');
      expect(offered).toBeDefined();
      if (offered && offered.type === 'DESTINY_REWRITE_OFFERED') {
        expect(offered.drawn).toHaveLength(3);
        // 3 个事件均在 1..5 内且不重复
        const set = new Set(offered.drawn);
        expect(set.size).toBe(3);
        offered.drawn.forEach((id) => expect(id >= 1 && id <= 5).toBe(true));
      }
      expect(result.state.floorState.pendingDestinyRewrite).toBeDefined();
      expect(result.state.floorState.pendingDestinyRewrite!.removed).toBeNull();
    });

    it('狂暴 + 周期不到位 → noop', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: { size: 10, turn: 6, monsters: [enragedBoss(5)] },
      });
      const result = tryOfferDestinyRewrite(state, 'boss');
      expect(result.events).toHaveLength(0);
    });

    it('已有 pending 时 → 不覆盖', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: {
          size: 10, turn: 5, monsters: [enragedBoss(5)],
          pendingDestinyRewrite: { drawn: [1, 2, 3], removed: null, offeredAtTurn: 5 },
        },
      });
      const result = tryOfferDestinyRewrite(state, 'boss');
      expect(result.events).toHaveLength(0);
    });

    it('chooseDestinyRewrite 写 removed', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: {
          size: 10,
          pendingDestinyRewrite: { drawn: [1, 2, 3], removed: null, offeredAtTurn: 5 },
        },
      });
      const result = chooseDestinyRewrite(state, 1);
      expect(result.state.floorState.pendingDestinyRewrite!.removed).toBe(1);
      expect(result.events).toEqual([{ type: 'DESTINY_REWRITE_CHOSEN', removedIndex: 1 }]);
    });
  });

  describe('改写命运 — resolveDestinyRewrite 结算顺序', () => {
    function setupResolve(drawn: [number, number, number], removed: 0 | 1 | 2, bossPos = { x: 5, y: 5 }, playerPos = { x: 5, y: 6 }) {
      return makeExpeditionState({
        chapter: 5,
        floorOverrides: {
          size: 10, turn: 8, player: playerPos,
          monsters: [{
            id: 'boss', type: 'BOSS' as const, bossId: 'FATE_GUARDIAN', pos: bossPos,
            hp: 200, maxHp: 1200, attack: 100, range: 1, aggroRadius: 99, aiState: 'CHASE' as const,
            enraged: true, enrageTurn: 5,
          }],
          pendingDestinyRewrite: { drawn, removed, offeredAtTurn: 5 },
        },
        playerOverrides: { hp: 500, maxHp: 500 },
      });
    }

    it('E3 + E4：玩家在 5×5 内 → 同时扣两轮伤害', () => {
      // drawn=[3,4,5], 弃 5 → 剩 3+4
      const state = setupResolve([3, 4, 5], 2);
      const result = resolveDestinyRewrite(state, 'boss');
      // E4 5×5：玩家在 (5,6)、Boss 在 (5,5)，切比雪夫=1 ≤ 2 命中，伤害 = 100 × 1.2 = 120
      // E3：固定 100 × 1.0 = 100
      // 玩家初始 500 - 120 - 100 = 280
      expect(result.state.player.hp).toBe(280);
      expect(result.events.some((e) => e.type === 'DESTINY_5X5_EXPLODED')).toBe(true);
      expect(result.events.some((e) => e.type === 'DESTINY_DIRECT_DAMAGE')).toBe(true);
    });

    it('E4 玩家在 5×5 外 → 无伤害但仍 emit DESTINY_5X5_EXPLODED 供渲染', () => {
      // drawn=[4,1,2], 弃 1（即 1） → 剩 4+2
      const state = setupResolve([4, 1, 2], 1, { x: 5, y: 5 }, { x: 0, y: 0 }); // 切比雪夫=5 > 2
      const result = resolveDestinyRewrite(state, 'boss');
      const explode = result.events.find((e) => e.type === 'DESTINY_5X5_EXPLODED');
      expect(explode && explode.type === 'DESTINY_5X5_EXPLODED' ? explode.damage : -1).toBe(0);
      expect(result.state.player.hp).toBe(500); // 未掉血
    });

    it('E1 Boss 回血 = maxHp × DESTINY_HEAL_RATIO', () => {
      // drawn=[1,5,3], 弃 5（idx=1） → 剩 1+3
      const state = setupResolve([1, 5, 3], 1);
      const result = resolveDestinyRewrite(state, 'boss');
      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss')!;
      expect(boss.hp).toBe(200 + Math.round(1200 * DESTINY_HEAL_RATIO));
    });

    it('E2 写入 attackBuffPct + expiresAtTurn', () => {
      // drawn=[2,1,4], 弃 4 → 剩 2+1
      const state = setupResolve([2, 1, 4], 2);
      const result = resolveDestinyRewrite(state, 'boss');
      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss')!;
      expect(boss.attackBuffPct).toBe(DESTINY_ATK_BUFF_PCT);
      expect(boss.attackBuffExpiresAtTurn).toBe(8 + DESTINY_ATK_BUFF_DURATION_TURNS);
    });

    it('E5 写入 destinyLockNextTurn', () => {
      // drawn=[5,1,3], 弃 1（idx=1） → 剩 5+3
      const state = setupResolve([5, 1, 3], 1);
      const result = resolveDestinyRewrite(state, 'boss');
      expect(result.state.floorState.destinyLockNextTurn).toBe(true);
    });

    it('结算后清空 pendingDestinyRewrite + emit DESTINY_REWRITE_RESOLVED', () => {
      const state = setupResolve([1, 2, 3], 0);
      const result = resolveDestinyRewrite(state, 'boss');
      expect(result.state.floorState.pendingDestinyRewrite).toBeUndefined();
      const resolved = result.events.find((e) => e.type === 'DESTINY_REWRITE_RESOLVED');
      expect(resolved).toBeDefined();
    });

    it('E3+E2 同回合：E3 用 buff 前的 attack（buff 不影响本次扣血）', () => {
      // drawn=[3,2,5], 弃 5（idx=2） → 剩 3+2
      // E2 写入 buff（影响下回合起），E3 用 boss.attack=100 算伤害（×1.0=100）
      // 玩家 HP 500 - 100 = 400
      const state = setupResolve([3, 2, 5], 2);
      const result = resolveDestinyRewrite(state, 'boss');
      expect(result.state.player.hp).toBe(400);
    });

    it('removed=null → noop（未选不结算）', () => {
      const state = makeExpeditionState({
        chapter: 5,
        floorOverrides: {
          size: 10, turn: 8,
          monsters: [{
            id: 'boss', type: 'BOSS' as const, bossId: 'FATE_GUARDIAN', pos: { x: 5, y: 5 },
            hp: 200, maxHp: 1200, attack: 100, range: 1, aggroRadius: 99, aiState: 'CHASE' as const,
            enraged: true, enrageTurn: 5,
          }],
          pendingDestinyRewrite: { drawn: [1, 2, 3], removed: null, offeredAtTurn: 5 },
        },
      });
      const result = resolveDestinyRewrite(state, 'boss');
      expect(result.events).toHaveLength(0);
      expect(result.state.floorState.pendingDestinyRewrite).toBeDefined();
    });
  });

  describe('fateGuardianAttack 吃 E2 attackBuffPct', () => {
    it('attackBuffPct=30 未过期 → 普攻伤害 × 1.3（叠加高血量×2）', () => {
      const state = makeBossState(200, 200); // 玩家 HP=100% → ×2
      const stateWithBuff = {
        ...state,
        floorState: {
          ...state.floorState,
          turn: 5,
          monsters: state.floorState.monsters.map((m) =>
            m.id === 'boss' ? { ...m, attackBuffPct: 30, attackBuffExpiresAtTurn: 10 } : m,
          ),
        },
      };
      const result = fateGuardianAttack(stateWithBuff, 'boss');
      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      // boss.attack=30，最终 = round(30 × 2 × 1.3) = 78
      expect(damaged && damaged.type === 'PLAYER_DAMAGED' ? damaged.damage : 0).toBe(78);
    });

    it('attackBuffPct 已过期 → 不吃 buff', () => {
      const state = makeBossState(200, 200);
      const stateWithExpiredBuff = {
        ...state,
        floorState: {
          ...state.floorState,
          turn: 11,
          monsters: state.floorState.monsters.map((m) =>
            m.id === 'boss' ? { ...m, attackBuffPct: 30, attackBuffExpiresAtTurn: 10 } : m,
          ),
        },
      };
      const result = fateGuardianAttack(stateWithExpiredBuff, 'boss');
      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged && damaged.type === 'PLAYER_DAMAGED' ? damaged.damage : 0).toBe(60); // 高血量×2，无 buff
    });
  });
});
