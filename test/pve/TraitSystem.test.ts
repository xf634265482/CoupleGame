// AC-16 M2 职业词条系统单测：覆盖 15 个词条在 playerAttack / monsterAttack /
// applyMove / stepMonsters 中的实际效果，以及 AnimaSystem 按职业分组的强化池。

import { playerAttack, playerAttackPower, monsterAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { applyMove } from '../../assets/scripts/pve/core/MovementSystem';
import { stepMonsters } from '../../assets/scripts/pve/core/MonsterAI';
import {
  BERSERKER_STRENGTHEN_POOL,
  ARCHER_STRENGTHEN_POOL,
  ROGUE_STRENGTHEN_POOL,
  addAnima,
} from '../../assets/scripts/pve/core/AnimaSystem';
import { makeExpeditionState, makeMonster } from './helpers';

// ── 辅助：构造拥有特定词条的玩家状态 ──────────────────────────────────

function stateWithTrait(
  traits: string[],
  extra: Parameters<typeof makeExpeditionState>[0] = {},
) {
  return makeExpeditionState({
    ...extra,
    playerOverrides: { ...(extra.playerOverrides ?? {}), classTraits: traits },
  });
}

// ══════════════════════════════════════════════════════════════════════
// BERSERKER 词条
// ══════════════════════════════════════════════════════════════════════

describe('词条：life_steal 吸血（BERSERKER）', () => {
  it('命中后玩家 HP +10（不超过 maxHp）', () => {
    const state = stateWithTrait(['life_steal'], {
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100 })],
      },
      playerOverrides: { hp: 150, maxHp: 200, classTraits: ['life_steal'] },
    });
    const result = playerAttack(state, 'm1');
    expect(result.state.player.hp).toBe(158); // V2: 150 + 8
  });

  it('HP 已满时不溢出', () => {
    const state = stateWithTrait(['life_steal'], {
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 10 })],
      },
      playerOverrides: { hp: 20, maxHp: 20, classTraits: ['life_steal'] },
    });
    const result = playerAttack(state, 'm1');
    expect(result.state.player.hp).toBe(20); // 不超 maxHp
  });
});

describe('词条：berserk 狂暴（BERSERKER）', () => {
  it('HP ≤ 50% 时伤害 +1', () => {
    const state = stateWithTrait(['berserk'], {
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 10 })],
      },
      playerOverrides: { hp: 8, maxHp: 20, classTraits: ['berserk'] }, // 8 ≤ 10 → 触发
    });
    const result = playerAttack(state, 'm1');
    const atk = result.events.find((e) => e.type === 'ATTACK');
    expect(atk?.type === 'ATTACK' && atk.damage).toBeGreaterThanOrEqual(2); // 基础 1 + berserk 1
  });

  it('HP > 50% 时不触发', () => {
    const state = stateWithTrait(['berserk'], {
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 10 })],
      },
      playerOverrides: { hp: 15, maxHp: 20, classTraits: ['berserk'] }, // 15 > 10 → 不触发
    });
    const result = playerAttack(state, 'm1');
    const atk = result.events.find((e) => e.type === 'ATTACK');
    expect(atk?.type === 'ATTACK' && atk.damage).toBe(10); // 基础 10，无加成
  });
});

describe('词条：blood_rage 血怒（BERSERKER）', () => {
  it('击杀目标时回复 20 HP', () => {
    const state = stateWithTrait(['blood_rage'], {
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 1 })], // 1 HP → 必死
      },
      playerOverrides: { hp: 140, maxHp: 200, classTraits: ['blood_rage'] },
    });
    const result = playerAttack(state, 'm1');
    expect(result.state.player.hp).toBe(155); // V2: 140 + 15
  });

  it('未击杀时不触发', () => {
    const state = stateWithTrait(['blood_rage'], {
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100 })],
      },
      playerOverrides: { hp: 140, maxHp: 200, classTraits: ['blood_rage'] },
    });
    const result = playerAttack(state, 'm1');
    expect(result.state.player.hp).toBe(140); // 未击杀，不回血
  });
});

