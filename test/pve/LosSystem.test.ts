// 视线（LOS）系统单测（specs/260629-map-terrain Phase 2，AC-MT-4/5/8）

import { bresenhamLine, checkLos } from '../../assets/scripts/pve/core/LosSystem';
import { playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { monsterAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { makeExpeditionState, makeEntity, makeMonster } from './helpers';
import type { Coord } from '../../assets/scripts/pve/core/PveTypes';

// ── Bresenham 直线 ───────────────────────────────────────────────

describe('bresenhamLine — 中间格序列（锁定行为，AC-MT-8）', () => {
  it('水平直线：(0,0)→(4,0)，中间格 (1,0)(2,0)(3,0)', () => {
    expect(bresenhamLine({ x: 0, y: 0 }, { x: 4, y: 0 })).toEqual([
      { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    ]);
  });

  it('垂直直线：(0,0)→(0,4)，中间格 (0,1)(0,2)(0,3)', () => {
    expect(bresenhamLine({ x: 0, y: 0 }, { x: 0, y: 4 })).toEqual([
      { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 },
    ]);
  });

  it('相邻格（曼哈顿距离=1）：无中间格', () => {
    expect(bresenhamLine({ x: 3, y: 3 }, { x: 3, y: 4 })).toEqual([]);
    expect(bresenhamLine({ x: 3, y: 3 }, { x: 4, y: 3 })).toEqual([]);
  });

  it('对角线 45°：(0,0)→(3,3)，中间格锁定（不得随意修改）', () => {
    const line = bresenhamLine({ x: 0, y: 0 }, { x: 3, y: 3 });
    // 固定预期：Bresenham 对角 dx=dy 时每步 x 和 y 同时走
    expect(line).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  });

  it('非对称对角线：(0,0)→(4,2)，中间格固定', () => {
    const line = bresenhamLine({ x: 0, y: 0 }, { x: 4, y: 2 });
    // 确定性锁定：同一端点永远同一序列
    const again = bresenhamLine({ x: 0, y: 0 }, { x: 4, y: 2 });
    expect(line).toEqual(again);
    // 中间格不含起点/终点
    expect(line.some((c) => c.x === 0 && c.y === 0)).toBe(false);
    expect(line.some((c) => c.x === 4 && c.y === 2)).toBe(false);
  });
});

// ── checkLos ────────────────────────────────────────────────────

function makeFloorWith(entities: ReturnType<typeof makeEntity>[], size = 10) {
  return {
    floor: 1, size, seed: 1, rngState: 0,
    player: { x: 0, y: 0 }, ap: 0, maxAp: 0, dice: 0, turn: 0, hasKey: false,
    revealed: Array.from({ length: size }, () => Array(size).fill(true)),
    monsters: [],
    entities,
    status: 'EXPLORING' as const,
  };
}

describe('checkLos — 视线遮挡判定（AC-MT-5）', () => {
  it('直线无障碍时返回 null', () => {
    const floor = makeFloorWith([]);
    expect(checkLos(floor, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull();
  });

  it('中间有 ROCK 时返回遮挡格坐标（AC-MT-5 墙体挡）', () => {
    const floor = makeFloorWith([makeEntity('r1', 'ROCK', { x: 3, y: 0 })]);
    expect(checkLos(floor, { x: 0, y: 0 }, { x: 5, y: 0 })).toEqual({ x: 3, y: 0 });
  });

  it('中间有 ICE_WALL 时被挡（AC-MT-5）', () => {
    const floor = makeFloorWith([makeEntity('iw1', 'ICE_WALL', { x: 2, y: 0 })]);
    expect(checkLos(floor, { x: 0, y: 0 }, { x: 4, y: 0 })).toEqual({ x: 2, y: 0 });
  });

  it('中间有 FREEZE_WALL 时被挡（AC-MT-5）', () => {
    const floor = makeFloorWith([makeEntity('fw1', 'FREEZE_WALL', { x: 2, y: 0 })]);
    expect(checkLos(floor, { x: 0, y: 0 }, { x: 4, y: 0 })).toEqual({ x: 2, y: 0 });
  });

  it('地面型 SAND_PIT 不挡视线（AC-MT-5）', () => {
    const floor = makeFloorWith([makeEntity('sp1', 'SAND_PIT', { x: 2, y: 0 })]);
    expect(checkLos(floor, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
  });

  it('地面型 LAVA_TILE 不挡视线（AC-MT-5）', () => {
    const floor = makeFloorWith([makeEntity('lv1', 'LAVA_TILE', { x: 2, y: 0 })]);
    expect(checkLos(floor, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
  });

  it('地面型 ICE_TILE 不挡视线（AC-MT-5）', () => {
    const floor = makeFloorWith([makeEntity('it1', 'ICE_TILE', { x: 2, y: 0 })]);
    expect(checkLos(floor, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
  });

  it('consumed 的 ROCK 不挡视线（已破坏）', () => {
    const floor = makeFloorWith([makeEntity('r1', 'ROCK', { x: 2, y: 0 }, { consumed: true })]);
    expect(checkLos(floor, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
  });

  it('相邻格（无中间格）：视线永远通畅', () => {
    const floor = makeFloorWith([makeEntity('r1', 'ROCK', { x: 1, y: 0 })]);
    // 玩家(0,0)→怪(1,0)，ROCK 在(1,0)=目标格，不是中间格，不遮挡
    expect(checkLos(floor, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });
});

// ── 玩家攻击 LOS（AC-MT-4）──────────────────────────────────────

describe('playerAttack — 远程 LOS 校验（AC-MT-4）', () => {
  function makeArcherState(playerPos: Coord, monsterPos: Coord, terrainEntities: ReturnType<typeof makeEntity>[] = []) {
    return makeExpeditionState({
      floorOverrides: {
        player: playerPos,
        monsters: [makeMonster('m1', monsterPos, { hp: 100, maxHp: 100, attack: 5, range: 1 })],
        entities: terrainEntities,
        ap: 99,
      },
      playerOverrides: {
        classId: 'ARCHER',
        classTraits: [],
        // 给射程 3 (BASE_ATTACK_RANGE=1 + ARCHER.attackRangeBonus=2)
        equipment: { WEAPON: { id: 'w1', name: '测试弓', slot: 'WEAPON', quality: 'COMMON', baseStat: 0, trait: 'none' } },
      },
    });
  }

  it('无遮挡时远程攻击正常命中', () => {
    // ARCHER 射程=3，怪物距离=3，无地形
    const state = makeArcherState({ x: 0, y: 0 }, { x: 0, y: 3 }, []);
    const result = playerAttack(state, 'm1');
    expect(result.events.some((e) => e.type === 'ATTACK')).toBe(true);
    expect(result.events.some((e) => e.type === 'ATTACK_BLOCKED_BY_COVER')).toBe(false);
  });

  it('中间有 ROCK 时远程攻击被遮挡，emit ATTACK_BLOCKED_BY_COVER（AC-MT-4）', () => {
    const rock = makeEntity('r1', 'ROCK', { x: 0, y: 1 });
    const state = makeArcherState({ x: 0, y: 0 }, { x: 0, y: 3 }, [rock]);
    const result = playerAttack(state, 'm1');
    expect(result.events.some((e) => e.type === 'ATTACK_BLOCKED_BY_COVER')).toBe(true);
    expect(result.events.some((e) => e.type === 'ATTACK')).toBe(false);
    const blocked = result.events.find((e) => e.type === 'ATTACK_BLOCKED_BY_COVER');
    expect(blocked?.type === 'ATTACK_BLOCKED_BY_COVER' && blocked.attackerId).toBe('PLAYER');
  });

  it('近战（range=1）不受 LOS 影响，相邻格有 ROCK 也能打（AC-MT-4）', () => {
    // 近战玩家，怪物距离=1，ROCK 在怪物所在格旁边（无中间格）
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [makeMonster('m1', { x: 0, y: 1 }, { hp: 100, maxHp: 100, attack: 5, range: 1 })],
        entities: [makeEntity('r1', 'ROCK', { x: 0, y: 2 })],
        ap: 99,
      },
    });
    const result = playerAttack(state, 'm1');
    expect(result.events.some((e) => e.type === 'ATTACK')).toBe(true);
    expect(result.events.some((e) => e.type === 'ATTACK_BLOCKED_BY_COVER')).toBe(false);
  });
});

// ── 怪物攻击 LOS 对称性（AC-MT-4）─────────────────────────────

describe('monsterAttack — 远程怪 LOS 对称（AC-MT-4）', () => {
  it('远程怪（range=3）无遮挡时正常攻击玩家', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [makeMonster('m1', { x: 0, y: 3 }, { hp: 100, maxHp: 100, attack: 10, range: 3 })],
        entities: [],
      },
      playerOverrides: { hp: 200, maxHp: 200 },
    });
    const result = monsterAttack(state, 'm1');
    expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
    expect(result.events.some((e) => e.type === 'ATTACK_BLOCKED_BY_COVER')).toBe(false);
  });

  it('远程怪被 ICE_WALL 遮挡时无法攻击玩家，emit ATTACK_BLOCKED_BY_COVER（AC-MT-4）', () => {
    const iceWall = makeEntity('iw1', 'ICE_WALL', { x: 0, y: 1 }, { hp: 10 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [makeMonster('m1', { x: 0, y: 3 }, { hp: 100, maxHp: 100, attack: 10, range: 3 })],
        entities: [iceWall],
      },
      playerOverrides: { hp: 200, maxHp: 200 },
    });
    const result = monsterAttack(state, 'm1');
    expect(result.events.some((e) => e.type === 'ATTACK_BLOCKED_BY_COVER')).toBe(true);
    expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(false);
    const blocked = result.events.find((e) => e.type === 'ATTACK_BLOCKED_BY_COVER');
    expect(blocked?.type === 'ATTACK_BLOCKED_BY_COVER' && blocked.attackerId).toBe('m1');
    expect(blocked?.type === 'ATTACK_BLOCKED_BY_COVER' && blocked.targetId).toBe('PLAYER');
  });

  it('近战怪（range=1）不受 LOS 影响，直接攻击（AC-MT-4）', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [makeMonster('m1', { x: 0, y: 1 }, { hp: 100, maxHp: 100, attack: 10, range: 1 })],
        entities: [],
      },
      playerOverrides: { hp: 200, maxHp: 200 },
    });
    const result = monsterAttack(state, 'm1');
    expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
  });
});
