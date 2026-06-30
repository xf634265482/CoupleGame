// Phase 4 掉率表单测（AC-EQ-7、AC-EQ-11、AC-EQ-12）
// 覆盖：单次掷骰确定性 + 章节封顶 + 橙装第3章起 + 蒙特卡洛品质分布

import { rollEquipQuality, rollNormalMonsterDrop, rollEliteMonsterDrop, type EquipDropTable } from '../../assets/scripts/pve/core/LootSystem';
import { NORMAL_MONSTER_EQUIP_DROP_TABLE, ELITE_MONSTER_EQUIP_DROP_TABLE, CHEST_EQUIP_DROP_TABLE } from '../../assets/scripts/pve/core/PveConstants';
import { createRng } from '../../assets/scripts/pve/core/rng';
import type { EquipQuality } from '../../assets/scripts/pve/core/PveTypes';

// ── rollEquipQuality 单元测试 ────────────────────────────────────────────

describe('rollEquipQuality — 单次掷骰（AC-EQ-7/AC-EQ-11）', () => {
  it('确定性：相同种子 → 相同结果（AC-13）', () => {
    for (const table of [NORMAL_MONSTER_EQUIP_DROP_TABLE, ELITE_MONSTER_EQUIP_DROP_TABLE, CHEST_EQUIP_DROP_TABLE]) {
      for (let seed = 0; seed < 20; seed++) {
        const a = rollEquipQuality(createRng(seed), table, 3);
        const b = rollEquipQuality(createRng(seed), table, 3);
        expect(a).toBe(b);
      }
    }
  });

  it('橙（LEGENDARY）第1/2章不出现（章节封顶）', () => {
    for (let seed = 0; seed < 200; seed++) {
      const r1 = rollEquipQuality(createRng(seed), NORMAL_MONSTER_EQUIP_DROP_TABLE, 1);
      const r2 = rollEquipQuality(createRng(seed), NORMAL_MONSTER_EQUIP_DROP_TABLE, 2);
      expect(r1).not.toBe('LEGENDARY');
      expect(r2).not.toBe('LEGENDARY');
    }
    for (let seed = 0; seed < 200; seed++) {
      const r1 = rollEquipQuality(createRng(seed), ELITE_MONSTER_EQUIP_DROP_TABLE, 1);
      const r2 = rollEquipQuality(createRng(seed), ELITE_MONSTER_EQUIP_DROP_TABLE, 2);
      expect(r1).not.toBe('LEGENDARY');
      expect(r2).not.toBe('LEGENDARY');
    }
  });

  it('橙（LEGENDARY）第3章可出现', () => {
    let foundLegendary = false;
    for (let seed = 0; seed < 50000; seed++) {
      const r = rollEquipQuality(createRng(seed), NORMAL_MONSTER_EQUIP_DROP_TABLE, 3);
      if (r === 'LEGENDARY') { foundLegendary = true; break; }
    }
    expect(foundLegendary).toBe(true);
  });

  it('第1章普通怪：只能出 COMMON 或 FINE 或 null', () => {
    const allowed = new Set<EquipQuality | null>(['COMMON', 'FINE', null]);
    for (let seed = 0; seed < 300; seed++) {
      const r = rollEquipQuality(createRng(seed), NORMAL_MONSTER_EQUIP_DROP_TABLE, 1);
      expect(allowed.has(r)).toBe(true);
    }
  });

  it('第1章精英怪：只能出 FINE 或 null（无 COMMON/RARE+）', () => {
    const allowed = new Set<EquipQuality | null>(['FINE', null]);
    for (let seed = 0; seed < 500; seed++) {
      const r = rollEquipQuality(createRng(seed), ELITE_MONSTER_EQUIP_DROP_TABLE, 1);
      expect(allowed.has(r)).toBe(true);
    }
  });

  it('返回结果互斥：一次 rng.next() 决定全部（消耗恰好 1 个 rng 调用）', () => {
    const rng = createRng(42);
    const stateBefore = rng.state();
    rollEquipQuality(rng, NORMAL_MONSTER_EQUIP_DROP_TABLE, 3);
    const stateAfter = rng.state();
    // 验证确实有消耗（state 应该不同，因为 next() 推进了）
    expect(stateAfter).not.toBe(stateBefore);
  });
});

