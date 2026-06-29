import {
  lavaChainStep,
  lavaEruptionStep,
  lavaLordAttack,
  lavaTideStep,
} from '../../assets/scripts/pve/core/bosses/LavaLord';
import { playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { endTurn } from '../../assets/scripts/pve/core/ExpeditionState';
import { applyMove } from '../../assets/scripts/pve/core/MovementSystem';
import {
  CHAPTER4_LAVA_TIDE_INTERVAL,
  CHAPTER4_LAVA_TIDE_ROW_MAX,
  CHAPTER4_LAVA_TILE_DAMAGE,
  LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK,
  LAVA_LORD_BURN_BURST_THRESHOLD,
  LAVA_LORD_BURN_BURST_TILE_DURATION,
  LAVA_LORD_BURN_TICKS,
  LAVA_LORD_CHAIN_BURN_TICKS,
  LAVA_LORD_ERUPTION_DURATION,
  LAVA_LORD_LAVA_STAND_ATTACK_BONUS,
  LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION,
} from '../../assets/scripts/pve/core/PveConstants';
import type { Coord, ExpeditionState, FixedEntity } from '../../assets/scripts/pve/core/PveTypes';
import { makeEntity, makeExpeditionState, makeMonster } from './helpers';

/** 第 20 层（章节4 Boss 层，10×10），固定 entities=[] 保证布局确定性。 */
function makeBossState(opts: {
  playerPos?: Coord;
  bossPos?: Coord;
  bossHp?: number;
  bossMaxHp?: number;
  turn?: number;
  playerHp?: number;
  playerMaxHp?: number;
  entities?: FixedEntity[];
  bossOverrides?: Record<string, unknown>;
  floorOverrides?: Record<string, unknown>;
} = {}): ExpeditionState {
  const {
    playerPos = { x: 4, y: 4 },
    bossPos = { x: 4, y: 5 },
    bossHp = 1000,
    bossMaxHp = 1000,
    turn = 1,
    playerHp = 200,
    playerMaxHp = 200,
    entities = [],
    bossOverrides = {},
    floorOverrides = {},
  } = opts;

  return makeExpeditionState({
    floor: 28,
    chapter: 4,
    floorOverrides: {
      player: playerPos,
      ap: 10,
      turn,
      entities,
      monsters: [
        makeMonster('boss', bossPos, {
          type: 'BOSS',
          bossId: 'LAVA_LORD',
          hp: bossHp,
          maxHp: bossMaxHp,
          attack: 40,
          range: 1,
          aggroRadius: 99,
          ...bossOverrides,
        }),
      ],
      ...floorOverrides,
    },
    playerOverrides: { hp: playerHp, maxHp: playerMaxHp },
  });
}

describe('LavaLord', () => {
  describe('lavaLordAttack', () => {
    it('攻击命中后施加灼烧，emit BURN_APPLIED，playerBurnRemaining += LAVA_LORD_BURN_TICKS', () => {
      const state = makeBossState();
      const result = lavaLordAttack(state, 'boss');

      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
      expect(result.events.some((e) => e.type === 'BURN_APPLIED')).toBe(true);
      expect(result.state.floorState.playerBurnRemaining).toBe(LAVA_LORD_BURN_TICKS);
    });

  });

  describe('喷发预警（阶段一）', () => {
    it('turn % INTERVAL === 0 时以玩家为中心标记 4×4 区域（emit ERUPTION_TELEGRAPHED，含越界裁剪）', () => {
      // 玩家在角落 (0,0)：4×4 区域 x,y∈[-1,2] 裁剪后只剩 [0,2]×[0,2] = 9 格
      const state = makeBossState({ playerPos: { x: 0, y: 0 }, bossPos: { x: 9, y: 9 }, turn: 3 });
      const result = lavaEruptionStep(state, 'boss');

      const ev = result.events.find((e) => e.type === 'ERUPTION_TELEGRAPHED');
      expect(ev).toBeDefined();
      if (ev && ev.type === 'ERUPTION_TELEGRAPHED') {
        expect(ev.cells).toHaveLength(9);
        expect(ev.cells.every((c) => c.x >= 0 && c.x <= 2 && c.y >= 0 && c.y <= 2)).toBe(true);
      }
      expect(result.state.floorState.lavaEruptionMark?.cells).toHaveLength(9);
    });

    it('非标记/非结算回合不产生事件', () => {
      const state = makeBossState({ playerPos: { x: 4, y: 4 }, turn: 1 });
      const result = lavaEruptionStep(state, 'boss');
      expect(result.events).toHaveLength(0);
      expect(result.state.floorState.lavaEruptionMark).toBeUndefined();
    });

    it('下一个 Boss 回合结算标记：在 cells 上生成 LAVA_TILE（跳过被占用格），emit ERUPTION_RESOLVED', () => {
      const marked = makeBossState({ playerPos: { x: 0, y: 0 }, bossPos: { x: 9, y: 9 }, turn: 3 });
      const telegraphed = lavaEruptionStep(marked, 'boss');

      const resolved = lavaEruptionStep(telegraphed.state, 'boss');
      const ev = resolved.events.find((e) => e.type === 'ERUPTION_RESOLVED');
      expect(ev).toBeDefined();
      if (ev && ev.type === 'ERUPTION_RESOLVED') {
        // 9 格标记中 (0,0) 被玩家占据，结算只生成 8 格
        expect(ev.tiles).toHaveLength(8);
        expect(ev.tiles.some((c) => c.x === 0 && c.y === 0)).toBe(false);
        expect(ev.duration).toBe(LAVA_LORD_ERUPTION_DURATION);
      }
      expect(resolved.state.floorState.lavaEruptionMark).toBeUndefined();
      const lavaTiles = resolved.state.floorState.entities.filter((e) => e.type === 'LAVA_TILE');
      expect(lavaTiles).toHaveLength(8);
      expect(lavaTiles.every((e) => e.remaining === LAVA_LORD_ERUPTION_DURATION)).toBe(true);
    });
  });

  describe('阶段二期间喷发预警停用', () => {
    it('已挂起的标记直接清空不结算', () => {
      const state = makeBossState({
        floorOverrides: { lavaLordPhase2: true, lavaEruptionMark: { cells: [{ x: 1, y: 1 }] } },
      });
      const result = lavaEruptionStep(state, 'boss');
      expect(result.events).toHaveLength(0);
      expect(result.state.floorState.lavaEruptionMark).toBeUndefined();
      expect(result.state.floorState.entities.filter((e) => e.type === 'LAVA_TILE')).toHaveLength(0);
    });

    it('即使到达标记回合也不再新标记', () => {
      const state = makeBossState({ turn: 3, floorOverrides: { lavaLordPhase2: true } });
      const result = lavaEruptionStep(state, 'boss');
      expect(result.events).toHaveLength(0);
      expect(result.state.floorState.lavaEruptionMark).toBeUndefined();
    });
  });

  describe('熔核爆裂', () => {
    it('灼烧叠至阈值时清零灼烧、造成真实伤害并在玩家周围生成 LAVA_TILE', () => {
      const state = makeBossState({ playerPos: { x: 4, y: 4 }, bossPos: { x: 4, y: 5 } });
      const r1 = lavaLordAttack(state, 'boss'); // playerBurnRemaining: 0 -> 3
      const hpAfterFirstHit = r1.state.player.hp;

      const r2 = lavaLordAttack(r1.state, 'boss'); // 普攻命中(-40) 后 3 + 3 = 6 >= THRESHOLD(6) -> 熔核爆裂
      const monsterDamage = r2.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(monsterDamage).toBeDefined();
      const hpBeforeBurst =
        monsterDamage && monsterDamage.type === 'PLAYER_DAMAGED' ? monsterDamage.hp : hpAfterFirstHit;

      const burst = r2.events.find((e) => e.type === 'BURN_BURST');
      expect(burst).toBeDefined();

      const expectedBurnDamage = LAVA_LORD_BURN_BURST_THRESHOLD * LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK;
      if (burst && burst.type === 'BURN_BURST') {
        expect(burst.damage).toBe(expectedBurnDamage);
        expect(burst.hp).toBe(Math.max(0, hpBeforeBurst - expectedBurnDamage));
        expect(burst.tiles).toHaveLength(4); // 玩家周围 "+" 字 4 格
      }

      expect(r2.state.floorState.playerBurnRemaining).toBe(0);
      expect(r2.state.player.hp).toBe(Math.max(0, hpBeforeBurst - expectedBurnDamage));

      const burstTiles = r2.state.floorState.entities.filter((e) => e.type === 'LAVA_TILE');
      expect(burstTiles).toHaveLength(4);
      expect(burstTiles.every((e) => e.remaining === LAVA_LORD_BURN_BURST_TILE_DURATION)).toBe(true);
    });
  });

  describe('定向熔岩潮汐（阶段二）', () => {
    it('进入阶段二：从 Boss 最近边整排(10格)生成永久 LAVA_TILE，每 INTERVAL 回合再推一排，最多 ROW_MAX 排', () => {
      // Boss 在 (8,8)：距下边界(DOWN)=1、距右边界(RIGHT)=1，UP>DOWN>LEFT>RIGHT 取 DOWN
      let state = makeBossState({
        playerPos: { x: 4, y: 4 },
        bossPos: { x: 8, y: 8 },
        bossHp: 500,
        bossMaxHp: 1000,
      });

      // 第 1 排：立即生成，方向 DOWN（y = size-1 = 9）
      let result = lavaTideStep(state, 'boss');
      let ev = result.events.find((e) => e.type === 'LAVA_TIDE_ROW_SPAWNED');
      expect(ev).toBeDefined();
      if (ev && ev.type === 'LAVA_TIDE_ROW_SPAWNED') {
        expect(ev.direction).toBe('DOWN');
        expect(ev.rowIndex).toBe(1);
        expect(ev.tiles).toHaveLength(10);
        expect(ev.tiles.every((c) => c.y === 9)).toBe(true);
      }
      expect(result.state.floorState.lavaLordPhase2).toBe(true);
      expect(result.state.floorState.lavaTideDirection).toBe('DOWN');
      expect(result.state.floorState.lavaTideRowsAdvanced).toBe(1);
      let lavaTiles = result.state.floorState.entities.filter((e) => e.type === 'LAVA_TILE');
      expect(lavaTiles).toHaveLength(10);
      expect(lavaTiles.every((e) => e.remaining === undefined)).toBe(true); // 永久格子
      state = result.state;

      // 接下来 CHAPTER4_LAVA_TIDE_INTERVAL-1 回合不推进（仅计数）
      for (let i = 0; i < CHAPTER4_LAVA_TIDE_INTERVAL - 1; i++) {
        result = lavaTideStep(state, 'boss');
        expect(result.events).toHaveLength(0);
        state = result.state;
      }

      // 第 CHAPTER4_LAVA_TIDE_INTERVAL 回合：推进第 2 排（y = size-2 = 8）
      result = lavaTideStep(state, 'boss');
      ev = result.events.find((e) => e.type === 'LAVA_TIDE_ROW_SPAWNED');
      expect(ev).toBeDefined();
      if (ev && ev.type === 'LAVA_TIDE_ROW_SPAWNED') {
        expect(ev.rowIndex).toBe(2);
        expect(ev.tiles).toHaveLength(10);
        expect(ev.tiles.every((c) => c.y === 8)).toBe(true);
      }
      expect(result.state.floorState.lavaTideRowsAdvanced).toBe(2);
      state = result.state;

      // 再推进一排到达 ROW_MAX(3)
      for (let i = 0; i < CHAPTER4_LAVA_TIDE_INTERVAL - 1; i++) {
        result = lavaTideStep(state, 'boss');
        expect(result.events).toHaveLength(0);
        state = result.state;
      }
      result = lavaTideStep(state, 'boss');
      ev = result.events.find((e) => e.type === 'LAVA_TIDE_ROW_SPAWNED');
      expect(ev).toBeDefined();
      if (ev && ev.type === 'LAVA_TIDE_ROW_SPAWNED') {
        expect(ev.rowIndex).toBe(CHAPTER4_LAVA_TIDE_ROW_MAX);
      }
      expect(result.state.floorState.lavaTideRowsAdvanced).toBe(CHAPTER4_LAVA_TIDE_ROW_MAX);
      state = result.state;

      // 达到 ROW_MAX 后不再推进
      result = lavaTideStep(state, 'boss');
      expect(result.events).toHaveLength(0);
      expect(result.state.floorState.lavaTideRowsAdvanced).toBe(CHAPTER4_LAVA_TIDE_ROW_MAX);
    });
  });

  describe('Boss 站熔岩 buff', () => {
    it('站在 LAVA_TILE 上时普攻 +LAVA_LORD_LAVA_STAND_ATTACK_BONUS（结算后恢复原值）', () => {
      const bossPos = { x: 4, y: 5 };
      const state = makeBossState({
        playerPos: { x: 4, y: 4 },
        bossPos,
        entities: [makeEntity('lava_under_boss', 'LAVA_TILE', bossPos)],
      });

      const result = lavaLordAttack(state, 'boss');
      const dmg = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(dmg).toBeDefined();
      if (dmg && dmg.type === 'PLAYER_DAMAGED') {
        expect(dmg.damage).toBe(40 + LAVA_LORD_LAVA_STAND_ATTACK_BONUS);
      }

      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss?.attack).toBe(40); // 临时加成已恢复
    });

    it('Boss 站在 LAVA_TILE 上时受到的玩家伤害减免 LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION', () => {
      const bossPos = { x: 4, y: 5 };
      const state = makeBossState({
        playerPos: { x: 4, y: 4 },
        bossPos,
        entities: [makeEntity('lava_under_boss', 'LAVA_TILE', bossPos)],
      });

      const result = playerAttack(state, 'boss');
      const ev = result.events.find((e) => e.type === 'ATTACK');
      expect(ev).toBeDefined();
      if (ev && ev.type === 'ATTACK') {
        const baseDamage = 10; // ADVENTURER 基础攻击力（无装备/词条加成）
        const expected = Math.max(1, Math.round(baseDamage * (1 - LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION)));
        expect(ev.damage).toBe(expected);
        expect(ev.targetHp).toBe(1000 - expected);
      }
    });
  });

  describe('LAVA_TILE 踩入扣血（步入即时结算，地块不消失）', () => {
    it('applyMove 踩入永久 LAVA_TILE 时立即触发 LAVA_TILE_DAMAGED，地块保留不消失', () => {
      // 玩家在 (1,0)，向左移动踩入 (0,0) 的 LAVA_TILE
      const state = makeExpeditionState({
        floor: 28,
        chapter: 4,
        floorOverrides: {
          turn: 1,
          ap: 10,
          player: { x: 1, y: 0 },
          monsters: [],
          entities: [makeEntity('perm_lava', 'LAVA_TILE', { x: 0, y: 0 })], // 无 remaining 字段（永久）
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = applyMove(state, 'LEFT');
      const ev = result.events.find((e) => e.type === 'LAVA_TILE_DAMAGED');
      expect(ev).toBeDefined();
      if (ev && ev.type === 'LAVA_TILE_DAMAGED') {
        expect(ev.damage).toBe(CHAPTER4_LAVA_TILE_DAMAGE);
        expect(ev.entityId).toBe('perm_lava');
      }
      expect(result.state.player.hp).toBe(200 - CHAPTER4_LAVA_TILE_DAMAGE);

      // 地块不消失
      const tile = result.state.floorState.entities.find((e) => e.id === 'perm_lava');
      expect(tile).toBeDefined();
      expect(tile?.consumed).toBe(false);
    });

    it('endTurn 时玩家站在 LAVA_TILE 上不再额外扣血（伤害已在步入时结算）', () => {
      const state = makeExpeditionState({
        floor: 28,
        chapter: 4,
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          entities: [makeEntity('perm_lava', 'LAVA_TILE', { x: 0, y: 0 })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = endTurn(state);
      expect(result.events.find((e) => e.type === 'LAVA_TILE_DAMAGED')).toBeUndefined();
      expect(result.state.player.hp).toBe(200); // 无额外扣血
    });
  });

  describe('熔岩锁链（反风筝）', () => {
    it('远离计数器达到阈值后触发：拉近一格并附加灼烧，counter 归零', () => {
      // 玩家与 Boss 距离 2（>1 但 <4），需累计 3 个回合才触发
      let state = makeBossState({ playerPos: { x: 4, y: 4 }, bossPos: { x: 6, y: 4 } });

      let result = lavaChainStep(state, 'boss');
      expect(result.events).toHaveLength(0);
      expect(result.state.floorState.lavaLordChainCounter).toBe(1);
      state = result.state;

      result = lavaChainStep(state, 'boss');
      expect(result.events).toHaveLength(0);
      expect(result.state.floorState.lavaLordChainCounter).toBe(2);
      state = result.state;

      result = lavaChainStep(state, 'boss');
      const ev = result.events.find((e) => e.type === 'LAVA_CHAIN_PULL');
      expect(ev).toBeDefined();
      if (ev && ev.type === 'LAVA_CHAIN_PULL') {
        expect(ev.from).toEqual({ x: 4, y: 4 });
        expect(ev.to).toEqual({ x: 5, y: 4 }); // 沿 boss->player 方向拉近一格
        expect(ev.burnTotal).toBe(LAVA_LORD_CHAIN_BURN_TICKS);
      }
      expect(result.state.floorState.player).toEqual({ x: 5, y: 4 });
      expect(result.state.floorState.lavaLordChainCounter).toBe(0);
      expect(result.state.floorState.playerBurnRemaining).toBe(LAVA_LORD_CHAIN_BURN_TICKS);
    });

    it('当前距离达到阈值时立即触发（无需累计计数器）', () => {
      const state = makeBossState({ playerPos: { x: 4, y: 4 }, bossPos: { x: 8, y: 4 } }); // 距离4

      const result = lavaChainStep(state, 'boss');
      const ev = result.events.find((e) => e.type === 'LAVA_CHAIN_PULL');
      expect(ev).toBeDefined();
      if (ev && ev.type === 'LAVA_CHAIN_PULL') {
        expect(ev.to).toEqual({ x: 5, y: 4 });
      }
      expect(result.state.floorState.lavaLordChainCounter).toBe(0);
    });

    it('锁链触发后 Boss 仍朝玩家追击移动一格（跳过普攻，避免原地不动）', async () => {
      const { stepMonsters } = await import('../../assets/scripts/pve/core/MonsterAI');
      // 玩家与 Boss 相距 4，锁链立即触发（dist≥4）：拉拽后 dist=3，仍 > range(1)，
      // 期望 Boss 在同一回合走一格 → dist 进一步缩短。
      const state = makeBossState({ playerPos: { x: 4, y: 4 }, bossPos: { x: 8, y: 4 } });
      const result = stepMonsters(state);
      expect(result.events.some((e) => e.type === 'LAVA_CHAIN_PULL')).toBe(true);
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(false); // 跳过普攻

      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss).toBeDefined();
      const newDist = Math.abs((boss?.pos.x ?? 0) - result.state.floorState.player.x)
        + Math.abs((boss?.pos.y ?? 0) - result.state.floorState.player.y);
      // 原距离 4 → 锁链拉近玩家到 (5,4)、Boss 在 (8,4) → 距离 3；
      // 再追击一步 Boss 到 (7,4) → 距离 2。
      expect(newDist).toBeLessThan(3);
    });
  });

  describe('endTurn 灼烧 tick', () => {
    it('playerBurnRemaining > 0 时每回合扣 10 HP（×10基准），emit BURN_TICK，remaining--', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          playerBurnRemaining: 3,
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = endTurn(state);
      const burnTick = result.events.find((e) => e.type === 'BURN_TICK');
      expect(burnTick).toBeDefined();
      if (burnTick && burnTick.type === 'BURN_TICK') {
        expect(burnTick.damage).toBe(10);
        expect(burnTick.hp).toBe(190);
      }
      expect(result.state.player.hp).toBe(190);
      expect(result.state.floorState.playerBurnRemaining).toBe(2);
    });

    it('灼烧耗尽后 playerBurnRemaining 清为 undefined', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          playerBurnRemaining: 1,
        },
        playerOverrides: { hp: 20, maxHp: 20 },
      });

      const result = endTurn(state);
      expect(result.state.floorState.playerBurnRemaining).toBeUndefined();
    });

    it('灼烧致死时 emit PLAYER_DEAD，状态置 DEAD', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          playerBurnRemaining: 5,
        },
        playerOverrides: { hp: 1, maxHp: 20 },
      });

      const result = endTurn(state);
      expect(result.events.some((e) => e.type === 'PLAYER_DEAD')).toBe(true);
      expect(result.state.status).toBe('DEAD');
    });
  });
});
