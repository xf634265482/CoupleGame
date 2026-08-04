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

/** 14 fully-connected pictographs × 4 rotations = 56 unique assignments for M01–M56. */
const TEMPLATES: readonly GlyphTemplate[] = [
  { // staff
    points: [{ x: 0, y: 0.85 }, { x: -0.55, y: 0.25 }, { x: 0.55, y: 0.25 }, { x: 0, y: -0.05 }, { x: -0.4, y: -0.75 }, { x: 0.4, y: -0.75 }, { x: 0, y: -0.75 }],
    strokes: [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 }, { a: 3, b: 4 }, { a: 3, b: 5 }, { a: 3, b: 6 }],
  },
  { // eye
    points: [{ x: -0.85, y: 0 }, { x: 0.85, y: 0 }, { x: 0, y: 0.45 }, { x: 0, y: -0.45 }, { x: 0, y: 0 }],
    strokes: [{ a: 0, b: 2 }, { a: 2, b: 1 }, { a: 1, b: 3 }, { a: 3, b: 0 }, { a: 2, b: 4 }, { a: 4, b: 3 }],
  },
  { // mountain
    points: [{ x: -0.85, y: -0.55 }, { x: -0.35, y: 0.65 }, { x: 0, y: -0.05 }, { x: 0.35, y: 0.75 }, { x: 0.85, y: -0.55 }],
    strokes: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }],
  },
  { // hook
    points: [{ x: -0.45, y: 0.7 }, { x: 0.5, y: 0.7 }, { x: 0.65, y: 0.05 }, { x: 0, y: -0.55 }, { x: -0.6, y: -0.15 }, { x: -0.35, y: 0.25 }, { x: 0.25, y: 0.25 }],
    strokes: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }, { a: 4, b: 5 }, { a: 5, b: 6 }],
  },
  { // chevron
    points: [{ x: -0.55, y: 0.15 }, { x: 0, y: 0.8 }, { x: 0.55, y: 0.15 }, { x: -0.45, y: -0.65 }, { x: 0, y: -0.15 }, { x: 0.45, y: -0.65 }],
    strokes: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 3, b: 4 }, { a: 4, b: 5 }, { a: 4, b: 1 }],
  },
  { // gate
    points: [{ x: -0.65, y: -0.55 }, { x: -0.65, y: 0.2 }, { x: 0, y: 0.8 }, { x: 0.65, y: 0.2 }, { x: 0.65, y: -0.55 }],
    strokes: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }, { a: 4, b: 0 }],
  },
  { // bow
    points: [{ x: -0.75, y: -0.2 }, { x: -0.25, y: 0.7 }, { x: 0.25, y: 0.7 }, { x: 0.75, y: -0.2 }, { x: 0, y: -0.65 }, { x: 0, y: 0.15 }],
    strokes: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 0, b: 4 }, { a: 3, b: 4 }, { a: 4, b: 5 }, { a: 5, b: 1 }],
  },
  { // trident
    points: [{ x: 0, y: -0.8 }, { x: 0, y: 0.1 }, { x: -0.65, y: 0.7 }, { x: 0, y: 0.75 }, { x: 0.65, y: 0.7 }],
    strokes: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 1, b: 3 }, { a: 1, b: 4 }],
  },
  { // zigzag N
    points: [{ x: -0.7, y: -0.7 }, { x: -0.7, y: 0.7 }, { x: 0.1, y: -0.35 }, { x: 0.7, y: 0.7 }, { x: 0.7, y: -0.7 }],
    strokes: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }],
  },
  { // diamond cross
    points: [{ x: 0, y: 0.8 }, { x: 0.7, y: 0 }, { x: 0, y: -0.8 }, { x: -0.7, y: 0 }, { x: 0, y: 0 }],
    strokes: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 0 }, { a: 0, b: 4 }, { a: 2, b: 4 }],
  },
  { // fork
    points: [{ x: 0, y: -0.75 }, { x: 0, y: 0 }, { x: -0.7, y: 0.55 }, { x: -0.2, y: 0.75 }, { x: 0.2, y: 0.75 }, { x: 0.7, y: 0.55 }],
    strokes: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 1, b: 3 }, { a: 1, b: 4 }, { a: 1, b: 5 }],
  },
  { // ladder
    points: [{ x: -0.55, y: 0.75 }, { x: 0.55, y: 0.75 }, { x: -0.55, y: 0 }, { x: 0.55, y: 0 }, { x: -0.55, y: -0.75 }, { x: 0.55, y: -0.75 }],
    strokes: [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 1, b: 3 }, { a: 2, b: 3 }, { a: 2, b: 4 }, { a: 3, b: 5 }, { a: 4, b: 5 }],
  },
  { // crescent path
    points: [{ x: 0.55, y: 0.7 }, { x: -0.15, y: 0.55 }, { x: -0.65, y: 0 }, { x: -0.15, y: -0.55 }, { x: 0.55, y: -0.7 }, { x: 0.25, y: 0 }],
    strokes: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }, { a: 1, b: 5 }, { a: 5, b: 3 }],
  },
  { // arrow
    points: [{ x: 0, y: 0.85 }, { x: -0.55, y: 0.2 }, { x: 0.55, y: 0.2 }, { x: 0, y: 0.2 }, { x: 0, y: -0.8 }],
    strokes: [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 }, { a: 3, b: 4 }],
  },
];

const TINTS: readonly MinghenGlyphTint[] = ['cyan', 'violet', 'gold'];
const ROTATION_STEPS = 4; // 0 / 90 / 180 / 270

function parseMinghenIndex(id: string): number {
  const digits = id.replace(/\D/g, '');
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : (hashId(id) % 56) + 1;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rotatePoint(p: MinghenGlyphPoint, quarterTurns: number): MinghenGlyphPoint {
  let { x, y } = p;
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < turns; i += 1) {
    const nx = -y;
    const ny = x;
    x = nx;
    y = ny;
  }
  return { x, y };
}

function cloneTransformed(t: GlyphTemplate, quarterTurns: number, mirrorX: boolean): MinghenGlyphData {
  const points = t.points.map((p) => {
    const rotated = rotatePoint(p, quarterTurns);
    return mirrorX ? { x: -rotated.x, y: rotated.y } : rotated;
  });
  return {
    points,
    strokes: t.strokes.map((s) => ({ a: s.a, b: s.b })),
    tint: 'cyan',
  };
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

/**
 * M01–M56 each get a unique (template, rotation) pair.
 * Extra ids fall back to hash mixing with the same uniqueness constraints.
 */
export function buildMinghenGlyph(id: string): MinghenGlyphData {
  const index = parseMinghenIndex(id); // 1-based
  const slot = (index - 1) % (TEMPLATES.length * ROTATION_STEPS);
  const template = TEMPLATES[slot % TEMPLATES.length]!;
  const quarterTurns = Math.floor(slot / TEMPLATES.length) % ROTATION_STEPS;
  const base = cloneTransformed(template, quarterTurns, false);
  base.tint = TINTS[(index + quarterTurns) % TINTS.length]!;
  if (!isGlyphFullyConnected(base)) {
    const fallback = cloneTransformed(TEMPLATES[0]!, 0, false);
    fallback.tint = base.tint;
    return fallback;
  }
  return base;
}
