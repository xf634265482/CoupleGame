import { rollEquipment, rollRandomSlot } from '../../assets/scripts/pve/core/EquipmentSystem';
import { createRng } from '../../assets/scripts/pve/core/rng';

describe('EquipmentSystem — 装备生成（AC-17 M2）', () => {
  describe('rollEquipment', () => {
    it('返回正确结构：id / slot / quality / name / baseStat', () => {
      const rng = createRng(1234);
      const item = rollEquipment(rng, 'WEAPON', 'FINE');

      expect(item.slot).toBe('WEAPON');
      expect(item.quality).toBe('FINE');
      expect(item.name).toBeTruthy();
      expect(item.baseStat).toBeGreaterThan(0);
      expect(item.id).toMatch(/^equip_weapon_fine_\d+$/);
    });

    it('ARMOR COMMON：baseStat = 10（减伤值，×10 基准）', () => {
      const rng = createRng(42);
      const item = rollEquipment(rng, 'ARMOR', 'COMMON');
      expect(item.slot).toBe('ARMOR');
      expect(item.quality).toBe('COMMON');
      expect(item.baseStat).toBe(10);
    });

    it('WEAPON LEGENDARY：baseStat = 80（最高品质武器攻击加成，×10 基准）', () => {
      const rng = createRng(99);
      const item = rollEquipment(rng, 'WEAPON', 'LEGENDARY');
      expect(item.baseStat).toBe(80);
      expect(item.name).toBe('命运之剑');
    });

    it('5 个品质阶各自生成不同 baseStat', () => {
      const qualities = ['COMMON', 'FINE', 'RARE', 'EPIC', 'LEGENDARY'] as const;
      const stats = qualities.map((q) => rollEquipment(createRng(7), 'ARMOR', q).baseStat);
      // 各品质 baseStat 严格递增
      for (let i = 1; i < stats.length; i++) {
        expect(stats[i]).toBeGreaterThan(stats[i - 1]);
      }
    });

    it('5 个槽位均可生成，id 包含正确槽位字符串', () => {
      const slots = ['WEAPON', 'ARMOR', 'HELMET', 'SHOES', 'TRINKET'] as const;
      slots.forEach((slot) => {
        const item = rollEquipment(createRng(100), slot, 'COMMON');
        expect(item.slot).toBe(slot);
        expect(item.id).toContain(slot.toLowerCase());
      });
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
  });

  describe('rollRandomSlot', () => {
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
      // 每个槽位出现次数在 [100, 300] 之间（期望 200，允许 ±50%）
      Object.values(counts).forEach((c) => {
        expect(c).toBeGreaterThan(100);
        expect(c).toBeLessThan(300);
      });
    });
  });
});