describe('词条：undying 不屈（BERSERKER）', () => {
  it('本层首次将死时保留 1 HP', () => {
    const state = stateWithTrait(['undying'], {
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { attack: 99, range: 1 })],
      },
      playerOverrides: { hp: 5, maxHp: 20, classTraits: ['undying'] },
    });
    const result = monsterAttack(state, 'm1');
    expect(result.state.player.hp).toBe(1); // 保留 1 HP
    expect(result.state.status).toBe('ACTIVE');
    expect(result.state.floorState.undyingAvailable).toBe(false); // 已使用
    expect(result.events.some((e) => e.type === 'PLAYER_DEAD')).toBe(false);
  });

  it('第二次将死时不再保护（undyingAvailable=false）', () => {
    const state = stateWithTrait(['undying'], {
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { attack: 99, range: 1 })],
      },
      playerOverrides: { hp: 3, maxHp: 20, classTraits: ['undying'], undyingUsedChapter: 1 },
    });
    const result = monsterAttack(state, 'm1');
    expect(result.state.player.hp).toBe(0);
    expect(result.state.status).toBe('DEAD');
  });
});

describe('词条：counter 反击（BERSERKER）', () => {
  it('受击时攻击者 HP -10（最低 1）', () => {
    const state = stateWithTrait(['counter'], {
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 50, maxHp: 50, attack: 1, range: 1 })],
      },
      playerOverrides: { hp: 200, maxHp: 200, classTraits: ['counter'] },
    });
    const result = monsterAttack(state, 'm1');
    const m1 = result.state.floorState.monsters.find((m) => m.id === 'm1');
    expect(m1?.hp).toBe(40); // 50 - 10 = 40
  });

  it('反击不触发击杀（HP 下限 1）', () => {
    const state = stateWithTrait(['counter'], {
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 1, maxHp: 5, attack: 1, range: 1 })],
      },
      playerOverrides: { hp: 20, maxHp: 20, classTraits: ['counter'] },
    });
    const result = monsterAttack(state, 'm1');
    const m1 = result.state.floorState.monsters.find((m) => m.id === 'm1');
    expect(m1?.hp).toBe(1); // 不会杀死攻击者
    expect(m1?.aiState).not.toBe('DEAD');
  });
});

// ══════════════════════════════════════════════════════════════════════
// ARCHER 词条
// ══════════════════════════════════════════════════════════════════════

describe('词条：eagle_eye 鹰眼（ARCHER）', () => {
  it('攻击范围 +1，可攻击到 BASE+1=2 以外的目标', () => {
    const stateWith = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 6 }, { hp: 5 })], // 距离 2，超出基础范围 1
      },
      playerOverrides: { classTraits: ['eagle_eye'] },
    });
    // 持有 eagle_eye（range=2）可攻击距离 2 的目标
    const result = playerAttack(stateWith, 'm1');
    expect(result.events.some((e) => e.type === 'ATTACK')).toBe(true);

    const stateWithout = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 6 }, { hp: 5 })],
      },
    });
    // 无词条（range=1）无法攻击距离 2 的目标
    expect(playerAttack(stateWithout, 'm1').events).toEqual([]);
  });
});

describe('词条：marksman 射手精通（ARCHER）', () => {
  it('攻击力加 5（×10 基准，原 +0.5）', () => {
    const player = makeExpeditionState({
      playerOverrides: { classTraits: ['marksman'] },
    }).player;
    expect(playerAttackPower(player).damage).toBe(14); // V2: 10 + 4
  });
});

