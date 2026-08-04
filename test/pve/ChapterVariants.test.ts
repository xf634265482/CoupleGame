// 第 2-5 章普通/精英怪变体行为测试（260616 P1）。
// 覆盖：charge（冲锋双格）、poison（中毒 DoT）、tank（硬甲减伤）、
//       slow（冰史莱姆/冰霜精灵减速）、burn（火焰元素灼烧）。

import { stepMonsters } from '../../assets/scripts/pve/core/MonsterAI';
import { attackIceWall, monsterAttack, playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { endTurn } from '../../assets/scripts/pve/core/ExpeditionState';
import {
  makeDesertHopperLizard,
  makeDesertRaider,
  makePoisonScorpion,
  VARIANT_DESERT_HOPPER_LIZARD,
  VARIANT_POISON_SCORPION,
} from '../../assets/scripts/pve/core/Chapter2Monsters';
import {
  makeSnowWolf,
  makeFrostspikePorcupine,
  makeFrostSprite,
  makeGlacierShaper,
  VARIANT_SNOW_WOLF,
} from '../../assets/scripts/pve/core/Chapter3Monsters';
import {
  makeLavaCrab,
  makeAshHound,
  makeFireElemental,
  VARIANT_LAVA_CRAB,
} from '../../assets/scripts/pve/core/Chapter4Monsters';
import {
  makeFateWheelBeast,
  makeFateWatcher,
  makeShadowAssassin,
  VARIANT_FATE_WHEEL_BEAST,
} from '../../assets/scripts/pve/core/Chapter5Monsters';
import {
  POISON_DAMAGE_PER_ROUND,
  POISON_ROUNDS,
  GLACIER_SHAPER_ICE_WALL_DROP_ANIMA,
  GLACIER_SHAPER_ICE_WALL_FLOOR_ANIMA_CAP,
  GLACIER_SHAPER_ICE_WALL_HP,
} from '../../assets/scripts/pve/core/PveConstants';
import { makeEntity, makeExpeditionState, makeMonster, makeRunPlayer } from './helpers';

describe('第2-5章怪物耐久曲线', () => {
  it.each([
    ['CH2 normal', makeDesertRaider('m', { x: 0, y: 0 }), 155, 8],
    ['CH2 elite', makePoisonScorpion('m', { x: 0, y: 0 }), 305, 14],
    ['CH3 normal', makeSnowWolf('m', { x: 0, y: 0 }), 250, 14],
    ['CH3 elite', makeFrostSprite('m', { x: 0, y: 0 }), 490, 24],
    ['CH4 normal', makeAshHound('m', { x: 0, y: 0 }), 410, 22],
    ['CH4 elite', makeFireElemental('m', { x: 0, y: 0 }), 790, 34],
    ['CH5 normal', makeShadowAssassin('m', { x: 0, y: 0 }), 635, 32],
    ['CH5 elite', makeFateWheelBeast('m', { x: 0, y: 0 }), 1220, 50],
  ])('%s 使用强化后的 HP 与护甲', (_name, monster, hp, armor) => {
    expect(monster.hp).toBe(hp);
    expect(monster.maxHp).toBe(hp);
    expect(monster.armor).toBe(armor);
  });
});

// ── 沙漠跃蜥：双格追击与断尾狂跃 ────────────────────────────────

describe('沙漠跃蜥（第2章）——双格追击与断尾狂跃', () => {
  it('感知范围内距玩家 4 格时冲锋 2 格', () => {
    // 使用当前沙漠跃蜥模板验证双格追击。
    const larva = makeMonster('sw1', { x: 0, y: 0 }, {
      variantId: VARIANT_DESERT_HOPPER_LIZARD,
      aggroRadius: 6,
      range: 1,
    });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [larva],
        entities: [],
      },
    });
    const result = stepMonsters(state);
    const m = result.state.floorState.monsters.find((mm) => mm.id === 'sw1')!;
    // 应移动到 x=2（冲锋 2 格朝 x=4 方向）
    expect(m.pos.x).toBe(2);
    expect(m.pos.y).toBe(0);
    expect(m.aiState).toBe('CHASE');
    const moves = result.events.filter((e) => e.type === 'MOVE');
    expect(moves.length).toBe(2);
  });

  it('距离玩家 1 格（范围内）时直接攻击，emit PLAYER_DAMAGED，不移动', () => {
    const larva = makeMonster('sw1', { x: 3, y: 0 }, {
      variantId: VARIANT_DESERT_HOPPER_LIZARD,
      aggroRadius: 6,
      attack: 12,
      range: 1,
    });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [larva],
        entities: [],
        ap: 100,
      },
    });
    const result = stepMonsters(state);
    // 怪物攻击玩家 emit PLAYER_DAMAGED
    expect(result.events.find((e) => e.type === 'PLAYER_DAMAGED')).toBeDefined();
    expect(result.events.find((e) => e.type === 'MOVE')).toBeUndefined();
  });

  it('普通怪（非冲锋）同距离只移动 1 格', () => {
    const normal = makeMonster('n1', { x: 0, y: 0 }, { aggroRadius: 6 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [normal],
        entities: [],
      },
    });
    const result = stepMonsters(state);
    const m = result.state.floorState.monsters.find((mm) => mm.id === 'n1')!;
    expect(m.pos.x).toBe(1); // 只移动 1 格
  });

  it('variantId 正确', () => {
    const larva = makeDesertHopperLizard('sw1', { x: 0, y: 0 });
    expect(larva.variantId).toBe(VARIANT_DESERT_HOPPER_LIZARD);
    expect(larva.type).toBe('NORMAL');
  });

  it('首次跌至半血时跳离，下一次成功攻击伤害翻倍并消耗状态', () => {
    const hopper = makeDesertHopperLizard('hopper1', { x: 4, y: 5 });
    hopper.hp = 85;
    const state = makeExpeditionState({
      floorOverrides: { player: { x: 4, y: 4 }, monsters: [hopper], entities: [], ap: 100 },
      playerOverrides: { hp: 500, maxHp: 500, classId: 'BERSERKER' },
    });
    const hit = playerAttack(state, hopper.id);
    const moved = hit.state.floorState.monsters[0];
    expect(hit.events.find((e) => e.type === 'HOPPER_FRENZY_TRIGGERED')).toBeDefined();
    expect(moved.hopperFrenzyUsed).toBe(true);
    expect(moved.hopperDoubleAttackReady).toBe(true);
    expect(Math.abs(moved.pos.x - 4) + Math.abs(moved.pos.y - 4)).toBeGreaterThan(1);

    const attackState = {
      ...hit.state,
      floorState: { ...hit.state.floorState, player: { x: moved.pos.x + 1, y: moved.pos.y } },
    };
    const attack = monsterAttack(attackState, hopper.id);
    expect(attack.events.find((e) => e.type === 'PLAYER_DAMAGED')).toMatchObject({ damage: 42 });
    expect(attack.events.find((e) => e.type === 'HOPPER_FRENZY_ATTACKED')).toBeDefined();
    expect(attack.state.floorState.monsters[0].hopperDoubleAttackReady).toBe(false);
  });

  it('受到距离至少 2 格的攻击后反应推进 1 格，同回合追加攻击不重复触发', () => {
    const hopper = makeDesertHopperLizard('hopper1', { x: 4, y: 7 });
    const state = makeExpeditionState({
      floorOverrides: { player: { x: 4, y: 5 }, monsters: [hopper], entities: [], ap: 100, turn: 3 },
      playerOverrides: { classId: 'ARCHER' },
    });
    const first = playerAttack(state, hopper.id);
    expect(first.state.floorState.monsters[0].pos).toEqual({ x: 4, y: 6 });
    expect(first.events.filter((e) => e.type === 'HOPPER_REACTION_ADVANCED')).toHaveLength(1);

    const second = playerAttack(first.state, hopper.id);
    expect(second.state.floorState.monsters[0].pos).toEqual({ x: 4, y: 6 });
    expect(second.events.some((e) => e.type === 'HOPPER_REACTION_ADVANCED')).toBe(false);
  });

  it('沙漠劫匪在感知范围内追击 2 格，但移动回合不追加攻击', () => {
    const raider = makeDesertRaider('raider1', { x: 0, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: { player: { x: 4, y: 0 }, monsters: [raider], entities: [] },
    });
    const result = stepMonsters(state);
    expect(result.state.floorState.monsters[0].pos).toEqual({ x: 2, y: 0 });
    expect(result.events.filter((e) => e.type === 'MOVE')).toHaveLength(2);
    expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(false);
  });
});

