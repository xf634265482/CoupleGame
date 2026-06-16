// 第 2-5 章普通/精英怪变体行为测试（260616 P1）。
// 覆盖：charge（冲锋双格）、poison（中毒 DoT）、tank（硬甲减伤）、
//       slow（冰史莱姆/冰霜精灵减速）、burn（火焰元素灼烧）。

import { stepMonsters } from '../../assets/scripts/pve/core/MonsterAI';
import { playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { endTurn } from '../../assets/scripts/pve/core/ExpeditionState';
import {
  makeSandwormLarva,
  makePoisonScorpion,
  VARIANT_SANDWORM_LARVA,
  VARIANT_POISON_SCORPION,
} from '../../assets/scripts/pve/core/Chapter2Monsters';
import {
  makeSnowWolf,
  makeIceSlime,
  makeFrostSprite,
  VARIANT_SNOW_WOLF,
} from '../../assets/scripts/pve/core/Chapter3Monsters';
import {
  makeLavaCrab,
  makeFireElemental,
  VARIANT_LAVA_CRAB,
} from '../../assets/scripts/pve/core/Chapter4Monsters';
import {
  makeVoidWorm,
  VARIANT_VOID_WORM,
} from '../../assets/scripts/pve/core/Chapter5Monsters';
import {
  POISON_DAMAGE_PER_ROUND,
  POISON_ROUNDS,
} from '../../assets/scripts/pve/core/PveConstants';
import { makeExpeditionState, makeMonster, makeRunPlayer } from './helpers';

// ── Charge（冲锋）：SANDWORM_LARVA ────────────────────────────────

describe('SANDWORM_LARVA (CH2) — 冲锋：CHASE 每回合最多移动 2 格', () => {
  it('感知范围内距玩家 4 格时冲锋 2 格', () => {
    // 使用 makeMonster 覆盖 aggroRadius=6，保留 variantId=SANDWORM_LARVA 触发冲锋逻辑
    const larva = makeMonster('sw1', { x: 0, y: 0 }, {
      variantId: VARIANT_SANDWORM_LARVA,
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
      variantId: VARIANT_SANDWORM_LARVA,
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
    const larva = makeSandwormLarva('sw1', { x: 0, y: 0 });
    expect(larva.variantId).toBe(VARIANT_SANDWORM_LARVA);
    expect(larva.type).toBe('NORMAL');
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

describe('VOID_WORM (CH5) — 冲锋', () => {
  it('variantId=VOID_WORM，type=ELITE', () => {
    const worm = makeVoidWorm('v1', { x: 0, y: 0 });
    expect(worm.variantId).toBe(VARIANT_VOID_WORM);
    expect(worm.type).toBe('ELITE');
    expect(worm.hp).toBe(640);
    expect(worm.attack).toBe(160);
    expect(worm.revivedOnce).toBeUndefined();
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

  it('再次命中刷新中毒计时（不叠加），rounds 重置为 POISON_ROUNDS', () => {
    // 设置 poisonRounds=1（快过期），再让毒蝎命中
    const scorpion = makePoisonScorpion('ps1', { x: 3, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [scorpion],
        entities: [],
        playerPoisonRounds: 1, // 快过期
        ap: 100,
      },
      playerOverrides: { hp: 2000, maxHp: 2000 },
    });
    const result = stepMonsters(state);
    // 再次命中后应刷新为 POISON_ROUNDS，而非 1+3=4
    expect(result.state.floorState.playerPoisonRounds).toBe(POISON_ROUNDS);
  });

  it('variantId 正确', () => {
    const scorpion = makePoisonScorpion('ps1', { x: 0, y: 0 });
    expect(scorpion.variantId).toBe(VARIANT_POISON_SCORPION);
    expect(scorpion.type).toBe('ELITE');
    expect(scorpion.hp).toBe(144);
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
    expect(atk.damage).toBe(5);
    const newCrab = result.state.floorState.monsters.find((m) => m.id === 'lc1')!;
    expect(newCrab.hp).toBe(200 - 5);
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
    expect(crab.hp).toBe(200);
  });
});

// ── Slow（减速）：ICE_SLIME / FROST_SPRITE (CH3) ─────────────────

describe('ICE_SLIME (CH3) — 减速（复用冰霜哥布林机制）', () => {
  it('命中玩家后 emit MOVE_PENALTY_APPLIED，playerMoveApPenaltyRounds 叠加', () => {
    const slime = makeIceSlime('is1', { x: 3, y: 0 });
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 0 },
        monsters: [slime],
        entities: [],
        ap: 100,
      },
    });
    const result = stepMonsters(state);
    const penaltyEvt = result.events.find((e) => e.type === 'MOVE_PENALTY_APPLIED');
    expect(penaltyEvt).toBeDefined();
    expect(result.state.floorState.playerMoveApPenaltyRounds).toBeGreaterThan(0);
  });
});

describe('FROST_SPRITE (CH3) — 远程减速（射程 3）', () => {
  it('射程 3 可从 3 格外命中玩家', () => {
    const sprite = makeFrostSprite('fs1', { x: 0, y: 0 });
    expect(sprite.range).toBe(3);
    expect(sprite.type).toBe('ELITE');
    expect(sprite.hp).toBe(240);
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
    expect(elem.hp).toBe(400);
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
    // 正常减伤：36 - 30 = 6，保底 10
    expect(dmgEvt.damage).toBe(10);
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

describe('C4: VOID_WORM — 双生复活（首次被击杀以 50% HP 复活）', () => {
  it('首次击杀 VOID_WORM 时 emit ELITE_REVIVE，HP 恢复至 50% maxHp，不 emit KILL', () => {
    const worm = makeVoidWorm('vw1', { x: 4, y: 5 });
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
    const worm = makeVoidWorm('vw1', { x: 4, y: 5 });
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
