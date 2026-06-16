// 第 2-5 章灵气怪差异化行为测试（260616 灵气怪升级）。

import { stepMonsters } from '../../assets/scripts/pve/core/MonsterAI';
import { playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import {
  makeSpiritBeetle,
  makeSpiritElf,
  makeSpiritEmber,
  makeSpiritMirage,
  VARIANT_SPIRIT_BEETLE,
  VARIANT_SPIRIT_ELF,
  VARIANT_SPIRIT_EMBER,
  VARIANT_SPIRIT_MIRAGE,
} from '../../assets/scripts/pve/core/ChapterAnimaMonsters';
import {
  ANIMA_BEETLE_TRAP_DURATION,
  ANIMA_ELF_TRAP_DURATION,
  ANIMA_EMBER_LAVA_DURATION,
} from '../../assets/scripts/pve/core/PveConstants';
import type { PveEvent } from '../../assets/scripts/pve/core/PveTypes';
import { makeExpeditionState } from './helpers';

describe('SPIRIT_BEETLE (CH2) — 逃跑离开格生成沙坑', () => {
  it('逃跑后离开的原格出现 SAND_PIT 实体并 emit ANIMA_TRAP_SPAWNED', () => {
    const beetle = makeSpiritBeetle('b1', { x: 4, y: 4 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 6 },
        monsters: [beetle],
        entities: [],
      },
    });
    const result = stepMonsters(state);
    const m = result.state.floorState.monsters.find((mm) => mm.id === 'b1')!;
    expect(m.aiState).toBe('FLEE');
    expect(m.pos).not.toEqual({ x: 4, y: 4 });

    const trap = result.state.floorState.entities.find(
      (e) => e.type === 'SAND_PIT' && e.pos.x === 4 && e.pos.y === 4,
    );
    expect(trap).toBeDefined();
    expect(trap?.remaining).toBe(ANIMA_BEETLE_TRAP_DURATION);
    expect(trap?.consumed).toBe(false);

    const trapEvent = result.events.find((e) => e.type === 'ANIMA_TRAP_SPAWNED') as
      | Extract<PveEvent, { type: 'ANIMA_TRAP_SPAWNED' }>
      | undefined;
    expect(trapEvent).toBeDefined();
    expect(trapEvent?.entityType).toBe('SAND_PIT');
    expect(trapEvent?.variantId).toBe(VARIANT_SPIRIT_BEETLE);
    expect(trapEvent?.pos).toEqual({ x: 4, y: 4 });
  });

  it('玩家不在感知范围内时不逃跑也不生成沙坑', () => {
    const beetle = makeSpiritBeetle('b1', { x: 0, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 7, y: 7 },
        monsters: [beetle],
        entities: [],
      },
    });
    const result = stepMonsters(state);
    expect(result.state.floorState.entities).toEqual([]);
    expect(result.events).toEqual([]);
  });
});

describe('SPIRIT_ELF (CH3) — 逃跑离开格生成冰面', () => {
  it('逃跑后离开的原格出现 ICE_TILE 实体并带 remaining 倒计时', () => {
    const elf = makeSpiritElf('e1', { x: 3, y: 3 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 3, y: 5 },
        monsters: [elf],
        entities: [],
      },
    });
    const result = stepMonsters(state);
    const trap = result.state.floorState.entities.find(
      (e) => e.type === 'ICE_TILE' && e.pos.x === 3 && e.pos.y === 3,
    );
    expect(trap).toBeDefined();
    expect(trap?.remaining).toBe(ANIMA_ELF_TRAP_DURATION);

    const trapEvent = result.events.find((e) => e.type === 'ANIMA_TRAP_SPAWNED') as
      | Extract<PveEvent, { type: 'ANIMA_TRAP_SPAWNED' }>
      | undefined;
    expect(trapEvent?.entityType).toBe('ICE_TILE');
    expect(trapEvent?.variantId).toBe(VARIANT_SPIRIT_ELF);
  });
});