// ── Charge：SNOW_WOLF (CH3) ───────────────────────────────────────

describe('SNOW_WOLF (CH3) — 冲锋', () => {
  it('感知半径 5，距离 3 格时冲锋 2 格（第 2 步被玩家格阻挡则停在 1 格外）', () => {
    const wolf = makeSnowWolf('w1', { x: 0, y: 0 });
    // aggroRadius=5，player 在 x=3（dist=3≤5）在感知范围内
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 3, y: 0 },
        monsters: [wolf],
        entities: [],
      },
    });
    const result = stepMonsters(state);
    const m = result.state.floorState.monsters.find((mm) => mm.id === 'w1')!;
    // 步 1：x=0→1，步 2：x=1→2（x=3 为玩家格被占，停在 2）
    expect(m.pos.x).toBe(2);
    expect(m.aiState).toBe('CHASE');
    expect(wolf.variantId).toBe(VARIANT_SNOW_WOLF);
    // 2 次 MOVE 事件
    expect(result.events.filter((e) => e.type === 'MOVE').length).toBe(2);
  });
});

// ── Charge：VOID_WORM (CH5) ───────────────────────────────────────

describe('命轮兽（第5章）——回溯复活且不再冲锋', () => {
  it('variantId=VOID_WORM，type=ELITE', () => {
    const worm = makeFateWheelBeast('v1', { x: 0, y: 0 });
    expect(worm.variantId).toBe(VARIANT_FATE_WHEEL_BEAST);
    expect(worm.type).toBe('ELITE');
    expect(worm.hp).toBe(1220);
    expect(worm.attack).toBe(160);
    expect(worm.revivedOnce).toBeUndefined();
  });

  it('移除原冲锋后，追击时每回合只移动 1 格', () => {
    const beast = makeFateWheelBeast('v1', { x: 0, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: { player: { x: 4, y: 0 }, monsters: [beast], entities: [] },
    });
    const result = stepMonsters(state);
    expect(result.state.floorState.monsters[0].pos).toEqual({ x: 1, y: 0 });
    expect(result.events.filter((e) => e.type === 'MOVE')).toHaveLength(1);
  });
});

