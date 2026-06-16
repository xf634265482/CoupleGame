// Boss 专属装备 trait 效果单测（Task #12）：
// 覆盖纯函数 helpers；战斗集成由 CombatSystem 路径完成。

import {
  BLEED_DAMAGE,
  BLEED_ROUNDS,
  BURN_TICK_DAMAGE,
  BURN_TICKS,
  CRIT_CHANCE,
  CRIT_MULT,
  ICE_REDUCE_PCT,
  KILL_HEAL_AMOUNT,
  LIFESTEAL_HEAL,
  PHYS_REDUCE_PCT,
  REVIVE_HP_PCT,
  STUN_ROUNDS,
  T_BLEED_ON_HIT,
  T_BURN_IMMUNE,
  T_BURN_ON_HIT,
  T_CRIT,
  T_ICE_REDUCE,
  T_KILL_HEAL,
  T_LIFESTEAL,
  T_PHYS_REDUCE,
  T_REVIVE,
  T_SAND_IMMUNE,
  T_SLOW_ON_HIT,
  T_STUN_ON_HURT,
  bossCritMult,
  bossDamageReducePct,
  bossKillHeal,
  bossLifesteal,
  bossOnHitDebuffPatch,
  bossSandImmune,
  bossStunOnHurt,
  bossTryRevive,
  hasBossTrait,
  isPlayerBurnImmune,
  isPlayerOnIce,
  tickMonsterDots,
} from '../../assets/scripts/pve/core/BossEquipTraitEffects';
import { createRng } from '../../assets/scripts/pve/core/rng';
import type { EquipItem, FloorState, Monster, RunPlayer } from '../../assets/scripts/pve/core/PveTypes';

function eqWithTrait(slot: EquipItem['slot'], trait: string): EquipItem {
  return { id: 'e1', slot, quality: 'EPIC', name: 't', baseStat: 10, trait };
}

function mockPlayer(equipment: Partial<Record<EquipItem['slot'], EquipItem>> = {}): RunPlayer {
  return {
    hp: 100, maxHp: 200, gold: 0, anima: 0, animaProgress: 0,
    classId: 'ADVENTURER', classTraits: [], equipment, classFragments: {},
  };
}

function mockFloor(entities: FloorState['entities'] = [], playerPos = { x: 4, y: 4 }): FloorState {
  return {
    floor: 1, size: 8, seed: 1, rngState: 12345,
    player: playerPos, ap: 10, maxAp: 10, dice: 4, turn: 1,
    hasKey: false, revealed: Array.from({ length: 8 }, () => Array(8).fill(true)),
    monsters: [], entities, status: 'EXPLORING',
  };
}

describe('hasBossTrait', () => {
  it('遍历所有装备槽位查找 trait', () => {
    expect(hasBossTrait({ WEAPON: eqWithTrait('WEAPON', T_LIFESTEAL) }, T_LIFESTEAL)).toBe(true);
    expect(hasBossTrait({ TRINKET: eqWithTrait('TRINKET', T_CRIT) }, T_CRIT)).toBe(true);
    expect(hasBossTrait({}, T_LIFESTEAL)).toBe(false);
  });
});

