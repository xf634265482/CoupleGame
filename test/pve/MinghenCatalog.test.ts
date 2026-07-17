import { MINGHEN_CATALOG, getMinghenDefinition } from '../../assets/scripts/pve/core/minghen/MinghenCatalog';
import { getMinghenEffectText } from '../../assets/scripts/pve/core/minghen/MinghenDisplay';

describe('Minghen catalog', () => {
  test('contains exactly 26 unique three-level definitions', () => {
    expect(MINGHEN_CATALOG).toHaveLength(26);
    expect(new Set(MINGHEN_CATALOG.map(x => x.id)).size).toBe(26);
    for (const entry of MINGHEN_CATALOG) {
      expect(entry.values[1].length).toBeGreaterThan(0);
      expect(entry.values[2].length).toBeGreaterThan(0);
      expect(entry.values[3].length).toBeGreaterThan(0);
      expect(entry.effects[1].length).toBeGreaterThan(8);
      expect(entry.effects[2].length).toBeGreaterThan(8);
      expect(entry.effects[3].length).toBeGreaterThan(8);
      expect(entry.sourceFloor).toBeGreaterThanOrEqual(1);
      expect(entry.sourceFloor).toBeLessThanOrEqual(14);
    }
  });
  test('matches first chapter source distribution', () => {
    expect(MINGHEN_CATALOG.filter(x=>x.sourceFloor===1)).toHaveLength(3);
    expect(MINGHEN_CATALOG.filter(x=>x.sourceFloor===2)).toHaveLength(4);
    expect(MINGHEN_CATALOG.filter(x=>x.sourceFloor===7)).toHaveLength(3);
    expect(getMinghenDefinition('M24').name).toBe('静界');
  });

  test('exposes player-facing names and exact level effects', () => {
    expect(getMinghenDefinition('M01').effects[1]).toContain('流血');
    expect(getMinghenDefinition('M12').effects[3]).toContain('护甲穿透');
    expect(getMinghenEffectText('M24', 3)).toContain('不能移动');
  });
});