describe('第五章行为反制', () => {
  it('玩家连续移动后，影子刺客双格逼近但本回合不追加攻击', () => {
    const assassin = makeShadowAssassin('assassin1', { x: 0, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [assassin],
        entities: [],
        playerStepsThisTurn: 2,
      },
    });
    const result = stepMonsters(state);
    expect(result.state.floorState.monsters[0].pos).toEqual({ x: 2, y: 0 });
    expect(result.events.filter((e) => e.type === 'MOVE')).toHaveLength(2);
    expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(false);
  });

  it('玩家本回合攻击后，命运守望者适应攻击并双格逼近', () => {
    const watcher = makeFateWatcher('watcher1', { x: 0, y: 0 });
    watcher.aggroRadius = 5;
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [watcher],
        entities: [],
        playerAttackedThisTurn: true,
      },
    });
    const result = stepMonsters(state);
    expect(result.events).toContainEqual({
      type: 'FATE_WATCHER_ADAPTED',
      monsterId: watcher.id,
      action: 'ATTACK',
    });
    expect(result.state.floorState.monsters[0].pos).toEqual({ x: 2, y: 0 });
  });
});

// ── Poison（中毒）：POISON_SCORPION (CH2) ────────────────────────

describe('POISON_SCORPION (CH2) — 中毒 DoT', () => {
  it('命中玩家后 emit POISON_APPLIED，playerPoisonRounds = POISON_ROUNDS', () => {
    const scorpion = makePoisonScorpion('ps1', { x: 3, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [scorpion],
        entities: [],
        ap: 100,
      },
    });
    const result = stepMonsters(state);
    const poisonEvt = result.events.find((e) => e.type === 'POISON_APPLIED');
    expect(poisonEvt).toBeDefined();
    expect((poisonEvt as any).rounds).toBe(POISON_ROUNDS);
    expect(result.state.floorState.playerPoisonRounds).toBe(POISON_ROUNDS);
  });

  it('未命中（距离 > 1）时不施加中毒', () => {
    const scorpion = makePoisonScorpion('ps1', { x: 0, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [scorpion],
        entities: [],
      },
    });
    const result = stepMonsters(state);
    expect(result.state.floorState.playerPoisonRounds).toBeUndefined();
  });

  it('endTurn 每回合扣 POISON_DAMAGE_PER_ROUND HP，rounds -1', () => {
    const scorpion = makePoisonScorpion('ps1', { x: 7, y: 7 }); // 远离，不行动
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [scorpion],
        entities: [],
        playerPoisonRounds: 3,
      },
      playerOverrides: { hp: 100, maxHp: 100 },
    });
    const result = endTurn(state);
    expect(result.state.player.hp).toBe(100 - POISON_DAMAGE_PER_ROUND);
    expect(result.state.floorState.playerPoisonRounds).toBe(2);
    expect(result.events.find((e) => e.type === 'POISON_TICK')).toBeDefined();
  });

  it('中毒最后一回合后 playerPoisonRounds 归 undefined', () => {
    const scorpion = makePoisonScorpion('ps1', { x: 7, y: 7 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [scorpion],
        entities: [],
        playerPoisonRounds: 1,
      },
      playerOverrides: { hp: 100, maxHp: 100 },
    });
    const result = endTurn(state);
    expect(result.state.floorState.playerPoisonRounds).toBeUndefined();
  });

  it('再次命中已中毒玩家时引爆剩余毒伤并清除中毒', () => {
    const scorpion = makePoisonScorpion('ps1', { x: 3, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [scorpion],
        entities: [],
        playerPoisonRounds: 2,
        ap: 100,
      },
      playerOverrides: { hp: 2000, maxHp: 2000 },
    });
    const result = stepMonsters(state);
    expect(result.events.find((e) => e.type === 'POISON_DETONATED')).toMatchObject({
      damage: POISON_DAMAGE_PER_ROUND * 2,
    });
    expect(result.events.find((e) => e.type === 'POISON_APPLIED')).toBeUndefined();
    expect(result.state.floorState.playerPoisonRounds).toBe(0);
  });

  it('variantId 正确', () => {
    const scorpion = makePoisonScorpion('ps1', { x: 0, y: 0 });
    expect(scorpion.variantId).toBe(VARIANT_POISON_SCORPION);
    expect(scorpion.type).toBe('ELITE');
    expect(scorpion.hp).toBe(305);
    expect(scorpion.attack).toBe(36);
  });
});

