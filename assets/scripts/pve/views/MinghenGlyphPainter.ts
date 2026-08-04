import { Color, Graphics } from 'cc';
import type { MinghenGlyphData } from '../core/minghen/MinghenGlyph';

const TINT: Record<MinghenGlyphData['tint'], Color> = {
  cyan: new Color(126, 240, 255, 255),
  violet: new Color(198, 180, 255, 255),
  gold: new Color(255, 230, 140, 255),
};

/** Draw a hieroglyph constellation glyph centered at local (0,0). */
export function paintMinghenGlyph(g: Graphics, data: MinghenGlyphData, size: number): void {
  const color = TINT[data.tint];
  const glow = new Color(color.r, color.g, color.b, 70);
  const r = size * 0.42;
  g.fillColor = new Color(7, 21, 38, 255);
  g.circle(0, 0, r);
  g.fill();
  g.strokeColor = new Color(22, 48, 79, 255);
  g.lineWidth = 1.5;
  g.circle(0, 0, r);
  g.stroke();

  const scale = size * 0.32;
  const pts = data.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));

  for (const s of data.strokes) {
    const a = pts[s.a]!;
    const b = pts[s.b]!;
    g.strokeColor = glow;
    g.lineWidth = 5;
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.strokeColor = color;
    g.lineWidth = 1.6;
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }

  for (const p of pts) {
    g.fillColor = glow;
    g.circle(p.x, p.y, 5);
    g.fill();
    g.fillColor = new Color(255, 252, 232, 255);
    g.circle(p.x, p.y, 2.2);
    g.fill();
  }
}
