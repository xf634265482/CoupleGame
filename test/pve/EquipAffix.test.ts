// 装备词条系统单测（AC-EQ-4/5）
// 覆盖：品质词条数量、minor/major 分布、各词条触发条件

import {
  AFFIX_POOL,
  affixCountByQuality,
  affixDescription,
  rollAffixes,
} from '../../assets/scripts/pve/core/AffixSystem';
import { rollEquipment } from '../../assets/scripts/pve/core/EquipmentSystem';
import { monsterAttack, playerAttack, playerAttackPower } from '../../assets/scripts/pve/core/CombatSystem';
import { applyMove } from '../../assets/scripts/pve/core/MovementSystem';
import { advanceFloor } from '../../assets/scripts/pve/core/ExpeditionState';
import { createRng } from '../../assets/scripts/pve/core/rng';
import type { EquipAffix, EquipItem, EquipQuality } from '../../assets/scripts/pve/core/PveTypes';
import { makeExpeditionState, makeEntity, makeMonster, makeRunPlayer } from './helpers';

const ALL_QUALITIES: EquipQuality[] = ['COMMON', 'FINE', 'RARE', 'EPIC', 'LEGENDARY'];

// ── 工具 ──────────────────────────────────────────────────────────────────
function makeEquip(overrides: Partial<EquipItem> & Pick<EquipItem, 'slot' | 'quality'>): EquipItem {
  return {
    id: `test_${overrides.slot}_${overrides.quality}`,
    name: '测试装备',
    baseStat: 20,
    ...overrides,
  };
}

// ── AC-EQ-4：品质词条数量 ──────────────────────────────────────────────────
describe('AffixSystem — 词条数量规格（AC-EQ-4）', () => {
  it('白/绿品质词条数 = 0', () => {
    expect(affixCountByQuality('COMMON')).toBe(0);
    expect(affixCountByQuality('FINE')).toBe(0);
  });

  it('蓝品质词条数 = 1', () => {
    expect(affixCountByQuality('RARE')).toBe(1);
  });

  it('紫/橙品质词条数 = 2', () => {
    expect(affixCountByQuality('EPIC')).toBe(2);
    expect(affixCountByQuality('LEGENDARY')).toBe(2);
  });

  it('白绿 rollAffixes 返回空数组', () => {
    const rng = createRng(42);
    expect(rollAffixes(rng, 'COMMON')).toHaveLength(0);
    expect(rollAffixes(rng, 'FINE')).toHaveLength(0);
  });

  it('蓝 rollAffixes 返回恰好 1 条词条', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(rollAffixes(createRng(seed), 'RARE')).toHaveLength(1);
    }
  });

  it('紫/橙 rollAffixes 返回恰好 2 条词条，且无重复 id', () => {
    for (const quality of ['EPIC', 'LEGENDARY'] as EquipQuality[]) {
      for (let seed = 0; seed < 50; seed++) {
        const affixes = rollAffixes(createRng(seed), quality);
        expect(affixes).toHaveLength(2);
        expect(affixes[0].id).not.toBe(affixes[1].id);
      }
    }
  });

  it('词条 id 均来自 AFFIX_POOL', () => {
    const poolIds = new Set(AFFIX_POOL.map((a) => a.id));
    for (const quality of ALL_QUALITIES) {
      const affixes = rollAffixes(createRng(12345), quality);
      affixes.forEach((aff) => expect(poolIds.has(aff.id)).toBe(true));
    }
  });

  it('词条 tier 大样本：minor≈60%，major≈40%（±15%）', () => {
    let majorCount = 0;
    const total = 500;
    for (let seed = 0; seed < total; seed++) {
      const [aff] = rollAffixes(createRng(seed), 'RARE');
      if (aff.tier === 'major') majorCount++;
    }
    const ratio = majorCount / total;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.55);
  });

  it('minor value < major value（同一词条 def 数据校验）', () => {
    AFFIX_POOL.forEach((def) => {
      expect(def.minorValue).toBeLessThan(def.majorValue);
      expect(def.minorValue).toBeGreaterThan(0);
    });
  });

  it('确定性：相同种子 → 相同词条（AC-13）', () => {
    const a = rollAffixes(createRng(999), 'EPIC');
    const b = rollAffixes(createRng(999), 'EPIC');
    expect(a).toEqual(b);
  });

  it('rollEquipment 蓝装携带 1 条词条', () => {
    let found1 = false;
    for (let seed = 0; seed < 30; seed++) {
      const item = rollEquipment(createRng(seed), 'WEAPON', 'RARE');
      if ((item.affixes?.length ?? 0) === 1) { found1 = true; break; }
    }
    expect(found1).toBe(true);
  });

  it('rollEquipment 紫装携带 2 条词条', () => {
    let found2 = false;
    for (let seed = 0; seed < 30; seed++) {
      const item = rollEquipment(createRng(seed), 'WEAPON', 'EPIC');
      if ((item.affixes?.length ?? 0) === 2) { found2 = true; break; }
    }
    expect(found2).toBe(true);
  });

  it('rollEquipment 白装无词条', () => {
    for (let seed = 0; seed < 30; seed++) {
      const item = rollEquipment(createRng(seed), 'WEAPON', 'COMMON');
      expect(item.affixes ?? []).toHaveLength(0);
    }
  });
});