// ── Tank（硬甲）：LAVA_CRAB (CH4) ────────────────────────────────

describe('LAVA_CRAB (CH4) — 硬甲：受物理伤害减半', () => {
  it('玩家基础攻击 10，岩浆蟹只受 5 伤害', () => {
    const crab = makeLavaCrab('lc1', { x: 4, y: 5 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [crab],
        entities: [],
        ap: 100,
      },
    });
    const result = playerAttack(state, 'lc1');
    const atk = result.events.find((e) => e.type === 'ATTACK') as any;
    expect(atk).toBeDefined();
    // BASE_ATTACK=10, 硬甲 floor(10/2)=5
    expect(atk.damage).toBe(4);
    const newCrab = result.state.floorState.monsters.find((m) => m.id === 'lc1')!;
    expect(newCrab.hp).toBe(410 - 4);
  });

  it('伤害减半后仍至少 1（不归零触发击杀，除非减半后确实为 0）', () => {
    const crab = makeLavaCrab('lc1', { x: 4, y: 5 });
    crab.hp = 2; // 极低血量
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [crab],
        entities: [],
        ap: 100,
      },
    });
    const result = playerAttack(state, 'lc1');
    // BASE_ATTACK=10, floor(10/2)=5 > 2, crab 被击杀
    const killEvt = result.events.find((e) => e.type === 'KILL');
    expect(killEvt).toBeDefined();
  });

  it('variantId 正确', () => {
    const crab = makeLavaCrab('lc1', { x: 0, y: 0 });
    expect(crab.variantId).toBe(VARIANT_LAVA_CRAB);
    expect(crab.type).toBe('NORMAL');
    expect(crab.hp).toBe(410);
  });

  it('为相邻友军分担 30% 伤害并保留至少 1 HP', () => {
    const crab = makeLavaCrab('lc1', { x: 5, y: 6 });
    const hound = makeAshHound('hound1', { x: 4, y: 6 });
    const state = makeExpeditionState({
      floorOverrides: { player: { x: 4, y: 4 }, monsters: [hound, crab], entities: [], ap: 100 },
      playerOverrides: { classId: 'ARCHER' },
    });
    const result = playerAttack(state, hound.id);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'LAVA_CRAB_GUARDED',
      crabId: crab.id,
      targetId: hound.id,
      damage: 2,
    }));
    expect(result.state.floorState.monsters.find((m) => m.id === crab.id)?.hp).toBe(408);
    expect(result.state.floorState.monsters.find((m) => m.id === hound.id)?.hp).toBe(404);
  });
});

