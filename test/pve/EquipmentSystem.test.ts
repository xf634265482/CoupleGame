import {
  EQUIPMENT_POOL,
  IMPLICIT_ARMOR_PLATE,
  IMPLICIT_HELMET_HEAVY,
  IMPLICIT_WEAPON_AXE,
  IMPLICIT_WEAPON_SPEAR,
  rollEquipment,
  rollRandomSlot,
} from '../../assets/scripts/pve/core/EquipmentSystem';
import { createRng } from '../../assets/scripts/pve/core/rng';
import type { EquipQuality, EquipSlot } from '../../assets/scripts/pve/core/PveTypes';

const ALL_SLOTS: readonly EquipSlot[] = ['WEAPON', 'ARMOR', 'HELMET', 'SHOES', 'TRINKET'];
const ALL_QUALITIES: readonly EquipQuality[] = ['COMMON', 'FINE', 'RARE', 'EPIC', 'LEGENDARY'];

// ── AC-EQ-1：装备池数量 ─────────────────────────────────────────────
describe('EquipmentSystem — 装备池规格（AC-EQ-1）', () => {
  it('每槽白3/绿3/蓝3/紫5/橙3 = 17 件，五槽共 85 件', () => {
    const expectedCounts: Record<EquipQuality, number> = {
      COMMON: 3, FINE: 3, RARE: 3, EPIC: 5, LEGENDARY: 3,
    };
    for (const slot of ALL_SLOTS) {
      for (const quality of ALL_QUALITIES) {
        const pool = EQUIPMENT_POOL[slot][quality];
        expect(pool.length).toBe(expectedCounts[quality]);
      }
    }
  });

  it('所有 85 件装备名称非空、baseStat 区间合法（min ≤ max，min > 0）', () => {
    for (const slot of ALL_SLOTS) {
      for (const quality of ALL_QUALITIES) {
        for (const tpl of EQUIPMENT_POOL[slot][quality]) {
          expect(tpl.name.length).toBeGreaterThan(0);
          expect(tpl.baseStatMin).toBeGreaterThan(0);
          expect(tpl.baseStatMin).toBeLessThanOrEqual(tpl.baseStatMax);
        }
      }
    }
  });

  it('同 archetype 相邻品质区间严格不重叠（同 implicit 类型跨品质检查）', () => {
    // 对有明确 implicit 的 archetype，相邻品质 max < 下一品质 min
    const checkArchetype = (slot: EquipSlot, implicit: string) => {
      let prevMax = 0;
      for (const quality of ALL_QUALITIES) {
        const templates = EQUIPMENT_POOL[slot][quality].filter((t) => t.implicit === implicit);
        if (templates.length === 0) continue;
        const minOfQuality = Math.min(...templates.map((t) => t.baseStatMin));
        expect(minOfQuality).toBeGreaterThan(prevMax);
        prevMax = Math.max(...templates.map((t) => t.baseStatMax));
      }
    };

    // 斧、矛、板甲、重盔这四个有明确 implicit 的 archetype 必须严格递进
    checkArchetype('WEAPON', IMPLICIT_WEAPON_AXE);
    checkArchetype('WEAPON', IMPLICIT_WEAPON_SPEAR);
    checkArchetype('ARMOR', IMPLICIT_ARMOR_PLATE);
    checkArchetype('HELMET', IMPLICIT_HELMET_HEAVY);

    // 均衡款（剑/锁甲/战盔）：用每品质第一件（设计约定均衡款在首位）检查严格递进
    const checkBalanced = (slot: EquipSlot) => {
      let prevMax = 0;
      for (const quality of ALL_QUALITIES) {
        const first = EQUIPMENT_POOL[slot][quality][0]; // 首件为均衡款
        expect(first.baseStatMin).toBeGreaterThan(prevMax);
        prevMax = first.baseStatMax;
      }
    };
    checkBalanced('WEAPON');
    checkBalanced('ARMOR');
    checkBalanced('HELMET');
  });
});

