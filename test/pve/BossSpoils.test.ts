// Boss 专属掉落表单测（Task #8）：
// 验证 BOSS_SPOILS 数据结构完整性与 rollBossSpoil 随机选择行为。

import { BOSS_SPOILS, findBossSpoilByName, rollBossSpoil } from '../../assets/scripts/pve/core/bosses/BossSpoils';
import type { BossId } from '../../assets/scripts/pve/core/bosses/BossSpoils';
import { createRng } from '../../assets/scripts/pve/core/rng';

const ALL_BOSS_IDS: BossId[] = ['GOBLIN_CHIEF', 'QUICKSAND_SCORPION', 'FROST_GIANT', 'LAVA_LORD', 'FATE_GUARDIAN'];

describe('BOSS_SPOILS 数据完整性', () => {
  it('每个 Boss 恰好 3 件专属道具', () => {
    for (const bossId of ALL_BOSS_IDS) {
      expect(BOSS_SPOILS[bossId]).toBeDefined();
      expect(BOSS_SPOILS[bossId].length).toBe(3);
    }
  });

  it('每件道具字段齐全（slot/quality/name/baseStat/trait）', () => {
    for (const bossId of ALL_BOSS_IDS) {
      for (const tpl of BOSS_SPOILS[bossId]) {
        expect(tpl.slot).toMatch(/^(WEAPON|HELMET|ARMOR|SHOES|TRINKET)$/);
        expect(tpl.quality).toMatch(/^(COMMON|FINE|RARE|EPIC|LEGENDARY)$/);
        expect(tpl.name.length).toBeGreaterThan(0);
        expect(tpl.baseStat).toBeGreaterThan(0);
        expect(tpl.trait.length).toBeGreaterThan(0);
      }
    }
  });

  it('品质按章节递增：ch1 RARE / ch2-3 EPIC / ch4-5 LEGENDARY', () => {
    expect(BOSS_SPOILS.GOBLIN_CHIEF.every((t) => t.quality === 'RARE')).toBe(true);
    expect(BOSS_SPOILS.QUICKSAND_SCORPION.every((t) => t.quality === 'EPIC')).toBe(true);
    expect(BOSS_SPOILS.FROST_GIANT.every((t) => t.quality === 'EPIC')).toBe(true);
    expect(BOSS_SPOILS.LAVA_LORD.every((t) => t.quality === 'LEGENDARY')).toBe(true);
    expect(BOSS_SPOILS.FATE_GUARDIAN.every((t) => t.quality === 'LEGENDARY')).toBe(true);
  });

  it('每个 Boss 至少有 1 件武器（确保武器路线总能强化）', () => {
    for (const bossId of ALL_BOSS_IDS) {
      const weapons = BOSS_SPOILS[bossId].filter((t) => t.slot === 'WEAPON');
      expect(weapons.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('同一 Boss 内 3 件道具 trait id 互不相同', () => {
    for (const bossId of ALL_BOSS_IDS) {
      const traits = BOSS_SPOILS[bossId].map((t) => t.trait);
      expect(new Set(traits).size).toBe(3);
    }
  });
});

describe('rollBossSpoil 随机行为', () => {
  it('findBossSpoilByName 可按中文名回退 Boss 战利品模板', () => {
    expect(findBossSpoilByName('哥布林酋长战斧')?.trait).toBe('on_hit_lifesteal_1');
    expect(findBossSpoilByName('不存在')).toBeNull();
  });

  it('生成的 EquipItem 字段与模板一致', () => {
    const rng = createRng(42);
    const item = rollBossSpoil(rng, 'GOBLIN_CHIEF');
    const matched = BOSS_SPOILS.GOBLIN_CHIEF.find((t) => t.name === item.name);
    expect(matched).toBeDefined();
    expect(item.slot).toBe(matched!.slot);
    expect(item.quality).toBe(matched!.quality);
    expect(item.baseStat).toBe(matched!.baseStat);
    expect(item.trait).toBe(matched!.trait);
  });

  it('id 包含 bossId 与槽位（便于调试）', () => {
    const rng = createRng(42);
    const item = rollBossSpoil(rng, 'QUICKSAND_SCORPION');
    expect(item.id).toContain('quicksand_scorpion');
    expect(item.id.toLowerCase()).toContain(item.slot.toLowerCase());
  });

  it('大量样本下 3 件道具均能掷出（分布大致均匀）', () => {
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed);
      const item = rollBossSpoil(rng, 'FROST_GIANT');
      counts[item.name] = (counts[item.name] ?? 0) + 1;
    }
    const names = Object.keys(counts);
    expect(names.length).toBe(3);
    // 等概率下 100 次/300 总样本 ≈ 100；允许较大偏差（30~170）以避免不稳定
    for (const name of names) {
      expect(counts[name]).toBeGreaterThan(30);
      expect(counts[name]).toBeLessThan(170);
    }
  });

  it('同 seed 同 bossId → 同结果（AC-13 确定性）', () => {
    const rng1 = createRng(123);
    const rng2 = createRng(123);
    const a = rollBossSpoil(rng1, 'LAVA_LORD');
    const b = rollBossSpoil(rng2, 'LAVA_LORD');
    expect(a.name).toBe(b.name);
    expect(a.id).toBe(b.id);
  });
});