// ── Slow（减速）：ICE_SLIME / FROST_SPRITE (CH3) ─────────────────

describe('灰烬猎犬（第4章）——踏火', () => {
  it('站在熔岩地块上时攻击伤害提高 20%', () => {
    const hound = makeAshHound('hound1', { x: 3, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [hound],
        entities: [{ id: 'lava1', type: 'LAVA_TILE', pos: { x: 3, y: 0 }, consumed: false }],
      },
      playerOverrides: { hp: 500, maxHp: 500 },
    });
    const result = stepMonsters(state);
    expect(result.events.find((e) => e.type === 'PLAYER_DAMAGED')).toMatchObject({ damage: 64 });
    expect(result.events.find((e) => e.type === 'ASH_HOUND_LAVA_EMPOWERED')).toBeDefined();
  });

  it('站在熔岩上追击时移动 2 格，离开熔岩后恢复普通速度', () => {
    const hound = makeAshHound('hound1', { x: 0, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 3, y: 0 },
        monsters: [hound],
        entities: [{ id: 'lava1', type: 'LAVA_TILE', pos: { x: 0, y: 0 }, consumed: false }],
      },
    });
    const result = stepMonsters(state);
    expect(result.state.floorState.monsters[0].pos).toEqual({ x: 2, y: 0 });
    expect(result.events.filter((e) => e.type === 'MOVE')).toHaveLength(2);
  });
});

describe('冰刺豪猪（第3章）——冰刺反伤', () => {
  it('受到玩家直接攻击时反弹 20% 最终伤害，致死一击也触发', () => {
    const porcupine = makeFrostspikePorcupine('porcupine1', { x: 4, y: 5 });
    porcupine.hp = 1;
    const state = makeExpeditionState({
      floorOverrides: { player: { x: 4, y: 4 }, monsters: [porcupine], entities: [], ap: 100 },
      playerOverrides: { hp: 100, maxHp: 100 },
    });
    const result = playerAttack(state, porcupine.id);
    expect(result.events.find((e) => e.type === 'KILL')).toBeDefined();
    expect(result.events.find((e) => e.type === 'FROSTSPIKE_REFLECTED')).toMatchObject({ damage: 1, hp: 99 });
    expect(result.state.player.hp).toBe(99);
  });

  it('不再对玩家施加移动减速', () => {
    const porcupine = makeFrostspikePorcupine('porcupine1', { x: 3, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: { player: { x: 4, y: 0 }, monsters: [porcupine], entities: [], ap: 100 },
    });
    const result = stepMonsters(state);
    expect(result.events.find((e) => e.type === 'MOVE_PENALTY_APPLIED')).toBeUndefined();
  });
});

describe('FROST_SPRITE (CH3) — 远程减速（射程 3）', () => {
  it('射程 3 可从 3 格外命中玩家', () => {
    const sprite = makeFrostSprite('fs1', { x: 0, y: 0 });
    expect(sprite.range).toBe(3);
    expect(sprite.type).toBe('ELITE');
    expect(sprite.hp).toBe(490);
  });

  it('每 3 回合牺牲攻击，在玩家与自身之间升起持续 3 回合的冰墙', () => {
    const sprite = makeFrostSprite('fs1', { x: 4, y: 7 });
    const state = makeExpeditionState({
      floorOverrides: { player: { x: 4, y: 4 }, monsters: [sprite], entities: [], turn: 3 },
    });
    const result = stepMonsters(state);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'FROST_SPRITE_WALL_RAISED',
      monsterId: 'fs1',
      pos: { x: 4, y: 5 },
    }));
    expect(result.state.floorState.entities).toContainEqual(expect.objectContaining({
      type: 'ICE_WALL',
      pos: { x: 4, y: 5 },
      remaining: 3,
    }));
    expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(false);
  });
});