describe('词条：crit 暴击（ARCHER）', () => {
  it('大量攻击时有一定比例造成 2 倍伤害（概率约 10%）', () => {
    let critCount = 0;

    for (let i = 0; i < 500; i++) {
      const s = makeExpeditionState({
        seed: i + 1,
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100 })],
        },
        playerOverrides: { classTraits: ['crit'] },
      });
      const result = playerAttack(s, 'm1');
      const atk = result.events.find((e) => e.type === 'ATTACK');
      if (atk?.type === 'ATTACK' && atk.damage === 20) critCount++; // 基础 10 * 2
    }
    // 期望约 50/500=10%，允许误差
    expect(critCount / 500).toBeGreaterThan(0.03);
    expect(critCount / 500).toBeLessThan(0.22);
  });

  it('确定性：相同 rngState → 相同暴击结果（AC-13）', () => {
    const make = () => makeExpeditionState({
      seed: 7777,
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100 })],
      },
      playerOverrides: { classTraits: ['crit'] },
    });
    const a = playerAttack(make(), 'm1');
    const b = playerAttack(make(), 'm1');
    expect(a.events).toEqual(b.events);
  });
});

describe('词条：multi_shot 连射（ARCHER）', () => {
  it('大量攻击时约 30% 概率产生第二次 ATTACK 事件', () => {
    let twoShotCount = 0;
    for (let i = 0; i < 500; i++) {
      const s = makeExpeditionState({
        seed: i + 100,
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100 })],
        },
        playerOverrides: { classTraits: ['multi_shot'] },
      });
      const result = playerAttack(s, 'm1');
      const attackCount = result.events.filter((e) => e.type === 'ATTACK').length;
      if (attackCount >= 2) twoShotCount++;
    }
    expect(twoShotCount / 500).toBeGreaterThan(0.15);
    expect(twoShotCount / 500).toBeLessThan(0.45);
  });

  it('连射确定性：相同 rngState → 相同结果（AC-13）', () => {
    const make = () => makeExpeditionState({
      seed: 3333,
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100 })],
      },
      playerOverrides: { classTraits: ['multi_shot'] },
    });
    expect(playerAttack(make(), 'm1').events).toEqual(playerAttack(make(), 'm1').events);
  });
});

// ══════════════════════════════════════════════════════════════════════
// ROGUE 词条
// ══════════════════════════════════════════════════════════════════════

describe('词条：swift 疾步（ROGUE）', () => {
  it('移动消耗 AP 为 1（非 swift 为 2）', () => {
    const { createFogGrid } = require('../../assets/scripts/pve/core/FogSystem');
    const base = {
      size: 8 as const,
      player: { x: 0, y: 4 }, // 从 x=0 出发，RIGHT 方向有 7 格空间
      ap: 4,
      monsters: [],
      revealed: createFogGrid(8),
    };

    // 无 swift：4 AP 可移动 2 次（每次 -2）
    const noSwift = makeExpeditionState({ floorOverrides: base });
    const r1 = applyMove(noSwift, 'RIGHT');
    const r2 = applyMove(r1.state, 'RIGHT');
    const r3 = applyMove(r2.state, 'RIGHT'); // AP=0, should fail
    expect(r1.state.floorState.ap).toBe(2);
    expect(r2.state.floorState.ap).toBe(0);
    expect(r3.state).toBe(r2.state); // no-op

    // 有 swift：4 AP 可移动 4 次（每次 -1），x: 0→1→2→3→4
    const withSwift = makeExpeditionState({
      floorOverrides: base,
      playerOverrides: { classTraits: ['swift'] },
    });
    let s = withSwift;
    for (let i = 0; i < 4; i++) s = applyMove(s, 'RIGHT').state;
    expect(s.floorState.ap).toBe(0);
    expect(s.floorState.player.x).toBe(4); // 0+4
  });
});