describe('攻击侧 traits', () => {
  it('bossCritMult: 持有 trait 时按概率消耗 RNG，未持有时不消耗', () => {
    const rng1 = createRng(42);
    const stateBefore = rng1.state();
    bossCritMult({}, rng1);
    expect(rng1.state()).toBe(stateBefore); // 未持有：不消耗

    const rng2 = createRng(42);
    bossCritMult({ WEAPON: eqWithTrait('WEAPON', T_CRIT) }, rng2);
    expect(rng2.state()).not.toBe(42); // 持有：消耗
  });

  it('bossCritMult 在 chance < CRIT_CHANCE 时返回 CRIT_MULT', () => {
    // 找一个能命中暴击的 seed
    let crit = false;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const mult = bossCritMult({ WEAPON: eqWithTrait('WEAPON', T_CRIT) }, rng);
      if (mult === CRIT_MULT) { crit = true; break; }
    }
    expect(crit).toBe(true);
    expect(CRIT_MULT).toBe(2);
    expect(CRIT_CHANCE).toBe(0.15);
  });

  it('bossLifesteal: 持有时 +HP，不超 maxHp', () => {
    expect(bossLifesteal(mockPlayer())).toBe(100); // 无 trait
    expect(bossLifesteal(mockPlayer({ WEAPON: eqWithTrait('WEAPON', T_LIFESTEAL) }))).toBe(100 + LIFESTEAL_HEAL);
    const nearMax = { ...mockPlayer({ WEAPON: eqWithTrait('WEAPON', T_LIFESTEAL) }), hp: 199 };
    expect(bossLifesteal(nearMax)).toBe(200); // 触顶
  });

  it('bossKillHeal: 持有时 +HP，不超 maxHp', () => {
    const player = mockPlayer({ TRINKET: eqWithTrait('TRINKET', T_KILL_HEAL) });
    expect(bossKillHeal(player, 100)).toBe(100 + KILL_HEAL_AMOUNT);
    expect(bossKillHeal(mockPlayer(), 100)).toBe(100);
  });

  it('bossOnHitDebuffPatch: 按 trait 返回对应 patch', () => {
    expect(bossOnHitDebuffPatch({})).toEqual({});
    const bleed = bossOnHitDebuffPatch({ WEAPON: eqWithTrait('WEAPON', T_BLEED_ON_HIT) });
    expect(bleed.bleedRounds).toBe(BLEED_ROUNDS);
    const burn = bossOnHitDebuffPatch({ WEAPON: eqWithTrait('WEAPON', T_BURN_ON_HIT) });
    expect(burn.burnRounds).toBe(BURN_TICKS);
    const slow = bossOnHitDebuffPatch({ WEAPON: eqWithTrait('WEAPON', T_SLOW_ON_HIT) });
    expect(slow.frozenRounds).toBe(STUN_ROUNDS);
  });
});

describe('受击侧 traits', () => {
  it('isPlayerOnIce: 玩家所在格是 ICE_TILE 时为 true', () => {
    const floor = mockFloor(
      [{ id: 'i1', type: 'ICE_TILE' as const, pos: { x: 4, y: 4 }, consumed: false }],
      { x: 4, y: 4 },
    );
    expect(isPlayerOnIce(floor)).toBe(true);
    const off = mockFloor([], { x: 4, y: 4 });
    expect(isPlayerOnIce(off)).toBe(false);
  });

  it('bossDamageReducePct: phys + ice 减伤叠加', () => {
    const floor = mockFloor(
      [{ id: 'i1', type: 'ICE_TILE' as const, pos: { x: 4, y: 4 }, consumed: false }],
      { x: 4, y: 4 },
    );
    const player = mockPlayer({
      TRINKET: eqWithTrait('TRINKET', T_PHYS_REDUCE),
      HELMET: eqWithTrait('HELMET', T_ICE_REDUCE),
    });
    expect(bossDamageReducePct(player, floor)).toBeCloseTo(PHYS_REDUCE_PCT + ICE_REDUCE_PCT, 5);
    // 不站冰面时只生效 phys
    const offIce = mockFloor([], { x: 0, y: 0 });
    expect(bossDamageReducePct(player, offIce)).toBeCloseTo(PHYS_REDUCE_PCT, 5);
  });

  it('bossDamageReducePct: 上限 90%', () => {
    // 模拟极端叠加（理论上不会出现，因为只有 2 个减伤 trait）
    const player = mockPlayer({
      TRINKET: eqWithTrait('TRINKET', T_PHYS_REDUCE),
      HELMET: eqWithTrait('HELMET', T_ICE_REDUCE),
    });
    const floor = mockFloor([{ id: 'i1', type: 'ICE_TILE' as const, pos: { x: 4, y: 4 }, consumed: false }]);
    expect(bossDamageReducePct(player, floor)).toBeLessThanOrEqual(0.9);
  });

  it('bossStunOnHurt: 持有时按概率消耗 RNG', () => {
    let stunned = false;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      if (bossStunOnHurt(mockPlayer({ HELMET: eqWithTrait('HELMET', T_STUN_ON_HURT) }), rng)) {
        stunned = true; break;
      }
    }
    expect(stunned).toBe(true);
    // 未持有时返回 false
    const rng = createRng(42);
    expect(bossStunOnHurt(mockPlayer(), rng)).toBe(false);
  });

  it('bossTryRevive: 首次致死兜底 + 标记 shieldUsed', () => {
    const player = mockPlayer({ TRINKET: eqWithTrait('TRINKET', T_REVIVE) });
    const r = bossTryRevive(player);
    expect(r.revived).toBe(true);
    expect(r.restoredHp).toBe(Math.round(200 * REVIVE_HP_PCT));
    expect(r.nextPlayer.relicState?.shieldUsed).toBe(true);

    // 二次不触发
    const r2 = bossTryRevive(r.nextPlayer);
    expect(r2.revived).toBe(false);
  });
});