describe('GLACIER_SHAPER (CH3) — 永久筑墙压迫', () => {
  it('预告后最多升起 3 面 100HP 永久冰墙，并保留至少一个可行动方向', () => {
    const shaper = makeGlacierShaper('gs1', { x: 4, y: 6 });
    const telegraphed = stepMonsters(makeExpeditionState({
      chapter: 3,
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [shaper],
        entities: [],
        turn: 3,
        ap: 100,
      },
    }));
    expect(telegraphed.events).toContainEqual(expect.objectContaining({
      type: 'GLACIER_SHAPER_WALL_TELEGRAPHED',
      monsterId: 'gs1',
    }));

    const raised = stepMonsters(telegraphed.state);
    const walls = raised.state.floorState.entities.filter((entity) => (
      entity.type === 'ICE_WALL'
      && entity.source === 'GLACIER_SHAPER'
      && !entity.consumed
    ));
    expect(walls).toHaveLength(3);
    walls.forEach((wall) => {
      expect(wall.hp).toBe(GLACIER_SHAPER_ICE_WALL_HP);
      expect(wall.remaining).toBeUndefined();
    });
    expect(raised.events.filter((event) => event.type === 'GLACIER_SHAPER_WALL_RAISED')).toHaveLength(3);

    const player = raised.state.floorState.player;
    const openNeighbors = [
      { x: player.x + 1, y: player.y },
      { x: player.x - 1, y: player.y },
      { x: player.x, y: player.y + 1 },
      { x: player.x, y: player.y - 1 },
    ].filter((pos) => (
      pos.x >= 0
      && pos.y >= 0
      && pos.x < raised.state.floorState.size
      && pos.y < raised.state.floorState.size
      && !raised.state.floorState.entities.some((entity) => !entity.consumed && entity.pos.x === pos.x && entity.pos.y === pos.y)
      && !raised.state.floorState.monsters.some((monster) => monster.aiState !== 'DEAD' && monster.pos.x === pos.x && monster.pos.y === pos.y)
    ));
    expect(openNeighbors.length).toBeGreaterThanOrEqual(1);
  });

  it('击碎筑墙者冰墙生成碎冰，奖励 2 灵气且受每层 12 灵气上限约束', () => {
    const sceneWall = attackIceWall(makeExpeditionState({
      chapter: 3,
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [],
        entities: [makeEntity('scene_wall', 'ICE_WALL', { x: 5, y: 4 }, { hp: 1 })],
        ap: 100,
      },
      playerOverrides: { anima: 0 },
    }), 'scene_wall');
    expect(sceneWall.events).toContainEqual(expect.objectContaining({
      type: 'ICE_WALL_SHATTERED',
      entityId: 'scene_wall',
    }));
    expect(sceneWall.events).toContainEqual({
      type: 'ICE_WALL_BROKEN',
      entityId: 'scene_wall',
      anima: 2,
    });
    expect(sceneWall.state.player.anima).toBe(2);

    const result = attackIceWall(makeExpeditionState({
      chapter: 3,
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [],
        entities: [makeEntity('gw1', 'ICE_WALL', { x: 5, y: 4 }, {
          hp: 1,
          source: 'GLACIER_SHAPER',
        })],
        ap: 100,
        glacierShaperWallAnimaGained: GLACIER_SHAPER_ICE_WALL_FLOOR_ANIMA_CAP - 1,
      },
      playerOverrides: { anima: 0 },
    }), 'gw1');

    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'ICE_WALL_SHATTERED',
      entityId: 'gw1',
    }));
    expect(result.events).toContainEqual({
      type: 'ICE_WALL_BROKEN',
      entityId: 'gw1',
      anima: 1,
    });
    expect(result.state.player.anima).toBe(1);
    expect(result.state.floorState.glacierShaperWallAnimaGained).toBe(GLACIER_SHAPER_ICE_WALL_FLOOR_ANIMA_CAP);
    expect(result.state.floorState.entities.some((entity) => entity.type === 'SHATTERED_ICE' && !entity.consumed)).toBe(true);

    const capped = attackIceWall(makeExpeditionState({
      chapter: 3,
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [],
        entities: [makeEntity('gw2', 'ICE_WALL', { x: 5, y: 4 }, {
          hp: 1,
          source: 'GLACIER_SHAPER',
        })],
        ap: 100,
        glacierShaperWallAnimaGained: GLACIER_SHAPER_ICE_WALL_FLOOR_ANIMA_CAP,
      },
      playerOverrides: { anima: 0 },
    }), 'gw2');
    expect(capped.events).toContainEqual({
      type: 'ICE_WALL_BROKEN',
      entityId: 'gw2',
      anima: 0,
    });
    expect(capped.state.player.anima).toBe(0);
    expect(GLACIER_SHAPER_ICE_WALL_DROP_ANIMA).toBe(2);
  });
});