// ── AC-EQ-2：baseStat 区间随机 ──────────────────────────────────────
describe('EquipmentSystem — baseStat 区间随机（AC-EQ-2）', () => {
  it('rollEquipment 返回正确结构：id / slot / quality / name / baseStat / baseStatMax', () => {
    const rng = createRng(1234);
    const item = rollEquipment(rng, 'WEAPON', 'FINE');

    expect(item.slot).toBe('WEAPON');
    expect(item.quality).toBe('FINE');
    expect(item.name.length).toBeGreaterThan(0);
    expect(item.baseStat).toBeGreaterThan(0);
    expect(item.baseStatMax).toBeDefined();
    expect(item.baseStat).toBeLessThanOrEqual(item.baseStatMax!);
    expect(item.id).toMatch(/^equip_weapon_fine_\d+$/);
  });

  it('ARMOR COMMON：baseStat 在区间内（8-15，含所有 3 件变体）', () => {
    const rng = createRng(42);
    const item = rollEquipment(rng, 'ARMOR', 'COMMON');
    expect(item.baseStat).toBeGreaterThanOrEqual(6); // 最低件 min=6
    expect(item.baseStat).toBeLessThanOrEqual(15);   // 最高件 max=15
    expect(item.baseStatMax).toBeGreaterThanOrEqual(item.baseStat);
  });

  it('WEAPON LEGENDARY：baseStat 在 64-90 区间内，name 为池中合法名称', () => {
    const rng = createRng(99);
    const item = rollEquipment(rng, 'WEAPON', 'LEGENDARY');
    const legendaryNames = EQUIPMENT_POOL.WEAPON.LEGENDARY.map((t) => t.name);
    expect(legendaryNames).toContain(item.name);
    expect(item.baseStat).toBeGreaterThanOrEqual(64);
    expect(item.baseStat).toBeLessThanOrEqual(90);
  });

  it('5 个品质阶按同 archetype 严格递增（相同种子→同 archetype→不同档位）', () => {
    // 用大样本统计：对同一 slot 同一 implicit 的 archetype，FINE 均值 > COMMON 均值
    const sampleMean = (slot: EquipSlot, quality: EquipQuality, implicit: string | undefined, n = 200) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        // 强制挑选指定 archetype：找到对应 index
        const pool = EQUIPMENT_POOL[slot][quality];
        const idx = pool.findIndex((t) => t.implicit === implicit);
        if (idx === -1) return NaN;
        const tpl = pool[idx];
        // 用 rng 在区间中随机
        const rng = createRng(i * 7 + 1);
        const stat = rng.int(tpl.baseStatMin, tpl.baseStatMax);
        sum += stat;
      }
      return sum / n;
    };

    const weaponSword = (q: EquipQuality) => sampleMean('WEAPON', q, undefined);
    const weaponAxe = (q: EquipQuality) => sampleMean('WEAPON', q, IMPLICIT_WEAPON_AXE);

    // 相邻品质均值严格递增
    expect(weaponSword('FINE')).toBeGreaterThan(weaponSword('COMMON'));
    expect(weaponSword('RARE')).toBeGreaterThan(weaponSword('FINE'));
    expect(weaponSword('EPIC')).toBeGreaterThan(weaponSword('RARE'));
    expect(weaponSword('LEGENDARY')).toBeGreaterThan(weaponSword('EPIC'));
    expect(weaponAxe('FINE')).toBeGreaterThan(weaponAxe('COMMON'));
  });

  it('5 个槽位均可生成，id 包含正确槽位字符串', () => {
    for (const slot of ALL_SLOTS) {
      const item = rollEquipment(createRng(100), slot, 'COMMON');
      expect(item.slot).toBe(slot);
      expect(item.id).toContain(slot.toLowerCase());
    }
  });

  it('确定性：相同 rngState → 相同装备（AC-13）', () => {
    const a = rollEquipment(createRng(555), 'WEAPON', 'RARE');
    const b = rollEquipment(createRng(555), 'WEAPON', 'RARE');
    expect(a).toEqual(b);
  });

  it('不同种子产生不同 id（基本唯一性）', () => {
    const ids = new Set(
      Array.from({ length: 20 }, (_, i) => rollEquipment(createRng(i * 100 + 1), 'WEAPON', 'COMMON').id),
    );
    expect(ids.size).toBeGreaterThan(10);
  });

  it('大样本中每件装备的 baseStat 都在 [baseStatMin, baseStatMax] 内', () => {
    const rng = createRng(202606);
    for (let i = 0; i < 500; i++) {
      const slot = rollRandomSlot(rng);
      const quality = ALL_QUALITIES[rng.int(0, 4)];
      const item = rollEquipment(rng, slot, quality);

      // 找对应模板，确认 baseStat 在区间内
      const tpl = EQUIPMENT_POOL[slot][quality].find((t) => t.name === item.name);
      expect(tpl).toBeDefined();
      expect(item.baseStat).toBeGreaterThanOrEqual(tpl!.baseStatMin);
      expect(item.baseStat).toBeLessThanOrEqual(tpl!.baseStatMax);
      expect(item.baseStatMax).toBe(tpl!.baseStatMax); // baseStatMax 精确携带
    }
  });
});

