import { frostGiantAttack, isFreezeAttackTurn, stepFrostGiant } from '../../assets/scripts/pve/core/bosses/FrostGiant';
import { applyMove } from '../../assets/scripts/pve/core/MovementSystem';
import { attackIceWall, playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { endTurn } from '../../assets/scripts/pve/core/ExpeditionState';
import {
  CHAPTER3_ICE_WALL_HP,
  FROST_GIANT_CHARGE_DAMAGE_MULT,
  FROST_GIANT_CHILL_STACKS_TO_FREEZE,
  FROST_GIANT_ENRAGE_HP_RATIO,
  FROST_GIANT_FREEZE_ATTACKS_TO_BREAK,
  FROST_GIANT_FREEZE_INTERVAL,
  FROST_GIANT_FREEZE_WALL_COUNT,
  FROST_GIANT_HEAVY_STRIKE_RADIUS,
  FROST_GIANT_ICE_DURATION,
  FROST_GIANT_ICE_SLIDE_DAMAGE,
  FROST_GIANT_SHATTERED_ICE_DAMAGE,
  FROST_GIANT_SHATTERED_ICE_DURATION,
} from '../../assets/scripts/pve/core/PveConstants';
import type { ExpeditionState, FloorState, Monster, RunPlayer } from '../../assets/scripts/pve/core/PveTypes';
import { makeEntity, makeExpeditionState, makeMonster } from './helpers';

function makeBossState(turn = 1) {
  return makeExpeditionState({
    chapter: 3,
    floorOverrides: {
      player: { x: 4, y: 4 },
      ap: 10,
      turn,
      entities: [],
      monsters: [
        makeMonster('boss', { x: 4, y: 5 }, {
          type: 'BOSS',
          bossId: 'FROST_GIANT',
          hp: 80,
          maxHp: 80,
          attack: 4,
          range: 1,
          aggroRadius: 99,
        }),
      ],
    },
    playerOverrides: { hp: 200, maxHp: 200 },
  });
}

function makeFrostGiantState(opts: {
  turn?: number;
  bossOverrides?: Partial<Monster>;
  floorOverrides?: Partial<FloorState>;
  playerOverrides?: Partial<RunPlayer>;
} = {}) {
  return makeExpeditionState({
    chapter: 3,
    floorOverrides: {
      player: { x: 4, y: 4 },
      ap: 10,
      turn: opts.turn ?? 1,
      entities: [],
      monsters: [
        makeMonster('boss', { x: 4, y: 5 }, {
          type: 'BOSS',
          bossId: 'FROST_GIANT',
          hp: 80,
          maxHp: 80,
          attack: 4,
          range: 1,
          aggroRadius: 99,
          ...opts.bossOverrides,
        }),
      ],
      ...opts.floorOverrides,
    },
    playerOverrides: { hp: 200, maxHp: 200, ...opts.playerOverrides },
  });
}

function getBoss(state: ExpeditionState): Monster {
  const boss = state.floorState.monsters.find((m) => m.id === 'boss');
  if (!boss) throw new Error('boss not found');
  return boss;
}

describe('FrostGiant — 冰面地形 + 滑行（反风筝）', () => {
  describe('isFreezeAttackTurn', () => {
    it(`每 ${FROST_GIANT_FREEZE_INTERVAL} 回合返回 true`, () => {
      expect(isFreezeAttackTurn(0)).toBe(false);
      expect(isFreezeAttackTurn(FROST_GIANT_FREEZE_INTERVAL)).toBe(true);
      expect(isFreezeAttackTurn(FROST_GIANT_FREEZE_INTERVAL * 2)).toBe(true);
      expect(isFreezeAttackTurn(1)).toBe(false);
    });
  });

  describe('frostGiantAttack', () => {
    it('普通回合只攻击，不铺冰面', () => {
      const state = makeBossState(1);
      const result = frostGiantAttack(state, 'boss');
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
      expect(result.events.some((e) => e.type === 'ICE_TIDE_SPAWNED')).toBe(false);
      expect(result.state.floorState.entities.some((e) => e.type === 'ICE_TILE')).toBe(false);
    });

    it(`第 ${FROST_GIANT_FREEZE_INTERVAL} 回合普攻后以玩家为中心铺冰面（emit ICE_TIDE_SPAWNED）`, () => {
      const state = makeBossState(FROST_GIANT_FREEZE_INTERVAL);
      const result = frostGiantAttack(state, 'boss');

      expect(result.events.some((e) => e.type === 'ICE_TIDE_SPAWNED')).toBe(true);
      const iceTiles = result.state.floorState.entities.filter((e) => e.type === 'ICE_TILE');
      expect(iceTiles.length).toBeGreaterThan(0);
      // 冰面以玩家(4,4)为中心、曼哈顿 ≤1，且带 FROST_GIANT_ICE_DURATION 倒计时
      for (const t of iceTiles) {
        expect(Math.abs(t.pos.x - 4) + Math.abs(t.pos.y - 4)).toBeLessThanOrEqual(1);
        expect(t.remaining).toBe(FROST_GIANT_ICE_DURATION);
      }
      // 玩家所在格也铺冰（下回合站在冰上才会滑行）
      expect(iceTiles.some((t) => t.pos.x === 4 && t.pos.y === 4)).toBe(true);
      // boss 所在格(4,5)不铺冰（被存活怪占据）
      expect(iceTiles.some((t) => t.pos.x === 4 && t.pos.y === 5)).toBe(false);
    });
  });

  describe('冰面滑行（MovementSystem.applyMove）', () => {
    function iceLineState(player: { x: number; y: number }, iceCells: { x: number; y: number }[]) {
      return makeExpeditionState({
        chapter: 3,
        floorOverrides: {
          player,
          ap: 10,
          turn: 1,
          monsters: [],
          entities: iceCells.map((pos, i) => makeEntity(`ice${i}`, 'ICE_TILE', pos, { remaining: 2 })),
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });
    }

    it('站在冰面上移动 → 沿方向滑到第一个非冰可走格', () => {
      // 冰排 (4,4)(4,3)(4,2)；玩家站冰上 (4,4) 向上 → 滑过冰面停在第一个非冰格 (4,1)
      const state = iceLineState({ x: 4, y: 4 }, [{ x: 4, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 2 }]);
      const result = applyMove(state, 'UP');
      expect(result.state.floorState.player).toEqual({ x: 4, y: 1 });
      expect(result.events.some((e) => e.type === 'MOVE')).toBe(true);
    });

    it('滑行至地图边界则停在边界格（过冲、丢失精确间距 = 反风筝）', () => {
      // 玩家 (4,2)，上方全是冰直到边界 → 向上滑停在 (4,0)
      const state = iceLineState({ x: 4, y: 2 }, [{ x: 4, y: 2 }, { x: 4, y: 1 }, { x: 4, y: 0 }]);
      const result = applyMove(state, 'UP');
      expect(result.state.floorState.player).toEqual({ x: 4, y: 0 });
    });

    it('玩家不在冰面上 → 普通走一格（不滑），即使前方相邻是冰', () => {
      // 起步格(4,4)非冰 → 普通走一格落在 (4,3)，不继续滑
      const state = iceLineState({ x: 4, y: 4 }, [{ x: 4, y: 3 }, { x: 4, y: 2 }]);
      const result = applyMove(state, 'UP');
      expect(result.state.floorState.player).toEqual({ x: 4, y: 3 });
    });
  });

  describe('endTurn 冰面倒计时', () => {
    it('冰面每回合 remaining-1，归零移除；且不再有冰冻 AP 惩罚', () => {
      const state = makeExpeditionState({
        chapter: 3,
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          entities: [makeEntity('ice1', 'ICE_TILE', { x: 5, y: 5 }, { remaining: 1 })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = endTurn(state);
      // remaining 1 → 0 → 移除
      expect(result.state.floorState.entities.some((e) => e.type === 'ICE_TILE')).toBe(false);
      // AP 正常范围（无冰冻惩罚，至少 9）
      const ap = result.events.find((e) => e.type === 'AP_ROLLED');
      expect(ap && ap.type === 'AP_ROLLED' ? ap.ap : 0).toBeGreaterThanOrEqual(9);
    });
  });
});

describe('FrostGiant — 反风筝重做（寒气/冻结/重击/狂暴冲锋）', () => {
  describe('寒气叠层与冻结', () => {
    it('命中玩家叠加 1 层寒气，未达阈值不冻结', () => {
      const state = makeFrostGiantState({ turn: 1 });
      const result = frostGiantAttack(state, 'boss');

      expect(result.events).toContainEqual({ type: 'CHILL_STACK_APPLIED', stacks: 1 });
      expect(result.state.floorState.playerChillStacks).toBe(1);
      expect(result.events.some((e) => e.type === 'PLAYER_FROZEN')).toBe(false);
      expect(result.state.floorState.playerFrozen).toBeFalsy();
    });

    it(`连续命中 ${FROST_GIANT_CHILL_STACKS_TO_FREEZE} 次后冻结玩家并生成 FREEZE_WALL`, () => {
      let state = makeFrostGiantState({ turn: 1 });
      let last = frostGiantAttack(state, 'boss');
      for (let i = 1; i < FROST_GIANT_CHILL_STACKS_TO_FREEZE; i++) {
        state = last.state;
        last = frostGiantAttack(state, 'boss');
      }

      expect(last.events).toContainEqual({ type: 'CHILL_STACK_APPLIED', stacks: 0 });
      const frozen = last.events.find((e) => e.type === 'PLAYER_FROZEN');
      expect(frozen && frozen.type === 'PLAYER_FROZEN' ? frozen.wallEntityIds.length : -1).toBe(
        FROST_GIANT_FREEZE_WALL_COUNT,
      );

      const final = last.state.floorState;
      expect(final.playerChillStacks).toBe(0);
      expect(final.playerFrozen).toBe(true);
      expect(final.playerFreezeAttacksRemaining).toBe(FROST_GIANT_FREEZE_ATTACKS_TO_BREAK);
      expect(final.entities.filter((e) => e.type === 'FREEZE_WALL').length).toBe(FROST_GIANT_FREEZE_WALL_COUNT);
    });
  });

  describe('冻结状态', () => {
    it('冻结时 MOVE 完全无效（no-op）', () => {
      const state = makeFrostGiantState({
        floorOverrides: {
          playerFrozen: true,
          playerFreezeAttacksRemaining: FROST_GIANT_FREEZE_ATTACKS_TO_BREAK,
          entities: [makeEntity('fw1', 'FREEZE_WALL', { x: 5, y: 4 })],
        },
      });

      const result = applyMove(state, 'RIGHT');
      expect(result.state.floorState.player).toEqual({ x: 4, y: 4 });
      expect(result.events.length).toBe(0);
    });

    it('主动攻击消耗 1 次解冻次数，未归零不解冻', () => {
      const state = makeFrostGiantState({
        floorOverrides: {
          playerFrozen: true,
          playerFreezeAttacksRemaining: 2,
          entities: [makeEntity('fw1', 'FREEZE_WALL', { x: 5, y: 4 })],
        },
      });

      const result = playerAttack(state, 'boss');
      expect(result.state.floorState.playerFreezeAttacksRemaining).toBe(1);
      expect(result.state.floorState.playerFrozen).toBe(true);
      expect(result.events.some((e) => e.type === 'PLAYER_UNFROZEN')).toBe(false);
      expect(result.state.floorState.entities.some((e) => e.type === 'FREEZE_WALL')).toBe(true);
    });

    it('解冻次数归零 → PLAYER_UNFROZEN，FREEZE_WALL 一并移除', () => {
      const state = makeFrostGiantState({
        floorOverrides: {
          playerFrozen: true,
          playerFreezeAttacksRemaining: 1,
          entities: [makeEntity('fw1', 'FREEZE_WALL', { x: 5, y: 4 })],
        },
      });

      const result = playerAttack(state, 'boss');
      expect(result.events.some((e) => e.type === 'PLAYER_UNFROZEN')).toBe(true);
      expect(result.state.floorState.playerFrozen).toBe(false);
      expect(result.state.floorState.playerFreezeAttacksRemaining).toBeUndefined();
      expect(result.state.floorState.entities.some((e) => e.type === 'FREEZE_WALL')).toBe(false);
    });

    it('attackIceWall 攻击冰墙同样消耗解冻次数', () => {
      const state = makeFrostGiantState({
        floorOverrides: {
          monsters: [],
          playerFrozen: true,
          playerFreezeAttacksRemaining: 1,
          entities: [
            makeEntity('fw1', 'FREEZE_WALL', { x: 5, y: 4 }),
            makeEntity('wall1', 'ICE_WALL', { x: 4, y: 5 }, { hp: CHAPTER3_ICE_WALL_HP }),
          ],
        },
      });

      const result = attackIceWall(state, 'wall1');
      expect(result.events.some((e) => e.type === 'PLAYER_UNFROZEN')).toBe(true);
      expect(result.state.floorState.playerFrozen).toBe(false);
      expect(result.state.floorState.entities.some((e) => e.type === 'FREEZE_WALL')).toBe(false);
    });
  });

  describe('冰霜重击（stepFrostGiant，非狂暴循环回合）', () => {
    it('AOE 命中玩家：FROST_HEAVY_STRIKE_RESOLVED + 伤害 + 击退 + 追击', () => {
      const state = makeFrostGiantState({ turn: 3 });
      const result = stepFrostGiant(state, getBoss(state))!;
      expect(result).not.toBeNull();

      expect(result.events).toContainEqual({
        type: 'FROST_HEAVY_STRIKE_RESOLVED',
        bossId: 'boss',
        center: { x: 4, y: 5 },
        radius: FROST_GIANT_HEAVY_STRIKE_RADIUS,
      });
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED' && e.damage === 4)).toBe(true);
      expect(result.state.player.hp).toBe(196);

      const kb = result.events.find((e) => e.type === 'KNOCKBACK');
      expect(kb && kb.type === 'KNOCKBACK' ? kb.slid : null).toBe(false);
      expect(kb && kb.type === 'KNOCKBACK' ? kb.to : null).toEqual({ x: 4, y: 3 });
      expect(result.state.floorState.player).toEqual({ x: 4, y: 3 });

      // 释放后追击 1 步
      expect(result.events.some((e) => e.type === 'MOVE' && e.entityId === 'boss')).toBe(true);
    });

    it('AOE 击碎范围内 ICE_WALL → 生成 SHATTERED_ICE（玩家在范围外不受击退/伤害）', () => {
      const state = makeFrostGiantState({
        turn: 3,
        floorOverrides: {
          player: { x: 0, y: 0 },
          entities: [makeEntity('wall1', 'ICE_WALL', { x: 5, y: 5 }, { hp: CHAPTER3_ICE_WALL_HP })],
        },
      });
      const result = stepFrostGiant(state, getBoss(state))!;

      const shattered = result.events.find((e) => e.type === 'ICE_WALL_SHATTERED');
      expect(shattered && shattered.type === 'ICE_WALL_SHATTERED' ? shattered.entityId : '').toBe('wall1');
      expect(shattered && shattered.type === 'ICE_WALL_SHATTERED' ? shattered.shatteredCells : []).toEqual([
        { x: 6, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 4 },
      ]);

      const shatteredEntities = result.state.floorState.entities.filter((e) => e.type === 'SHATTERED_ICE');
      expect(shatteredEntities.length).toBe(3);
      expect(shatteredEntities.every((e) => e.remaining === FROST_GIANT_SHATTERED_ICE_DURATION)).toBe(true);
      expect(result.state.floorState.entities.find((e) => e.id === 'wall1')?.consumed).toBe(true);

      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(false);
      expect(result.events.some((e) => e.type === 'KNOCKBACK')).toBe(false);
    });

    it('击退落点为冰面 → 沿方向滑行并造成额外冰面伤害', () => {
      const state = makeFrostGiantState({
        turn: 3,
        floorOverrides: {
          entities: [
            makeEntity('ice1', 'ICE_TILE', { x: 4, y: 3 }, { remaining: 2 }),
            makeEntity('ice2', 'ICE_TILE', { x: 4, y: 2 }, { remaining: 2 }),
          ],
        },
      });
      const result = stepFrostGiant(state, getBoss(state))!;

      const kb = result.events.find((e) => e.type === 'KNOCKBACK');
      expect(kb && kb.type === 'KNOCKBACK' ? kb.slid : null).toBe(true);
      expect(kb && kb.type === 'KNOCKBACK' ? kb.to : null).toEqual({ x: 4, y: 1 });
      expect(result.state.floorState.player).toEqual({ x: 4, y: 1 });

      const damaged = result.events.filter((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged.length).toBe(2);
      expect(damaged[1].type === 'PLAYER_DAMAGED' ? damaged[1].damage : -1).toBe(FROST_GIANT_ICE_SLIDE_DAMAGE);

      // 重击伤害(4) + 冰面滑行伤害(30)
      expect(result.state.player.hp).toBe(200 - 4 - FROST_GIANT_ICE_SLIDE_DAMAGE);
    });
  });

  describe('狂暴触发（BOSS_ENRAGED）', () => {
    it(`HP 占比首次跌破 ${FROST_GIANT_ENRAGE_HP_RATIO} 时 emit BOSS_ENRAGED`, () => {
      const state = makeFrostGiantState({ bossOverrides: { hp: 33, maxHp: 80 } });
      const result = playerAttack(state, 'boss');
      expect(result.events).toContainEqual({ type: 'BOSS_ENRAGED', bossId: 'FROST_GIANT' });
    });

    it('已处于狂暴时不重复 emit BOSS_ENRAGED', () => {
      const state = makeFrostGiantState({ bossOverrides: { hp: 30, maxHp: 80 } });
      const result = playerAttack(state, 'boss');
      expect(result.events.some((e) => e.type === 'BOSS_ENRAGED')).toBe(false);
    });
  });

  describe('狂暴冲锋 — 预警（CHARGE_TELEGRAPHED）', () => {
    it('狂暴循环回合预警冲锋方向与路径，本回合不攻击不移动', () => {
      const state = makeFrostGiantState({ turn: 3, bossOverrides: { hp: 30, maxHp: 80 } });
      const result = stepFrostGiant(state, getBoss(state))!;

      const tel = result.events.find((e) => e.type === 'CHARGE_TELEGRAPHED');
      expect(tel && tel.type === 'CHARGE_TELEGRAPHED' ? tel.dir : null).toEqual({ x: 0, y: -1 });
      expect(tel && tel.type === 'CHARGE_TELEGRAPHED' ? tel.path : []).toEqual([
        { x: 4, y: 4 },
        { x: 4, y: 3 },
        { x: 4, y: 2 },
        { x: 4, y: 1 },
        { x: 4, y: 0 },
      ]);

      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss?.frostChargeDir).toEqual({ x: 0, y: -1 });
      expect(boss?.aiState).toBe('CHASE');
      expect(result.state.floorState.player).toEqual({ x: 4, y: 4 });
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(false);
      expect(result.events.some((e) => e.type === 'MOVE')).toBe(false);
    });
  });

  describe('狂暴冲锋 — 执行（CHARGE_EXECUTED）', () => {
    it('车道内首先遇到 ICE_WALL → 击碎并停止（WALL_SHATTERED）', () => {
      const state = makeFrostGiantState({
        bossOverrides: { hp: 30, maxHp: 80, frostChargeDir: { x: 0, y: -1 } },
        floorOverrides: {
          player: { x: 0, y: 0 },
          entities: [makeEntity('wall1', 'ICE_WALL', { x: 4, y: 3 }, { hp: CHAPTER3_ICE_WALL_HP })],
        },
      });
      const result = stepFrostGiant(state, getBoss(state))!;

      const exec = result.events.find((e) => e.type === 'CHARGE_EXECUTED');
      expect(exec && exec.type === 'CHARGE_EXECUTED' ? exec.result : '').toBe('WALL_SHATTERED');
      expect(exec && exec.type === 'CHARGE_EXECUTED' ? exec.to : null).toEqual({ x: 4, y: 3 });

      const shattered = result.events.find((e) => e.type === 'ICE_WALL_SHATTERED');
      expect(shattered && shattered.type === 'ICE_WALL_SHATTERED' ? shattered.entityId : '').toBe('wall1');

      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss?.pos).toEqual({ x: 4, y: 3 });
      expect(boss?.frostChargeDir).toBeUndefined();
    });

    it('车道内命中玩家 → 造成 boss.attack × 倍率伤害并停止（PLAYER_HIT）', () => {
      const state = makeFrostGiantState({
        bossOverrides: { hp: 30, maxHp: 80, frostChargeDir: { x: 0, y: -1 } },
      });
      const result = stepFrostGiant(state, getBoss(state))!;

      const exec = result.events.find((e) => e.type === 'CHARGE_EXECUTED');
      expect(exec && exec.type === 'CHARGE_EXECUTED' ? exec.result : '').toBe('PLAYER_HIT');
      expect(exec && exec.type === 'CHARGE_EXECUTED' ? exec.to : null).toEqual({ x: 4, y: 4 });

      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged && damaged.type === 'PLAYER_DAMAGED' ? damaged.damage : -1).toBe(
        4 * FROST_GIANT_CHARGE_DAMAGE_MULT,
      );
      expect(result.state.player.hp).toBe(200 - 4 * FROST_GIANT_CHARGE_DAMAGE_MULT);

      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss?.pos).toEqual({ x: 4, y: 4 });
      expect(boss?.frostChargeDir).toBeUndefined();
    });

    it('车道内均未命中 → 冲到路径终点并随机生成新 ICE_WALL（ICE_WALL_SPAWNED）', () => {
      const state = makeFrostGiantState({
        bossOverrides: { hp: 30, maxHp: 80, frostChargeDir: { x: 0, y: -1 } },
        floorOverrides: { player: { x: 0, y: 0 } },
      });
      const result = stepFrostGiant(state, getBoss(state))!;

      const exec = result.events.find((e) => e.type === 'CHARGE_EXECUTED');
      expect(exec && exec.type === 'CHARGE_EXECUTED' ? exec.result : '').toBe('ICE_WALL_SPAWNED');
      expect(exec && exec.type === 'CHARGE_EXECUTED' ? exec.to : null).toEqual({ x: 4, y: 0 });

      const spawned = result.events.find((e) => e.type === 'ICE_WALL_SPAWNED');
      expect(spawned).toBeDefined();
      const newWalls = result.state.floorState.entities.filter((e) => e.type === 'ICE_WALL' && !e.consumed);
      expect(newWalls.length).toBe(1);
      expect(newWalls[0].hp).toBe(CHAPTER3_ICE_WALL_HP);

      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss?.pos).toEqual({ x: 4, y: 0 });
      expect(boss?.frostChargeDir).toBeUndefined();
    });
  });

  describe('SHATTERED_ICE 碎冰地块', () => {
    it('玩家踩入立即消耗并造成固定伤害（MovementSystem.applyMove）', () => {
      const state = makeExpeditionState({
        chapter: 3,
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          turn: 1,
          monsters: [],
          entities: [makeEntity('si1', 'SHATTERED_ICE', { x: 4, y: 3 }, { remaining: FROST_GIANT_SHATTERED_ICE_DURATION })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = applyMove(state, 'UP');
      expect(result.state.floorState.player).toEqual({ x: 4, y: 3 });
      expect(result.state.player.hp).toBe(200 - FROST_GIANT_SHATTERED_ICE_DAMAGE);
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED' && e.damage === FROST_GIANT_SHATTERED_ICE_DAMAGE)).toBe(true);
      expect(result.state.floorState.entities.find((e) => e.id === 'si1')?.consumed).toBe(true);
    });

    it('endTurn 倒计时归零移除', () => {
      const state = makeExpeditionState({
        chapter: 3,
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          entities: [makeEntity('si1', 'SHATTERED_ICE', { x: 5, y: 5 }, { remaining: 1 })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = endTurn(state);
      expect(result.state.floorState.entities.some((e) => e.type === 'SHATTERED_ICE')).toBe(false);
    });
  });
});
