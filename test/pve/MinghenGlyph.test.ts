import { MINGHEN_CATALOG } from '../../assets/scripts/pve/core/minghen/MinghenCatalog';
import {
  buildMinghenGlyph,
  glyphPointDegrees,
  isGlyphFullyConnected,
} from '../../assets/scripts/pve/core/minghen/MinghenGlyph';

describe('MinghenGlyph', () => {
  test('same id yields identical glyph', () => {
    const a = buildMinghenGlyph('M05');
    const b = buildMinghenGlyph('M05');
    expect(a).toEqual(b);
  });

  test('every catalog id has 4–7 points, strokes, and no orphan points', () => {
    for (const def of MINGHEN_CATALOG) {
      const g = buildMinghenGlyph(def.id);
      expect(g.points.length).toBeGreaterThanOrEqual(4);
      expect(g.points.length).toBeLessThanOrEqual(7);
      expect(g.strokes.length).toBeGreaterThanOrEqual(1);
      expect(isGlyphFullyConnected(g)).toBe(true);
      for (const deg of glyphPointDegrees(g)) expect(deg).toBeGreaterThanOrEqual(1);
    }
  });

  test('every catalog id has a unique glyph shape', () => {
    const shapes = MINGHEN_CATALOG.map((def) => JSON.stringify(buildMinghenGlyph(def.id)));
    expect(new Set(shapes).size).toBe(MINGHEN_CATALOG.length);
  });
});