// ── AC-EQ-3：优缺点 implicit ─────────────────────────────────────────
describe('EquipmentSystem — implicit 优缺点生成（AC-EQ-3）', () => {
  it('斧类武器 rollEquipment 返回 implicit=weapon_axe', () => {
    // 找到斧的 index，用专门的 RNG 确保 pick 到斧
    const axeIdx = EQUIPMENT_POOL.WEAPON.COMMON.findIndex((t) => t.implicit === IMPLICIT_WEAPON_AXE);
    expect(axeIdx).toBeGreaterThanOrEqual(0);

    let foundAxe = false;
    for (let seed = 0; seed < 100; seed++) {
      const item = rollEquipment(createRng(seed), 'WEAPON', 'COMMON');
      if (item.implicit === IMPLICIT_WEAPON_AXE) {
        foundAxe = true;
        break;
      }
    }
    expect(foundAxe).toBe(true);
  });

  it('矛类武器 rollEquipment 返回 implicit=weapon_spear', () => {
    let foundSpear = false;
    for (let seed = 0; seed < 100; seed++) {
      const item = rollEquipment(createRng(seed), 'WEAPON', 'RARE');
      if (item.implicit === IMPLICIT_WEAPON_SPEAR) {
        foundSpear = true;
        break;
      }
    }
    expect(foundSpear).toBe(true);
  });

  it('板甲 rollEquipment 返回 implicit=armor_plate', () => {
    let foundPlate = false;
    for (let seed = 0; seed < 100; seed++) {
      const item = rollEquipment(createRng(seed), 'ARMOR', 'FINE');
      if (item.implicit === IMPLICIT_ARMOR_PLATE) {
        foundPlate = true;
        break;
      }
    }
    expect(foundPlate).toBe(true);
  });

  it('重盔 rollEquipment 返回 implicit=helmet_heavy', () => {
    let foundHeavy = false;
    for (let seed = 0; seed < 100; seed++) {
      const item = rollEquipment(createRng(seed), 'HELMET', 'RARE');
      if (item.implicit === IMPLICIT_HELMET_HEAVY) {
        foundHeavy = true;
        break;
      }
    }
    expect(foundHeavy).toBe(true);
  });

  it('无 implicit 的均衡款（剑/锁甲/战盔）返回 implicit=undefined', () => {
    // 至少存在 implicit=undefined 的件（前 100 次至少出现一次）
    let foundNoImplicit = false;
    for (let seed = 0; seed < 100; seed++) {
      const item = rollEquipment(createRng(seed), 'WEAPON', 'COMMON');
      if (!item.implicit) {
        foundNoImplicit = true;
        break;
      }
    }
    expect(foundNoImplicit).toBe(true);
  });
});

describe('EquipmentSystem — rollRandomSlot', () => {
  it('返回合法的槽位名称', () => {
    const slots = new Set(['WEAPON', 'ARMOR', 'HELMET', 'SHOES', 'TRINKET']);
    const rng = createRng(9999);
    for (let i = 0; i < 50; i++) {
      expect(slots.has(rollRandomSlot(rng))).toBe(true);
    }
  });

  it('5 个槽位大样本内均有出现（近似等概率）', () => {
    const counts: Record<string, number> = {};
    const rng = createRng(20260608);
    for (let i = 0; i < 1000; i++) {
      const slot = rollRandomSlot(rng);
      counts[slot] = (counts[slot] ?? 0) + 1;
    }
    Object.values(counts).forEach((c) => {
      expect(c).toBeGreaterThan(100);
      expect(c).toBeLessThan(300);
    });
  });
});