// ── Burn（灼烧）：FIRE_ELEMENTAL (CH4) ───────────────────────────

describe('FIRE_ELEMENTAL (CH4) — 灼烧（复用赤炎哥布林机制）', () => {
  it('命中玩家后 emit FIRE_BURN_APPLIED，playerFireBurnRounds 叠加', () => {
    const elem = makeFireElemental('fe1', { x: 3, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [elem],
        entities: [],
        ap: 100,
      },
    });
    const result = stepMonsters(state);
    const burnEvt = result.events.find((e) => e.type === 'FIRE_BURN_APPLIED');
    expect(burnEvt).toBeDefined();
    expect(result.state.floorState.playerFireBurnRounds).toBeGreaterThan(0);
  });

  it('variantId 正确', () => {
    const elem = makeFireElemental('fe1', { x: 0, y: 0 });
    expect(elem.type).toBe('ELITE');
    expect(elem.hp).toBe(790);
    expect(elem.attack).toBe(100);
    expect(elem.range).toBe(2);
  });
});

// ── C1 穿甲（POISON_SCORPION, CH2）────────────────────────────────

describe('C1: POISON_SCORPION — 穿甲攻击', () => {
  it('有护甲时攻击伤害不被减伤，等于怪物攻击力', () => {
    const scorpion = makePoisonScorpion('ps1', { x: 3, y: 0 });
    scorpion.attack = 36;
    const playerWithArmor = makeRunPlayer({
      hp: 500, maxHp: 500,
      equipment: { ARMOR: { id: 'a1', slot: 'ARMOR', quality: 'RARE', name: '铁甲', baseStat: 30 } },
    });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [scorpion],
        entities: [],
        ap: 100,
      },
      playerOverrides: { hp: playerWithArmor.hp, maxHp: playerWithArmor.maxHp, equipment: playerWithArmor.equipment },
    });
    const result = stepMonsters(state);
    const dmgEvt = result.events.find((e) => e.type === 'PLAYER_DAMAGED') as any;
    expect(dmgEvt).toBeDefined();
    // 穿甲：无护甲减伤，保底 Math.max(10, rawDmg) = 36
    expect(dmgEvt.damage).toBe(36);
  });

  it('普通怪命中时护甲有效（对照组）', () => {
    const normal = makeMonster('n1', { x: 3, y: 0 }, { attack: 36, range: 1, aggroRadius: 6 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [normal],
        entities: [],
        ap: 100,
      },
      playerOverrides: {
        hp: 500, maxHp: 500,
        equipment: { ARMOR: { id: 'a1', slot: 'ARMOR', quality: 'RARE', name: '铁甲', baseStat: 30 } },
      },
    });
    const result = stepMonsters(state);
    const dmgEvt = result.events.find((e) => e.type === 'PLAYER_DAMAGED') as any;
    expect(dmgEvt).toBeDefined();
    // 护甲最多减免原伤害 35%：round(36×35%)=13，因此造成 23。
    expect(dmgEvt.damage).toBe(23);
  });
});

// ── C2 寒冰光环（FROST_SPRITE, CH3）──────────────────────────────

describe('C2: FROST_SPRITE — 寒冰光环（存活且 ≤3 格时 AP-1）', () => {
  it('FROST_SPRITE 在 3 格内存活，endTurn 后下回合 AP 少 1', () => {
    const sprite = makeFrostSprite('fs1', { x: 2, y: 0 }); // 距玩家 (0,0) = 2 格，≤3
    sprite.aggroRadius = 0; // 不主动行动，确保测试纯粹
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [sprite],
        entities: [],
        ap: 0,
      },
    });
    const result = endTurn(state);
    const auraEvt = result.events.find((e) => e.type === 'FROST_AURA_DRAINED');
    expect(auraEvt).toBeDefined();
  });

  it('FROST_SPRITE 在 4 格外，不触发光环', () => {
    const sprite = makeFrostSprite('fs1', { x: 5, y: 0 }); // 距玩家 5 格，>3
    sprite.aggroRadius = 0;
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [sprite],
        entities: [],
        ap: 0,
      },
    });
    const result = endTurn(state);
    expect(result.events.find((e) => e.type === 'FROST_AURA_DRAINED')).toBeUndefined();
  });

  it('FROST_SPRITE 已死亡，不触发光环', () => {
    const sprite = makeFrostSprite('fs1', { x: 1, y: 0 });
    sprite.aiState = 'DEAD';
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 0, y: 0 },
        monsters: [sprite],
        entities: [],
        ap: 0,
      },
    });
    const result = endTurn(state);
    expect(result.events.find((e) => e.type === 'FROST_AURA_DRAINED')).toBeUndefined();
  });
});

