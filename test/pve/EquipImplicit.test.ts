// 装备 implicit 优缺点战斗/移动效果单测（AC-EQ-3）
// 覆盖：斧 AP+1、矛射程+1、板甲移动AP+1、重盔警戒+1

import { playerAttack, playerAttackPower } from '../../assets/scripts/pve/core/CombatSystem';
import { applyMove } from '../../assets/scripts/pve/core/MovementSystem';
import { stepMonsters } from '../../assets/scripts/pve/core/MonsterAI';
import {
  IMPLICIT_ARMOR_PLATE,
  IMPLICIT_HELMET_HEAVY,
  IMPLICIT_WEAPON_AXE,
  IMPLICIT_WEAPON_SPEAR,
} from '../../assets/scripts/pve/core/EquipmentSystem';
import { makeExpeditionState, makeMonster, makeRunPlayer } from './helpers';
import type { EquipItem } from '../../assets/scripts/pve/core/PveTypes';

// ── 公共夹具 ────────────────────────────────────────────────────────

function makeWeapon(name: string, baseStat: number, implicit?: string): EquipItem {
  return { id: `test_${name}`, slot: 'WEAPON', quality: 'RARE', name, baseStat, implicit };
}
function makeArmor(name: string, baseStat: number, implicit?: string): EquipItem {
  return { id: `test_${name}`, slot: 'ARMOR', quality: 'RARE', name, baseStat, implicit };
}
function makeHelmet(name: string, baseStat: number, implicit?: string): EquipItem {
  return { id: `test_${name}`, slot: 'HELMET', quality: 'RARE', name, baseStat, implicit };
}

// ── weapon_axe：攻击消耗额外 AP+1 ──────────────────────────────────
describe('implicit weapon_axe — 攻击AP+1（AC-EQ-3）', () => {
  it('装备斧时攻击失败（AP=3，斧需AP=4）', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        ap: 3,
        monsters: [makeMonster('m1', { x: 3, y: 3 }, { aiState: 'CHASE' })],
      },
      playerOverrides: makeRunPlayer({
        equipment: { WEAPON: makeWeapon('钢铁战斧', 30, IMPLICIT_WEAPON_AXE) },
      }),
    });
    // 玩家在 (player.x, player.y)，怪物在 (3,3)——只要距离 ≤1 就能攻击
    // 把玩家移到 (2,3)（紧邻(3,3)），攻击需 AP_COST.ATTACK=3 + axe=1 = 4
    const nearState = { ...state, floorState: { ...state.floorState, player: { x: 2, y: 3 }, ap: 3 } };
    const result = playerAttack(nearState, 'm1');
    // AP=3 < 需要的 4，no-op（不产生 ATTACK 事件）
    expect(result.events.filter((e) => e.type === 'ATTACK')).toHaveLength(0);
    expect(result.state.floorState.ap).toBe(3); // AP 未消耗
  });

  it('装备斧时攻击成功（AP=4）', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
      },
      playerOverrides: makeRunPlayer({
        equipment: { WEAPON: makeWeapon('钢铁战斧', 30, IMPLICIT_WEAPON_AXE) },
      }),
    });
    const nearState = { ...state, floorState: { ...state.floorState, player: { x: 1, y: 3 }, ap: 4 } };
    const result = playerAttack(nearState, 'm1');
    expect(result.events.some((e) => e.type === 'ATTACK')).toBe(true);
    expect(result.state.floorState.ap).toBe(0); // 消耗了 4 AP
  });

  it('无 implicit 的剑只需 AP=3 攻击', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
      },
      playerOverrides: makeRunPlayer({
        equipment: { WEAPON: makeWeapon('精钢剑', 30) }, // 无 implicit
      }),
    });
    const nearState = { ...state, floorState: { ...state.floorState, player: { x: 1, y: 3 }, ap: 3 } };
    const result = playerAttack(nearState, 'm1');
    expect(result.events.some((e) => e.type === 'ATTACK')).toBe(true);
  });
});

// ── weapon_spear：攻击范围+1 ─────────────────────────────────────────
describe('implicit weapon_spear — 攻击范围+1（AC-EQ-3）', () => {
  it('装备矛时攻击范围为 2', () => {
    const player = makeRunPlayer({
      equipment: { WEAPON: makeWeapon('精钢长枪', 26, IMPLICIT_WEAPON_SPEAR) },
    });
    const { range } = playerAttackPower(player);
    expect(range).toBe(2); // base range 1 + spear +1
  });

  it('无 implicit 剑范围为 1', () => {
    const player = makeRunPlayer({
      equipment: { WEAPON: makeWeapon('精钢剑', 30) },
    });
    const { range } = playerAttackPower(player);
    expect(range).toBe(1);
  });

  it('装备矛可以攻击距离 2 的怪物', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 3, y: 3 }, { aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
        revealed: Array(8).fill(null).map(() => Array(8).fill(true)),
      },
      playerOverrides: makeRunPlayer({
        equipment: { WEAPON: makeWeapon('精钢长枪', 26, IMPLICIT_WEAPON_SPEAR) },
      }),
    });
    // 玩家在 (1,3)，怪在 (3,3)，曼哈顿距离=2，矛射程=2，应可攻击
    const nearState = { ...state, floorState: { ...state.floorState, player: { x: 1, y: 3 }, ap: 4 } };
    const result = playerAttack(nearState, 'm1');
    expect(result.events.some((e) => e.type === 'ATTACK')).toBe(true);
  });

  it('装备剑无法攻击距离 2 的怪物', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 3, y: 3 }, { aiState: 'CHASE' })],
        revealed: Array(8).fill(null).map(() => Array(8).fill(true)),
      },
      playerOverrides: makeRunPlayer({
        equipment: { WEAPON: makeWeapon('精钢剑', 30) },
      }),
    });
    const nearState = { ...state, floorState: { ...state.floorState, player: { x: 1, y: 3 }, ap: 4 } };
    const result = playerAttack(nearState, 'm1');
    // 距离 2 > 范围 1，no-op
    expect(result.events.filter((e) => e.type === 'ATTACK')).toHaveLength(0);
  });
});

