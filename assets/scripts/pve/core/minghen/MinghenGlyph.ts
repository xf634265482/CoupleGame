/** Deterministic hieroglyph-style constellation glyphs for minghen ids. No `cc` / no Math.random. */

export interface MinghenGlyphPoint {
  x: number;
  y: number;
}

export interface MinghenGlyphStroke {
  a: number;
  b: number;
}

export type MinghenGlyphTint = 'cyan' | 'violet' | 'gold';

export interface MinghenGlyphData {
  points: MinghenGlyphPoint[];
  strokes: MinghenGlyphStroke[];
  tint: MinghenGlyphTint;
}

interface GlyphTemplate {
  points: readonly MinghenGlyphPoint[];
  strokes: readonly MinghenGlyphStroke[];
}

/** Fully connected pictograph skeletons (every point degree ≥ 1). */
const TEMPLATES: readonly GlyphTemplate[] = [
  // staff / person
  {
    points: [
      { x: 0, y: 0.85 },
      { x: -0.55, y: 0.25 },
      { x: 0.55, y: 0.25 },
      { x: 0, y: -0.05 },
      { x: -0.4, y: -0.75 },
      { x: 0.4, y: -0.75 },
      { x: 0, y: -0.75 },
    ],
    strokes: [
      { a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 },
      { a: 3, b: 4 }, { a: 3, b: 5 }, { a: 3, b: 6 },
    ],
  },
  // eye
  {
    points: [
      { x: -0.85, y: 0 },
      { x: 0.85, y: 0 },
      { x: 0, y: 0.45 },
      { x: 0, y: -0.45 },
      { x: 0, y: 0 },
    ],
    strokes: [
      { a: 0, b: 2 }, { a: 2, b: 1 }, { a: 1, b: 3 }, { a: 3, b: 0 },
      { a: 2, b: 4 }, { a: 4, b: 3 },
    ],
  },
  // mountain / M
  {
    points: [
      { x: -0.85, y: -0.55 },
      { x: -0.35, y: 0.65 },
      { x: 0, y: -0.05 },
      { x: 0.35, y: 0.75 },
      { x: 0.85, y: -0.55 },
    ],
    strokes: [
      { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 },
    ],
  },
  // hook spiral
  {
    points: [
      { x: -0.45, y: 0.7 },
      { x: 0.5, y: 0.7 },
      { x: 0.65, y: 0.05 },
      { x: 0, y: -0.55 },
      { x: -0.6, y: -0.15 },
      { x: -0.35, y: 0.25 },
      { x: 0.25, y: 0.25 },
    ],
    strokes: [
      { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 },
      { a: 4, b: 5 }, { a: 5, b: 6 },
    ],
  },
  // angle / chevron stack
  {
    points: [
      { x: -0.55, y: 0.15 },
      { x: 0, y: 0.8 },
      { x: 0.55, y: 0.15 },
      { x: -0.45, y: -0.65 },
      { x: 0, y: -0.15 },
      { x: 0.45, y: -0.65 },
    ],
    strokes: [
      { a: 0, b: 1 }, { a: 1, b: 2 },
      { a: 3, b: 4 }, { a: 4, b: 5 },
      { a: 4, b: 1 },
    ],
  },
  // gate / house
  {
    points: [
      { x: -0.65, y: -0.55 },
      { x: -0.65, y: 0.2 },
      { x: 0, y: 0.8 },
      { x: 0.65, y: 0.2 },
      { x: 0.65, y: -0.55 },
    ],
    strokes: [
      { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }, { a: 4, b: 0 },
    ],
  },
  // bow / arc
  {
    points: [
      { x: -0.75, y: -0.2 },
      { x: -0.25, y: 0.7 },
      { x: 0.25, y: 0.7 },
      { x: 0.75, y: -0.2 },
      { x: 0, y: -0.65 },
      { x: 0, y: 0.15 },
    ],
    strokes: [
      { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 },
      { a: 0, b: 4 }, { a: 3, b: 4 }, { a: 4, b: 5 }, { a: 5, b: 1 },
    ],
  },
  // trident
  {
    points: [
      { x: 0, y: -0.8 },
      { x: 0, y: 0.1 },
      { x: -0.65, y: 0.7 },
      { x: 0, y: 0.75 },
      { x: 0.65, y: 0.7 },
    ],
    strokes: [
      { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 1, b: 3 }, { a: 1, b: 4 },
    ],
  },
];

const TINTS: readonly MinghenGlyphTint[] = ['cyan', 'violet', 'gold'];

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function cloneTemplate(t: GlyphTemplate): MinghenGlyphData {
  return {
    points: t.points.map((p) => ({ x: p.x, y: p.y })),
    strokes: t.strokes.map((s) => ({ a: s.a, b: s.b })),
    tint: 'cyan',
  };
}

function applyJitter(data: MinghenGlyphData, hash: number): MinghenGlyphData {
  const points = data.points.map((p, i) => {
    const sx = 1 + (((hash >>> (i * 3)) & 7) - 3) * 0.012;
    const sy = 1 + (((hash >>> (i * 3 + 1)) & 7) - 3) * 0.012;
    return { x: p.x * sx, y: p.y * sy };
  });
  return { points, strokes: data.strokes.map((s) => ({ ...s })), tint: data.tint };
}

export function glyphPointDegrees(data: MinghenGlyphData): number[] {
  const deg = data.points.map(() => 0);
  for (const s of data.strokes) {
    deg[s.a]! += 1;
    deg[s.b]! += 1;
  }
  return deg;
}

export function isGlyphFullyConnected(data: MinghenGlyphData): boolean {
  if (data.points.length === 0) return false;
  return glyphPointDegrees(data).every((d) => d >= 1);
}

export function buildMinghenGlyph(id: string): MinghenGlyphData {
  const hash = hashId(id);
  const template = TEMPLATES[hash % TEMPLATES.length]!;
  const base = cloneTemplate(template);
  base.tint = TINTS[hash % TINTS.length]!;
  const jittered = applyJitter(base, hash >>> 8);
  jittered.tint = base.tint;
  if (isGlyphFullyConnected(jittered)) return jittered;
  return base;
}