// ── C3 爆裂自爆（FIRE_ELEMENTAL, CH4）────────────────────────────

describe('C3: FIRE_ELEMENTAL — 爆裂自爆（死亡时对 2 格内玩家造成等攻击力真实伤害）', () => {
  it('玩家在 2 格内，击杀时受到爆裂伤害，emit ELITE_EXPLODE', () => {
    const elem = makeFireElemental('fe1', { x: 4, y: 5 });
    elem.hp = 1; // 一击必杀
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 }, // 曼哈顿距离 1
        monsters: [elem],
        entities: [],
        ap: 100,
      },
      playerOverrides: { hp: 500, maxHp: 500 },
    });
    const result = playerAttack(state, 'fe1');
    const explodeEvt = result.events.find((e) => e.type === 'ELITE_EXPLODE') as any;
    expect(explodeEvt).toBeDefined();
    expect(explodeEvt.damage).toBe(elem.attack);
    // 玩家受到爆裂伤害
    expect(result.state.player.hp).toBe(500 - elem.attack);
  });

  it('玩家在 3 格外，击杀时不受爆裂伤害', () => {
    const elem = makeFireElemental('fe2', { x: 4, y: 4 });
    elem.hp = 1;
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 7 }, // 曼哈顿距离 3 > 2
        monsters: [elem],
        entities: [],
        ap: 100,
      },
      playerOverrides: { hp: 500, maxHp: 500 },
    });
    const result = playerAttack(state, 'fe2');
    const explodeEvt = result.events.find((e) => e.type === 'ELITE_EXPLODE');
    expect(explodeEvt).toBeUndefined();
    expect(result.state.player.hp).toBe(500);
  });
});

// ── C4 双生复活（VOID_WORM, CH5）─────────────────────────────────

describe('命轮兽——命轮回溯（首次被击杀以 50% 生命复活）', () => {
  it('首次击杀 VOID_WORM 时 emit ELITE_REVIVE，HP 恢复至 50% maxHp，不 emit KILL', () => {
    const worm = makeFateWheelBeast('vw1', { x: 4, y: 5 });
    worm.hp = 1; // 确保一击"致死"
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [worm],
        entities: [],
        ap: 100,
      },
    });
    const result = playerAttack(state, 'vw1');
    expect(result.events.find((e) => e.type === 'KILL')).toBeUndefined();
    const reviveEvt = result.events.find((e) => e.type === 'ELITE_REVIVE') as any;
    expect(reviveEvt).toBeDefined();
    expect(reviveEvt.hp).toBe(Math.floor(worm.maxHp / 2));

    const m = result.state.floorState.monsters.find((mm) => mm.id === 'vw1')!;
    expect(m.revivedOnce).toBe(true);
    expect(m.aiState).not.toBe('DEAD');
    expect(m.hp).toBe(Math.floor(worm.maxHp / 2));
  });

  it('revivedOnce=true 后再次被击杀，正常死亡并 emit KILL', () => {
    const worm = makeFateWheelBeast('vw1', { x: 4, y: 5 });
    worm.hp = 1;
    worm.revivedOnce = true; // 已复活过
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [worm],
        entities: [],
        ap: 100,
      },
    });
    const result = playerAttack(state, 'vw1');
    expect(result.events.find((e) => e.type === 'KILL')).toBeDefined();
    expect(result.events.find((e) => e.type === 'ELITE_REVIVE')).toBeUndefined();
    const m = result.state.floorState.monsters.find((mm) => mm.id === 'vw1')!;
    expect(m.aiState).toBe('DEAD');
  });
});