// ── armor_plate：移动AP+1 ────────────────────────────────────────────
describe('implicit armor_plate — 移动AP+1（AC-EQ-3）', () => {
  it('装备板甲时移动失败（AP=1，板甲需 AP=2+1=3，无靴子减耗=2 后还需 AP=2 但板甲再+1=3）', () => {
    // 无靴子时 baseCost=2 + platePenalty=1 - shoesReduction=0 = 3
    const state = makeExpeditionState({
      playerOverrides: makeRunPlayer({
        equipment: { ARMOR: makeArmor('精钢板甲', 30, IMPLICIT_ARMOR_PLATE) },
      }),
    });
    const s = { ...state, floorState: { ...state.floorState, player: { x: 4, y: 4 }, ap: 2 } };
    const result = applyMove(s, 'UP');
    // AP=2 < 需要 3，no-op
    expect(result.events.filter((e) => e.type === 'MOVE')).toHaveLength(0);
  });

  it('装备板甲 AP=3 时移动成功', () => {
    const state = makeExpeditionState({
      playerOverrides: makeRunPlayer({
        equipment: { ARMOR: makeArmor('精钢板甲', 30, IMPLICIT_ARMOR_PLATE) },
      }),
    });
    const s = { ...state, floorState: { ...state.floorState, player: { x: 4, y: 4 }, ap: 3 } };
    const result = applyMove(s, 'UP');
    expect(result.events.some((e) => e.type === 'MOVE')).toBe(true);
    expect(result.state.floorState.ap).toBe(0);
  });

  it('无 implicit 的锁甲移动只需 AP=2（有靴子shoesReduction=1 后=1）', () => {
    const state = makeExpeditionState({
      playerOverrides: makeRunPlayer({
        equipment: { ARMOR: makeArmor('精钢锁甲', 26) }, // 无 implicit，无靴子
      }),
    });
    const s = { ...state, floorState: { ...state.floorState, player: { x: 4, y: 4 }, ap: 2 } };
    const result = applyMove(s, 'UP');
    expect(result.events.some((e) => e.type === 'MOVE')).toBe(true);
  });
});

// ── helmet_heavy：怪物警戒+1 ────────────────────────────────────────
describe('implicit helmet_heavy — 怪物警戒范围+1（AC-EQ-3）', () => {
  it('装备重盔时，原本恰好不在 aggroRadius 内的怪物会进入 CHASE', () => {
    // 怪物 aggroRadius=3，玩家距离=4
    // 无重盔：4 > 3，不在警戒 → IDLE
    // 有重盔：stealthReduction 减少 1 → 有效感知距离 = 3 - (-1) = 4 → 4 <= 4 → CHASE
    const monsterPos = { x: 4, y: 4 };
    const playerPos = { x: 0, y: 4 }; // 曼哈顿距离 = 4

    const stateNoHelmet = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', monsterPos, { aggroRadius: 3, aiState: 'IDLE' })],
      },
      playerOverrides: makeRunPlayer({ equipment: {} }),
    });
    const s1 = { ...stateNoHelmet, floorState: { ...stateNoHelmet.floorState, player: playerPos } };
    const r1 = stepMonsters(s1);
    const monAfter1 = r1.state.floorState.monsters.find((m) => m.id === 'm1')!;
    expect(monAfter1.aiState).toBe('IDLE'); // 距离 4 > aggroRadius 3，不追击

    const stateWithHelmet = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', monsterPos, { aggroRadius: 3, aiState: 'IDLE' })],
      },
      playerOverrides: makeRunPlayer({
        equipment: { HELMET: makeHelmet('精钢重盔', 60, IMPLICIT_HELMET_HEAVY) },
      }),
    });
    const s2 = { ...stateWithHelmet, floorState: { ...stateWithHelmet.floorState, player: playerPos } };
    const r2 = stepMonsters(s2);
    const monAfter2 = r2.state.floorState.monsters.find((m) => m.id === 'm1')!;
    // 有重盔：helmetAggroPenalty=1 → stealthReduction=-1 → 有效感知距离=3-(-1)=4 → 4<=4 → CHASE
    expect(monAfter2.aiState).toBe('CHASE');
  });
});
