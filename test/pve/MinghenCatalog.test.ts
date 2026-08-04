import { MINGHEN_CATALOG, getMinghenDefinition } from '../../assets/scripts/pve/core/minghen/MinghenCatalog';
import { getMinghenEffectText } from '../../assets/scripts/pve/core/minghen/MinghenDisplay';

describe('Minghen catalog', () => {
  test('contains 56 unique definitions; M39-M56 unassigned sourceFloor', () => {
    expect(MINGHEN_CATALOG).toHaveLength(56);
    expect(new Set(MINGHEN_CATALOG.map(x => x.id)).size).toBe(56);
    for (const entry of MINGHEN_CATALOG) {
      expect(entry.values[1].length).toBeGreaterThan(0);
      expect(entry.values[2].length).toBeGreaterThan(0);
      expect(entry.values[3].length).toBeGreaterThan(0);
      expect(entry.effects[1].length).toBeGreaterThan(8);
      expect(entry.effects[2].length).toBeGreaterThan(8);
      expect(entry.effects[3].length).toBeGreaterThan(8);
      if (Number(entry.id.slice(1)) >= 39) {
        expect(entry.sourceFloor).toBe(0);
      } else {
        expect(entry.sourceFloor).toBeGreaterThanOrEqual(1);
        expect(entry.sourceFloor).toBeLessThanOrEqual(14);
      }
    }
    expect(getMinghenDefinition('M22').name).toBe('脱围');
    expect(getMinghenDefinition('M25').name).toBe('轻足');
    expect(getMinghenDefinition('M26').name).toBe('抗灾');
    expect(getMinghenDefinition('M31').name).toBe('抢位');
    expect(getMinghenDefinition('M32').name).toBe('整备');
    expect(getMinghenDefinition('M35').name).toBe('凝甲');
    expect(getMinghenDefinition('M37').name).toBe('止损');
    expect(getMinghenDefinition('M38').name).toBe('疾退');
    expect(getMinghenDefinition('M08').effects[3]).toContain('护盾');
    expect(getMinghenDefinition('M08').effects[3]).not.toContain('复制');
  });

  test('matches first chapter source distribution', () => {
    expect(MINGHEN_CATALOG.filter(x=>x.sourceFloor===1)).toHaveLength(3);
    expect(MINGHEN_CATALOG.filter(x=>x.sourceFloor===2)).toHaveLength(4);
    expect(MINGHEN_CATALOG.filter(x=>x.sourceFloor===7)).toHaveLength(3);
    expect(getMinghenDefinition('M24').name).toBe('静界');
    expect(getMinghenDefinition('M39').name).toBe('孤锋');
    expect(getMinghenDefinition('M56').name).toBe('掩护');
  });

  test('exposes player-facing names and exact level effects', () => {
    expect(getMinghenDefinition('M01').effects[1]).toContain('流血');
    expect(getMinghenDefinition('M12').effects[3]).toContain('护甲穿透');
    expect(getMinghenDefinition('M37').effects[1]).toContain('超过最大生命20%');
    expect(getMinghenEffectText('M24', 3)).toContain('不能移动');
  });
});