describe('状态 tick', () => {
  it('isPlayerBurnImmune: 持有 T_BURN_IMMUNE 时为 true', () => {
    expect(isPlayerBurnImmune({})).toBe(false);
    expect(isPlayerBurnImmune({ ARMOR: eqWithTrait('ARMOR', T_BURN_IMMUNE) })).toBe(true);
  });

  it('tickMonsterDots: 流血/灼烧扣血并递减回合', () => {
    const monster: Monster = {
      id: 'm1', type: 'NORMAL', pos: { x: 0, y: 0 }, hp: 100, maxHp: 100,
      attack: 10, range: 1, aggroRadius: 3, aiState: 'IDLE',
      bleedRounds: 2, burnRounds: 1,
    };
    const result = tickMonsterDots([monster]);
    expect(result.totalDamage).toBe(BLEED_DAMAGE + BURN_TICK_DAMAGE);
    expect(result.monsters[0].hp).toBe(100 - BLEED_DAMAGE - BURN_TICK_DAMAGE);
    expect(result.monsters[0].bleedRounds).toBe(1);
    expect(result.monsters[0].burnRounds).toBeUndefined(); // 归零移除
  });

  it('tickMonsterDots: 致死时怪物 aiState=DEAD', () => {
    const monster: Monster = {
      id: 'm1', type: 'NORMAL', pos: { x: 0, y: 0 }, hp: 5, maxHp: 100,
      attack: 10, range: 1, aggroRadius: 3, aiState: 'IDLE',
      bleedRounds: 2,
    };
    const result = tickMonsterDots([monster]);
    expect(result.monsters[0].hp).toBe(0);
    expect(result.monsters[0].aiState).toBe('DEAD');
  });

  it('tickMonsterDots: 无 DoT 状态的怪物原样返回（同一引用，避免无意义 copy）', () => {
    const monster: Monster = {
      id: 'm1', type: 'NORMAL', pos: { x: 0, y: 0 }, hp: 100, maxHp: 100,
      attack: 10, range: 1, aggroRadius: 3, aiState: 'IDLE',
    };
    const result = tickMonsterDots([monster]);
    expect(result.monsters[0]).toBe(monster);
    expect(result.totalDamage).toBe(0);
  });
});

describe('移动侧 trait', () => {
  it('bossSandImmune: 持有时 true', () => {
    expect(bossSandImmune({})).toBe(false);
    expect(bossSandImmune({ SHOES: eqWithTrait('SHOES', T_SAND_IMMUNE) })).toBe(true);
  });
});