describe('词条：backstab 背刺（ROGUE）', () => {
  it('移动后 backstabAvailable=true', () => {
    const { createFogGrid } = require('../../assets/scripts/pve/core/FogSystem');
    const state = makeExpeditionState({
      floorOverrides: {
        size: 8,
        player: { x: 3, y: 4 },
        ap: 10,
        monsters: [],
        revealed: createFogGrid(8),
      },
      playerOverrides: { classTraits: ['backstab'] },
    });
    const moved = applyMove(state, 'RIGHT');
    expect(moved.state.floorState.backstabAvailable).toBe(true);
  });

  it('移动后首次攻击双倍伤害，backstabAvailable 重置为 false', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100 })],
        backstabAvailable: true,
      },
      playerOverrides: { classTraits: ['backstab'] },
    });
    const result = playerAttack(state, 'm1');
    const atk = result.events.find((e) => e.type === 'ATTACK');
    expect(atk?.type === 'ATTACK' && atk.damage).toBe(15); // V2: 10 * 1.5
    expect(result.state.floorState.backstabAvailable).toBe(false);
  });

  it('未移动时不触发背刺（backstabAvailable=false 默认）', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100 })],
        // backstabAvailable 未设置 → 默认 false
      },
      playerOverrides: { classTraits: ['backstab'] },
    });
    const result = playerAttack(state, 'm1');
    const atk = result.events.find((e) => e.type === 'ATTACK');
    expect(atk?.type === 'ATTACK' && atk.damage).toBe(10); // 无背刺加成
  });
});

describe('词条：assassin_heart 刺客之心（ROGUE）', () => {
  it('目标为 IDLE 时伤害 +20', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100, aiState: 'IDLE' })],
      },
      playerOverrides: { classTraits: ['assassin_heart'] },
    });
    const result = playerAttack(state, 'm1');
    const atk = result.events.find((e) => e.type === 'ATTACK');
    expect(atk?.type === 'ATTACK' && atk.damage).toBe(12); // V2: 10 * 1.2
  });

  it('目标为 CHASE 时不触发', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100, aiState: 'CHASE' })],
      },
      playerOverrides: { classTraits: ['assassin_heart'] },
    });
    const result = playerAttack(state, 'm1');
    const atk = result.events.find((e) => e.type === 'ATTACK');
    expect(atk?.type === 'ATTACK' && atk.damage).toBe(10); // 无加成
  });
});

describe('词条：afterimage 残影（ROGUE）', () => {
  it('本层首次受击时闪避（无伤害，hasAfterimage 置 false）', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { attack: 99, range: 1 })],
        // hasAfterimage 未设置 → 默认 true
      },
      playerOverrides: { hp: 10, maxHp: 20, classTraits: ['afterimage'] },
    });
    const result = monsterAttack(state, 'm1');
    expect(result.state.player.hp).toBe(10); // 无伤害
    // 闪避不产生伤害事件，但仍会揭示攻击者所在格
    expect(result.events).toEqual([]);
    expect(result.state.floorState.hasAfterimage).toBe(false);
  });

  it('闪避消耗后（hasAfterimage=false）正常受伤', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { attack: 30, range: 1 })],
        hasAfterimage: false, // 已使用
      },
      playerOverrides: { hp: 100, maxHp: 200, classTraits: ['afterimage'] },
    });
    const result = monsterAttack(state, 'm1');
    expect(result.state.player.hp).toBe(70); // 100 - 30
    expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
  });
});

describe('词条：stealth 潜行（ROGUE）', () => {
  it('怪物仇恨范围对持有潜行的玩家缩小 2', () => {
    // 精英怪 aggroRadius=3，玩家距离 2 → 无潜行时进入范围，有潜行时不进（3-2=1 < 2）
    const noStealth = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 6 }, // 距离 2
        monsters: [makeMonster('m1', { x: 4, y: 4 }, { aggroRadius: 3 })],
      },
    });
    const withStealth = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 6 },
        monsters: [makeMonster('m1', { x: 4, y: 4 }, { aggroRadius: 3 })],
      },
      playerOverrides: { classTraits: ['stealth'] },
    });

    const r1 = stepMonsters(noStealth);
    const r2 = stepMonsters(withStealth);
    const m1 = r1.state.floorState.monsters[0];
    const m2 = r2.state.floorState.monsters[0];

    // 无潜行：进入范围 → 怪物追击/移动
    expect(m1.aiState).toBe('CHASE');
    // 有潜行：仇恨范围有效 1 < 距离 2 → 怪物保持 IDLE
    expect(m2.aiState).toBe('IDLE');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 装备 ARMOR 减伤（AC-17）