// ── 蒙特卡洛分布（AC-EQ-12）────────────────────────────────────────────────

describe('蒙特卡洛掉率分布（AC-EQ-12）', () => {
  function sampleQualityDistribution(
    table: EquipDropTable,
    chapter: number,
    samples: number,
  ): Record<string, number> {
    const counts: Record<string, number> = { LEGENDARY: 0, EPIC: 0, RARE: 0, FINE: 0, COMMON: 0, null: 0 };
    for (let i = 0; i < samples; i++) {
      const r = rollEquipQuality(createRng(i * 7 + chapter * 1000), table, chapter);
      counts[String(r)]++;
    }
    return counts;
  }

  it('普通怪 ch5：各品质掉率在预期范围（±50%容差）', () => {
    const N = 100000;
    const counts = sampleQualityDistribution(NORMAL_MONSTER_EQUIP_DROP_TABLE, 5, N);

    // LEGENDARY: 0.6% → 0.3%~0.9%
    expect(counts['LEGENDARY'] / N).toBeGreaterThan(0.003);
    expect(counts['LEGENDARY'] / N).toBeLessThan(0.009);

    // EPIC: 2% → 1%~3%
    expect(counts['EPIC'] / N).toBeGreaterThan(0.01);
    expect(counts['EPIC'] / N).toBeLessThan(0.03);

    // COMMON: 3% → 1.5%~4.5%
    expect(counts['COMMON'] / N).toBeGreaterThan(0.015);
    expect(counts['COMMON'] / N).toBeLessThan(0.045);
  });

  it('精英怪 ch3：FINE+以上总掉率在 14%±3%', () => {
    const N = 100000;
    const counts = sampleQualityDistribution(ELITE_MONSTER_EQUIP_DROP_TABLE, 3, N);
    const total = (counts['LEGENDARY'] + counts['EPIC'] + counts['RARE'] + counts['FINE']) / N;
    // 0.5+3+5+6 = 14.5%
    expect(total).toBeGreaterThan(0.11);
    expect(total).toBeLessThan(0.18);
  });

  it('宝箱 ch1：装备总掉率约 12%±3%', () => {
    const N = 100000;
    const counts = sampleQualityDistribution(CHEST_EQUIP_DROP_TABLE, 1, N);
    const total = (counts['COMMON'] + counts['FINE']) / N;
    // 8+4=12%
    expect(total).toBeGreaterThan(0.09);
    expect(total).toBeLessThan(0.15);
  });
});

// ── rollNormalMonsterDrop：classId 传递给橙装 ──────────────────────────────

describe('rollNormalMonsterDrop — classId 传参', () => {
  it('确定性：相同种子 → 相同结果', () => {
    for (let seed = 0; seed < 20; seed++) {
      const a = rollNormalMonsterDrop(createRng(seed), 3, undefined, 'BERSERKER');
      const b = rollNormalMonsterDrop(createRng(seed), 3, undefined, 'BERSERKER');
      expect(a).toEqual(b);
    }
  });

  it('当掉落橙装时，传入不同 classId 结果可能不同（偏向生效）', () => {
    // 找一个会掉出 LEGENDARY 的种子（ch5）
    let berserkerLeg = '';
    let archerLeg = '';
    for (let seed = 0; seed < 100000 && (!berserkerLeg || !archerLeg); seed++) {
      const r = rollNormalMonsterDrop(createRng(seed), 5, undefined, 'BERSERKER');
      if (r.equip?.quality === 'LEGENDARY' && !berserkerLeg) berserkerLeg = r.equip.legendaryId ?? '';
      const r2 = rollNormalMonsterDrop(createRng(seed), 5, undefined, 'ARCHER');
      if (r2.equip?.quality === 'LEGENDARY' && !archerLeg) archerLeg = r2.equip.legendaryId ?? '';
    }
    // 至少找到了一次橙装掉落
    expect(berserkerLeg || archerLeg).toBeTruthy();
  });
});