describe('SPIRIT_EMBER (CH4) — 玩家击杀时十字 4 格生成熔岩', () => {
  it('击杀后周围 4 格生成 LAVA_TILE 并 emit ANIMA_DEATH_LAVA', () => {
    const ember = makeSpiritEmber('em1', { x: 4, y: 4 });
    ember.hp = 1; // 一击毙命，避免数值波动
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 5 }, // 相邻方便平攻
        monsters: [ember],
        entities: [],
        ap: 100,
      },
    });
    const result = playerAttack(state, 'em1');
    const killed = result.state.floorState.monsters.find((m) => m.id === 'em1');
    expect(killed?.aiState).toBe('DEAD');

    const lavas = result.state.floorState.entities.filter((e) => e.type === 'LAVA_TILE');
    expect(lavas.length).toBe(4);
    for (const tile of lavas) {
      expect(tile.remaining).toBe(ANIMA_EMBER_LAVA_DURATION);
    }

    const lavaEvent = result.events.find((e) => e.type === 'ANIMA_DEATH_LAVA') as
      | Extract<PveEvent, { type: 'ANIMA_DEATH_LAVA' }>
      | undefined;
    expect(lavaEvent).toBeDefined();
    expect(lavaEvent?.tiles.length).toBe(4);
  });

  it('击杀位于边角时只生成可放置的格子（跳过越界）', () => {
    const ember = makeSpiritEmber('em1', { x: 0, y: 0 });
    ember.hp = 1;
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 1 },
        monsters: [ember],
        entities: [],
        ap: 100,
      },
    });
    const result = playerAttack(state, 'em1');
    const lavas = result.state.floorState.entities.filter((e) => e.type === 'LAVA_TILE');
    // 角落只剩 2 个有效相邻格 (x=1,y=0) 和 (x=0,y=1)
    expect(lavas.length).toBe(2);
  });

  it('事件顺序为 ATTACK → KILL → ANIMA_DEATH_LAVA → LOOT', () => {
    const ember = makeSpiritEmber('em1', { x: 4, y: 4 });
    ember.hp = 1;
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 5 },
        monsters: [ember],
        entities: [],
        ap: 100,
      },
    });
    const types = playerAttack(state, 'em1').events.map((e) => e.type);
    const iAttack = types.indexOf('ATTACK');
    const iKill = types.indexOf('KILL');
    const iLava = types.indexOf('ANIMA_DEATH_LAVA');
    const iLoot = types.indexOf('LOOT');
    expect(iAttack).toBeLessThan(iKill);
    expect(iKill).toBeLessThan(iLava);
    expect(iLava).toBeLessThan(iLoot);
  });
});

describe('SPIRIT_MIRAGE (CH5) — 玩家击杀时 50/50 Buff 或 Debuff', () => {
  it('击杀后 emit ANIMA_BUFF_GRANTED 或 ANIMA_DEBUFF_APPLIED（确定性，同种子复现）', () => {
    const make = () => {
      const mirage = makeSpiritMirage('mg1', { x: 4, y: 4 });
      mirage.hp = 1;
      return makeExpeditionState({
        seed: 12345,
        floorOverrides: {
          player: { x: 4, y: 5 },
          monsters: [mirage],
          entities: [],
          ap: 100,
        },
      });
    };
    const r1 = playerAttack(make(), 'mg1');
    const r2 = playerAttack(make(), 'mg1');
    const find = (events: PveEvent[]) =>
      events.find((e) => e.type === 'ANIMA_BUFF_GRANTED' || e.type === 'ANIMA_DEBUFF_APPLIED');
    expect(find(r1.events)).toBeDefined();
    expect(find(r1.events)?.type).toBe(find(r2.events)?.type); // 同种子同结果（AC-13）
  });

  it('variantId 标识正确', () => {
    const mirage = makeSpiritMirage('mg1', { x: 2, y: 2 });
    expect(mirage.variantId).toBe(VARIANT_SPIRIT_MIRAGE);
    expect(mirage.attack).toBe(0);
    expect(mirage.aggroRadius).toBe(6);
  });
});