// ══════════════════════════════════════════════════════════════════════

describe('装备 ARMOR 减伤（AC-17）', () => {
  it('ARMOR.baseStat=20 时怪物 30 攻击 → 玩家只受 10 伤（max(10, 30-20)）', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { attack: 30, range: 1 })],
      },
      playerOverrides: {
        hp: 200,
        maxHp: 200,
        equipment: { ARMOR: { id: 'a1', slot: 'ARMOR', quality: 'FINE', name: '铁甲', baseStat: 20 } },
      },
    });
    const result = monsterAttack(state, 'm1');
    const ev = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
    expect(ev?.type === 'PLAYER_DAMAGED' && ev.damage).toBe(10); // max(10, 30-20)
    expect(result.state.player.hp).toBe(190);
  });

  it('无 ARMOR 时伤害不变', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [makeMonster('m1', { x: 4, y: 5 }, { attack: 30, range: 1 })],
      },
      playerOverrides: { hp: 200, maxHp: 200 },
    });
    const result = monsterAttack(state, 'm1');
    expect(result.state.player.hp).toBe(170); // 200 - 30
  });
});

// ══════════════════════════════════════════════════════════════════════
// AnimaSystem — 按职业分组的强化池（AC-16）
// ══════════════════════════════════════════════════════════════════════

describe('AnimaSystem — 职业分组强化池（AC-16）', () => {
  it('BERSERKER 玩家触发强化时候选项来自 BERSERKER 池', () => {
    const state = makeExpeditionState({
      playerOverrides: {
        classId: 'BERSERKER',
        animaProgress: 90,
      },
    });
    const result = addAnima(state, 20); // 90+20=110 → 触发一次
    const ev = result.events.find((e) => e.type === 'ANIMA_STRENGTHEN');
    expect(ev?.type === 'ANIMA_STRENGTHEN' && ev.choices.length).toBe(3);
    ev?.type === 'ANIMA_STRENGTHEN' && ev.choices.forEach((c) =>
      expect(BERSERKER_STRENGTHEN_POOL).toContain(c),
    );
  });

  it('ARCHER 玩家触发强化时候选项来自 ARCHER 池', () => {
    const state = makeExpeditionState({
      playerOverrides: { classId: 'ARCHER', animaProgress: 90 },
    });
    const result = addAnima(state, 20);
    const ev = result.events.find((e) => e.type === 'ANIMA_STRENGTHEN');
    ev?.type === 'ANIMA_STRENGTHEN' && ev.choices.forEach((c) =>
      expect(ARCHER_STRENGTHEN_POOL).toContain(c),
    );
  });

  it('ROGUE 玩家触发强化时候选项来自 ROGUE 池', () => {
    const state = makeExpeditionState({
      playerOverrides: { classId: 'ROGUE', animaProgress: 90 },
    });
    const result = addAnima(state, 20);
    const ev = result.events.find((e) => e.type === 'ANIMA_STRENGTHEN');
    ev?.type === 'ANIMA_STRENGTHEN' && ev.choices.forEach((c) =>
      expect(ROGUE_STRENGTHEN_POOL).toContain(c),
    );
  });

  it('候选项互不重复，数量为 3', () => {
    for (const classId of ['BERSERKER', 'ARCHER', 'ROGUE'] as const) {
      const state = makeExpeditionState({ playerOverrides: { classId, animaProgress: 90 } });
      const result = addAnima(state, 20);
      const ev = result.events.find((e) => e.type === 'ANIMA_STRENGTHEN');
      expect(ev?.type === 'ANIMA_STRENGTHEN' && ev.choices.length).toBe(3);
      if (ev?.type === 'ANIMA_STRENGTHEN') {
        expect(new Set(ev.choices).size).toBe(3);
      }
    }
  });
});