// ── AC-EQ-5：词条触发效果 ─────────────────────────────────────────────────
describe('AffixSystem — 词条触发效果（AC-EQ-5）', () => {
  const baseAffix = (id: string, value: number): EquipAffix => ({ id, tier: 'minor', value });

  // ── aff_sharp：锋利静态攻击加成 ─────────────────────────────────────
  it('aff_sharp：攻击力静态 +6（minor，两状态 baseStat 相同）', () => {
    const weaponBase  = makeEquip({ slot: 'WEAPON', quality: 'RARE', baseStat: 20 });
    const weaponSharp = makeEquip({ slot: 'WEAPON', quality: 'RARE', baseStat: 20, affixes: [baseAffix('aff_sharp', 6)] });
    const { damage: dmgBase }  = playerAttackPower(makeRunPlayer({ equipment: { WEAPON: weaponBase } }));
    const { damage: dmgSharp } = playerAttackPower(makeRunPlayer({ equipment: { WEAPON: weaponSharp } }));
    expect(dmgSharp - dmgBase).toBe(6);
  });

  // ── aff_frenzy：狂热 HP<50% 攻击+% ────────────────────────────────
  it('aff_frenzy：HP>50% 不触发（两状态仅词条不同，baseStat 相同）', () => {
    const hp = 200;
    const maxHp = 280;
    const baseWeapon = makeEquip({ slot: 'WEAPON', quality: 'RARE', baseStat: 20 });
    const frenzyWeapon = makeEquip({ slot: 'WEAPON', quality: 'RARE', baseStat: 20, affixes: [baseAffix('aff_frenzy', 20)] });
    const mk = (eq: EquipItem) => makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
        ap: 6,
      },
      playerOverrides: makeRunPlayer({ hp, maxHp, equipment: { WEAPON: eq } }),
    });
    const attack = (s: ReturnType<typeof makeExpeditionState>) =>
      ((playerAttack({ ...s, floorState: { ...s.floorState, player: { x: 1, y: 3 } } }, 'm1')
        .events.find(e => e.type === 'ATTACK')) as { damage: number })?.damage ?? 0;

    // HP>50%（200/280 ≈ 71%），frenzy 不触发，伤害相同
    expect(attack(mk(frenzyWeapon))).toBe(attack(mk(baseWeapon)));
  });

  it('aff_frenzy：HP<50% 攻击 +15%（仅词条不同）', () => {
    const hp = 100;  // 100/280 ≈ 36% < 50%
    const maxHp = 280;
    const baseWeapon  = makeEquip({ slot: 'WEAPON', quality: 'RARE', baseStat: 20 });
    const frenzyWeapon = makeEquip({ slot: 'WEAPON', quality: 'RARE', baseStat: 20, affixes: [baseAffix('aff_frenzy', 15)] });
    const mk = (eq: EquipItem) => makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
        ap: 6,
      },
      playerOverrides: makeRunPlayer({ hp, maxHp, equipment: { WEAPON: eq } }),
    });
    const attack = (s: ReturnType<typeof makeExpeditionState>) =>
      ((playerAttack({ ...s, floorState: { ...s.floorState, player: { x: 1, y: 3 } } }, 'm1')
        .events.find(e => e.type === 'ATTACK')) as { damage: number })?.damage ?? 0;

    const dmgF = attack(mk(frenzyWeapon));
    const dmgB = attack(mk(baseWeapon));
    expect(dmgF).toBeGreaterThan(dmgB);
    expect(dmgF).toBe(Math.round(dmgB * 1.15));
  });

  // ── aff_hunter：猎手对精英/Boss 伤害+% ────────────────────────────
  it('aff_hunter：对普通怪不触发（两状态 baseStat 相同，仅词条不同）', () => {
    const baseWeapon   = makeEquip({ slot: 'WEAPON', quality: 'RARE', baseStat: 20 });
    const hunterWeapon = makeEquip({ slot: 'WEAPON', quality: 'RARE', baseStat: 20, affixes: [baseAffix('aff_hunter', 15)] });
    const mk = (eq: EquipItem) => makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { type: 'NORMAL', aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
        ap: 6,
      },
      playerOverrides: makeRunPlayer({ equipment: { WEAPON: eq } }),
    });
    const attack = (s: ReturnType<typeof makeExpeditionState>) =>
      ((playerAttack({ ...s, floorState: { ...s.floorState, player: { x: 1, y: 3 } } }, 'm1')
        .events.find(e => e.type === 'ATTACK')) as { damage: number })?.damage ?? 0;
    expect(attack(mk(hunterWeapon))).toBe(attack(mk(baseWeapon)));
  });

  it('aff_hunter：对精英怪触发 +15% 伤害', () => {
    const baseWeapon   = makeEquip({ slot: 'WEAPON', quality: 'RARE', baseStat: 20 });
    const hunterWeapon = makeEquip({ slot: 'WEAPON', quality: 'RARE', baseStat: 20, affixes: [baseAffix('aff_hunter', 15)] });
    const mk = (type: 'NORMAL' | 'ELITE', eq: EquipItem) => makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { type, aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
        ap: 6,
      },
      playerOverrides: makeRunPlayer({ equipment: { WEAPON: eq } }),
    });
    const attack = (s: ReturnType<typeof makeExpeditionState>) =>
      ((playerAttack({ ...s, floorState: { ...s.floorState, player: { x: 1, y: 3 } } }, 'm1')
        .events.find(e => e.type === 'ATTACK')) as { damage: number })?.damage ?? 0;
    const dmgEliteHunter = attack(mk('ELITE', hunterWeapon));
    const dmgEliteBase   = attack(mk('ELITE', baseWeapon));
    expect(dmgEliteHunter).toBeGreaterThan(dmgEliteBase);
  });

  // ── aff_kill_chain：连杀叠层 ────────────────────────────────────────
  it('aff_kill_chain：0 叠无加成，击杀后叠层 +1', () => {
    const equip = makeEquip({ slot: 'WEAPON', quality: 'RARE', affixes: [baseAffix('aff_kill_chain', 1)] });
    const s = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', hp: 1, maxHp: 10 })],
        ap: 6,
        affixKillChainStacks: 0,
      },
      playerOverrides: makeRunPlayer({ equipment: { WEAPON: equip } }),
    });
    const result = playerAttack({ ...s, floorState: { ...s.floorState, player: { x: 1, y: 3 } } }, 'm1');
    // 击杀后 affixKillChainStacks 应该为 1
    expect(result.state.floorState.affixKillChainStacks).toBe(1);
  });

  it('aff_kill_chain：叠层封顶 5', () => {
    const equip = makeEquip({ slot: 'WEAPON', quality: 'RARE', affixes: [baseAffix('aff_kill_chain', 1)] });
    const s = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', hp: 1, maxHp: 10 })],
        ap: 6,
        affixKillChainStacks: 5, // 已满
      },
      playerOverrides: makeRunPlayer({ equipment: { WEAPON: equip } }),
    });
    const result = playerAttack({ ...s, floorState: { ...s.floorState, player: { x: 1, y: 3 } } }, 'm1');
    expect(result.state.floorState.affixKillChainStacks).toBe(5); // 不超过 5
  });

  // ── aff_swift_strike：疾袭 ──────────────────────────────────────────
  it('aff_swift_strike：移动后 affixSwiftStrikeReady=true', () => {
    const equip = makeEquip({ slot: 'WEAPON', quality: 'RARE', affixes: [baseAffix('aff_swift_strike', 20)] });
    const s = makeExpeditionState({
      playerOverrides: makeRunPlayer({ equipment: { WEAPON: equip } }),
    });
    const moved = applyMove({ ...s, floorState: { ...s.floorState, player: { x: 4, y: 4 }, ap: 4 } }, 'UP');
    expect(moved.state.floorState.affixSwiftStrikeReady).toBe(true);
  });

  it('aff_swift_strike：首击消耗 ready 标志', () => {
    const equip = makeEquip({ slot: 'WEAPON', quality: 'RARE', affixes: [baseAffix('aff_swift_strike', 20)] });
    const s = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
        ap: 6,
        affixSwiftStrikeReady: true, // 已移动
      },
      playerOverrides: makeRunPlayer({ equipment: { WEAPON: equip } }),
    });
    const result = playerAttack({ ...s, floorState: { ...s.floorState, player: { x: 1, y: 3 } } }, 'm1');
    expect(result.state.floorState.affixSwiftStrikeReady).toBe(false);
  });

  it('aff_swift_strike：移动后首击伤害高于未移动时', () => {
    const equip = makeEquip({ slot: 'WEAPON', quality: 'RARE', affixes: [baseAffix('aff_swift_strike', 20)] });
    const mk = (ready: boolean) => makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
        ap: 6,
        affixSwiftStrikeReady: ready,
      },
      playerOverrides: makeRunPlayer({ equipment: { WEAPON: equip } }),
    });
    const dmgReady = ((playerAttack({ ...mk(true), floorState: { ...mk(true).floorState, player: { x: 1, y: 3 } } }, 'm1').events.find(e => e.type === 'ATTACK')) as { damage: number })?.damage ?? 0;
    const dmgNotReady = ((playerAttack({ ...mk(false), floorState: { ...mk(false).floorState, player: { x: 1, y: 3 } } }, 'm1').events.find(e => e.type === 'ATTACK')) as { damage: number })?.damage ?? 0;
    expect(dmgReady).toBeGreaterThan(dmgNotReady);
  });

  // ── aff_preemptive：先发制人 ────────────────────────────────────────
  it('aff_preemptive：每层首攻触发并标记 affixPreemptiveUsed', () => {
    const equip = makeEquip({ slot: 'WEAPON', quality: 'RARE', affixes: [baseAffix('aff_preemptive', 25)] });
    const s = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
        ap: 6,
      },
      playerOverrides: makeRunPlayer({ equipment: { WEAPON: equip } }),
    });
    const result = playerAttack({ ...s, floorState: { ...s.floorState, player: { x: 1, y: 3 } } }, 'm1');
    expect(result.state.floorState.affixPreemptiveUsed).toBe(true);
  });

  it('aff_preemptive：首攻伤害高于后续攻击', () => {
    const equip = makeEquip({ slot: 'WEAPON', quality: 'RARE', affixes: [baseAffix('aff_preemptive', 25)] });
    const mkS = (used: boolean) => makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', hp: 1000, maxHp: 1000 })],
        ap: 6,
        affixPreemptiveUsed: used,
      },
      playerOverrides: makeRunPlayer({ equipment: { WEAPON: equip } }),
    });
    const dmgFirst  = ((playerAttack({ ...mkS(false), floorState: { ...mkS(false).floorState, player: { x: 1, y: 3 } } }, 'm1').events.find(e => e.type === 'ATTACK')) as { damage: number })?.damage ?? 0;
    const dmgSecond = ((playerAttack({ ...mkS(true), floorState: { ...mkS(true).floorState, player: { x: 1, y: 3 } } }, 'm1').events.find(e => e.type === 'ATTACK')) as { damage: number })?.damage ?? 0;
    expect(dmgFirst).toBeGreaterThan(dmgSecond);
  });

  // ── aff_bulwark：磐石 HP>80% 减伤 ──────────────────────────────────
  it('aff_bulwark：HP>80% 减伤有效', () => {
    const armorEquip = makeEquip({ slot: 'ARMOR', quality: 'RARE', baseStat: 0, affixes: [baseAffix('aff_bulwark', 5)] });
    const highHpState = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', attack: 20, range: 1 })],
        ap: 0,
      },
      playerOverrides: makeRunPlayer({ hp: 260, maxHp: 280, equipment: { ARMOR: armorEquip } }),
    });
    const lowHpState = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', { x: 2, y: 3 }, { aiState: 'CHASE', attack: 20, range: 1 })],
        ap: 0,
      },
      playerOverrides: makeRunPlayer({ hp: 200, maxHp: 280, equipment: { ARMOR: armorEquip } }),
    });
    const hsPos = { x: 2, y: 4 }; // adjacent to monster
    const rHigh = monsterAttack({ ...highHpState, floorState: { ...highHpState.floorState, player: hsPos } }, 'm1');
    const rLow  = monsterAttack({ ...lowHpState,  floorState: { ...lowHpState.floorState,  player: hsPos } }, 'm1');

    const evHigh = rHigh.events.find((e) => e.type === 'PLAYER_DAMAGED') as { damage: number } | undefined;
    const evLow  = rLow.events.find((e)  => e.type === 'PLAYER_DAMAGED') as { damage: number } | undefined;
    // HP>80%（260/280）时 bulwark 触发，伤害更低
    expect(evHigh?.damage ?? 999).toBeLessThan(evLow?.damage ?? 999);
  });

  // ── aff_cover_expert：掩体专家 ──────────────────────────────────────
  it('aff_cover_expert：相邻 ROCK 时减伤', () => {
    const armorEquip = makeEquip({ slot: 'ARMOR', quality: 'RARE', baseStat: 0, affixes: [baseAffix('aff_cover_expert', 5)] });
    const playerPos = { x: 3, y: 3 };
    const monsterPos = { x: 3, y: 4 };
    const rockPos = { x: 3, y: 2 }; // adjacent to player

    const withCover = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', monsterPos, { aiState: 'CHASE', attack: 20, range: 1 })],
        entities: [makeEntity('rock1', 'ROCK', rockPos)],
        ap: 0,
      },
      playerOverrides: makeRunPlayer({ equipment: { ARMOR: armorEquip } }),
    });
    const noCover = makeExpeditionState({
      floorOverrides: {
        monsters: [makeMonster('m1', monsterPos, { aiState: 'CHASE', attack: 20, range: 1 })],
        entities: [], // 无掩体
        ap: 0,
      },
      playerOverrides: makeRunPlayer({ equipment: { ARMOR: armorEquip } }),
    });

    const rCover = monsterAttack({ ...withCover, floorState: { ...withCover.floorState, player: playerPos } }, 'm1');
    const rNone  = monsterAttack({ ...noCover,   floorState: { ...noCover.floorState,   player: playerPos } }, 'm1');

    const dmgCover = (rCover.events.find((e) => e.type === 'PLAYER_DAMAGED') as { damage: number } | undefined)?.damage ?? 999;
    const dmgNone  = (rNone.events.find((e)  => e.type === 'PLAYER_DAMAGED') as { damage: number } | undefined)?.damage ?? 999;
    expect(dmgCover).toBeLessThan(dmgNone);
  });

  // ── aff_thorns：荆棘反弹 ────────────────────────────────────────────
  it('aff_thorns：受击后攻击者 HP 降低', () => {
    const armorEquip = makeEquip({ slot: 'ARMOR', quality: 'RARE', baseStat: 0, affixes: [baseAffix('aff_thorns', 5)] });
    const playerPos = { x: 3, y: 3 };
    const monsterPos = { x: 3, y: 4 };
    const monster = makeMonster('m1', monsterPos, { aiState: 'CHASE', attack: 5, range: 1, hp: 20, maxHp: 20 });

    const s = makeExpeditionState({
      floorOverrides: {
        monsters: [monster],
        ap: 0,
      },
      playerOverrides: makeRunPlayer({ equipment: { ARMOR: armorEquip } }),
    });
    const result = monsterAttack({ ...s, floorState: { ...s.floorState, player: playerPos } }, 'm1');
    const monAfter = result.state.floorState.monsters.find((m) => m.id === 'm1')!;
    // 荆棘反弹 5 伤害，怪物 HP 20-5 = 15
    expect(monAfter.hp).toBe(15);
  });

  it('aff_thorns：玩家死亡时不触发反弹', () => {
    const armorEquip = makeEquip({ slot: 'ARMOR', quality: 'RARE', baseStat: 0, affixes: [baseAffix('aff_thorns', 5)] });
    const playerPos = { x: 3, y: 3 };
    const monsterPos = { x: 3, y: 4 };
    const monster = makeMonster('m1', monsterPos, { aiState: 'CHASE', attack: 10000, range: 1, hp: 20, maxHp: 20 });

    const s = makeExpeditionState({
      floorOverrides: {
        monsters: [monster],
        ap: 0,
      },
      playerOverrides: makeRunPlayer({ hp: 1, maxHp: 280, equipment: { ARMOR: armorEquip } }),
    });
    const result = monsterAttack({ ...s, floorState: { ...s.floorState, player: playerPos } }, 'm1');
    const monAfter = result.state.floorState.monsters.find((m) => m.id === 'm1')!;
    // 玩家死亡，荆棘不触发，怪物 HP 不变
    expect(monAfter.hp).toBe(20);
  });

  // ── aff_fortify：强健进层回血 ────────────────────────────────────────
  it('aff_fortify：advanceFloor 时回复 HP', () => {
    const helmetEquip = makeEquip({
      slot: 'HELMET', quality: 'RARE', baseStat: 0, affixes: [baseAffix('aff_fortify', 20)],
    });
    // 创建一个已 CLEARED 的楼层
    const s = makeExpeditionState({
      floor: 1,
      playerOverrides: makeRunPlayer({ hp: 250, maxHp: 280, equipment: { HELMET: helmetEquip } }),
    });
    const cleared = {
      ...s,
      floorState: { ...s.floorState, status: 'CLEARED' as const },
    };
    const result = advanceFloor(cleared);
    // 进入新层后 HP 应从 250 回复到 min(280, 250+20) = 270
    expect(result.state.player.hp).toBe(270);
  });

  // ── affixDescription：UI 描述字符串 ─────────────────────────────────
  it('affixDescription 对所有词条返回非空字符串', () => {
    AFFIX_POOL.forEach((def) => {
      const minor: EquipAffix = { id: def.id, tier: 'minor', value: def.minorValue };
      const major: EquipAffix = { id: def.id, tier: 'major', value: def.majorValue };
      expect(affixDescription(minor).length).toBeGreaterThan(0);
      expect(affixDescription(major).length).toBeGreaterThan(0);
      expect(affixDescription(minor)).toContain(def.minorValue.toString());
      expect(affixDescription(major)).toContain(def.majorValue.toString());
    });
  });
});
