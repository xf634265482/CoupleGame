import { MINGHEN_CATALOG, getMinghenDefinition } from '../../assets/scripts/pve/core/minghen/MinghenCatalog';

describe('Minghen catalog', () => {
  test('contains exactly 24 unique three-level definitions', () => {
    expect(MINGHEN_CATALOG).toHaveLength(24);
    expect(new Set(MINGHEN_CATALOG.map(x => x.id)).size).toBe(24);
    for (const entry of MINGHEN_CATALOG) {
      expect(entry.values[1].length).toBeGreaterThan(0);
      expect(entry.values[2].length).toBeGreaterThan(0);
      expect(entry.values[3].length).toBeGreaterThan(0);
      expect(entry.sourceFloor).toBeGreaterThanOrEqual(1);
      expect(entry.sourceFloor).toBeLessThanOrEqual(7);
    }
  });
  test('matches first chapter source distribution', () => {
    expect(MINGHEN_CATALOG.filter(x=>x.sourceFloor===1)).toHaveLength(3);
    expect(MINGHEN_CATALOG.filter(x=>x.sourceFloor===2)).toHaveLength(4);
    expect(MINGHEN_CATALOG.filter(x=>x.sourceFloor===7)).toHaveLength(3);
    expect(getMinghenDefinition('M24').name).toBe('静界');
  });
});
