import { Color, Graphics } from 'cc';
import { CAMP_SLOT_SIZE } from './CampLayoutConstants';
import { furnaceSlotLocals, starchartSlotLocals } from './CampSynthStageLayout';

function roundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number): void {
  const left = x - w / 2;
  const bottom = y - h / 2;
  g.roundRect(left, bottom, w, h, r);
}

/** Multi-pass solid glow ring (no dashes). */
function glowCircle(g: Graphics, r: number, core: Color, glow: Color, outerGlow?: Color): void {
  if (outerGlow) {
    g.strokeColor = outerGlow;
    g.lineWidth = 10;
    g.circle(0, 0, r);
    g.stroke();
  }
  g.strokeColor = glow;
  g.lineWidth = 5;
  g.circle(0, 0, r);
  g.stroke();
  g.strokeColor = core;
  g.lineWidth = 1.8;
  g.circle(0, 0, r);
  g.stroke();
}

function glowSegment(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  core: Color,
  glow: Color,
): void {
  g.strokeColor = glow;
  g.lineWidth = 6;
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  g.strokeColor = core;
  g.lineWidth = 1.8;
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

function paintSlotWell(
  g: Graphics,
  x: number,
  y: number,
  fill: Color,
  border: Color,
  glow: Color,
): void {
  const size = CAMP_SLOT_SIZE + 6;
  const r = 12;
  roundRect(g, x, y, size + 8, size + 8, r + 2);
  g.fillColor = glow;
  g.fill();
  roundRect(g, x, y, size, size, r);
  g.fillColor = fill;
  g.fill();
  roundRect(g, x, y, size, size, r);
  g.strokeColor = border;
  g.lineWidth = 2;
  g.stroke();
}

/** Warm furnace plate for equipment synth. Local origin = stage center. */
export function paintFurnaceStage(g: Graphics, width: number, height: number): void {
  const radius = 18;
  // Warm charcoal base — not cold navy.
  roundRect(g, 0, 0, width, height, radius);
  g.fillColor = new Color(28, 16, 10, 250);
  g.fill();

  // Ember wash layers (bottom-heavy orange refining table).
  g.fillColor = new Color(90, 36, 12, 110);
  g.circle(0, -height * 0.12, Math.min(width, height) * 0.42);
  g.fill();
  g.fillColor = new Color(160, 70, 22, 90);
  g.circle(0, -height * 0.2, Math.min(width, height) * 0.3);
  g.fill();
  g.fillColor = new Color(220, 110, 36, 55);
  g.circle(0, -height * 0.26, Math.min(width, height) * 0.18);
  g.fill();
  g.fillColor = new Color(255, 180, 70, 35);
  g.circle(0, -height * 0.28, Math.min(width, height) * 0.1);
  g.fill();

  // Molten pool rings near bottom.
  const mouthY = -height / 2 + 48;
  const mouthRings = [
    { r: 52, fill: new Color(255, 90, 20, 35), stroke: new Color(255, 140, 50, 90) },
    { r: 36, fill: new Color(255, 130, 40, 50), stroke: new Color(255, 190, 80, 140) },
    { r: 20, fill: new Color(255, 210, 100, 70), stroke: new Color(255, 240, 180, 180) },
  ];
  for (const ring of mouthRings) {
    g.fillColor = ring.fill;
    g.circle(0, mouthY, ring.r);
    g.fill();
    g.strokeColor = ring.stroke;
    g.lineWidth = 2;
    g.circle(0, mouthY, ring.r);
    g.stroke();
  }

  // Rising heat column (glow, not fold polyline).
  const locals = furnaceSlotLocals();
  const heatTop = locals.result.y - CAMP_SLOT_SIZE / 2 - 6;
  const heatBottom = locals.inputs[1]!.y + CAMP_SLOT_SIZE / 2 + 6;
  g.strokeColor = new Color(255, 120, 40, 40);
  g.lineWidth = 18;
  g.moveTo(0, heatBottom);
  g.lineTo(0, heatTop);
  g.stroke();
  g.strokeColor = new Color(255, 160, 60, 70);
  g.lineWidth = 8;
  g.moveTo(0, heatBottom);
  g.lineTo(0, heatTop);
  g.stroke();
  g.strokeColor = new Color(255, 220, 140, 160);
  g.lineWidth = 2.4;
  g.moveTo(0, heatBottom);
  g.lineTo(0, heatTop);
  g.stroke();

  // Ember sparks (static).
  const sparks: Array<[number, number, number]> = [
    [-40, mouthY + 30, 2.2],
    [36, mouthY + 42, 1.8],
    [-18, mouthY + 58, 1.5],
    [22, mouthY + 70, 2],
    [0, mouthY + 88, 1.6],
  ];
  for (const [sx, sy, sr] of sparks) {
    g.fillColor = new Color(255, 200, 100, 160);
    g.circle(sx, sy, sr);
    g.fill();
  }

  // Opaque warm wells under each slot.
  const wellFill = new Color(42, 24, 12, 255);
  const wellBorder = new Color(210, 150, 70, 220);
  const wellGlow = new Color(255, 120, 40, 45);
  paintSlotWell(g, locals.result.x, locals.result.y, wellFill, wellBorder, wellGlow);
  for (const p of locals.inputs) {
    paintSlotWell(g, p.x, p.y, wellFill, wellBorder, wellGlow);
  }

  // Bronze frame.
  roundRect(g, 0, 0, width - 8, height - 8, radius - 2);
  g.strokeColor = new Color(210, 150, 70, 200);
  g.lineWidth = 2.4;
  g.stroke();
  roundRect(g, 0, 0, width, height, radius);
  g.strokeColor = new Color(120, 70, 30, 230);
  g.lineWidth = 2;
  g.stroke();
}

/** Cold starchart plate for minghen synth. Solid fluorescent rings only — no dashes. */
export function paintStarchartStage(
  g: Graphics,
  width: number,
  height: number,
  opts?: { ready?: boolean },
): void {
  const ready = !!opts?.ready;
  const radius = 18;
  roundRect(g, 0, 0, width, height, radius);
  g.fillColor = new Color(4, 10, 28, 250);
  g.fill();

  // Mysterious radial aura (layered halos).
  const auraCenterY = -6;
  const auraLayers = [
    { r: Math.min(width, height) * 0.46, c: new Color(40, 80, 160, ready ? 50 : 36) },
    { r: Math.min(width, height) * 0.34, c: new Color(60, 40, 140, ready ? 55 : 40) },
    { r: Math.min(width, height) * 0.22, c: new Color(30, 120, 180, ready ? 70 : 50) },
    { r: Math.min(width, height) * 0.12, c: new Color(120, 220, 255, ready ? 55 : 35) },
  ];
  for (const layer of auraLayers) {
    g.fillColor = layer.c;
    g.circle(0, auraCenterY, layer.r);
    g.fill();
  }

  const outerR = Math.min(width, height) * 0.4;
  const midR = Math.min(width, height) * 0.3;
  const innerR = Math.min(width, height) * 0.2;
  const cyanCore = ready ? new Color(200, 255, 255, 240) : new Color(140, 240, 255, 210);
  const cyanGlow = ready ? new Color(100, 220, 255, 110) : new Color(70, 180, 240, 80);
  const cyanOuter = ready ? new Color(80, 180, 255, 55) : new Color(50, 140, 220, 40);
  const violetCore = ready ? new Color(230, 210, 255, 230) : new Color(190, 170, 255, 200);
  const violetGlow = ready ? new Color(180, 140, 255, 100) : new Color(140, 110, 240, 70);
  const violetOuter = ready ? new Color(140, 100, 255, 50) : new Color(100, 70, 200, 35);

  glowCircle(g, outerR, cyanCore, cyanGlow, cyanOuter);
  glowCircle(g, midR, violetCore, violetGlow, violetOuter);
  glowCircle(g, innerR, cyanCore, cyanGlow);

  // Cardinal + diagonal ticks for ritual feel.
  const tickOuter = outerR + 6;
  const tickInner = outerR - 16;
  const dirs = [0, 45, 90, 135, 180, 225, 270, 315];
  for (const deg of dirs) {
    const rad = (deg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const short = deg % 90 === 0;
    const o = short ? tickOuter : tickOuter - 4;
    const i = short ? tickInner : tickInner + 4;
    glowSegment(g, c * o, s * o, c * i, s * i, cyanCore, cyanGlow);
  }

  // Soft constellation sparks on outer ring (anchored to ring — not orphan points).
  for (let i = 0; i < 8; i += 1) {
    const rad = ((i * 45 + 22) * Math.PI) / 180;
    const px = Math.cos(rad) * outerR;
    const py = Math.sin(rad) * outerR;
    g.fillColor = new Color(160, 230, 255, ready ? 160 : 110);
    g.circle(px, py, 3.2);
    g.fill();
    g.fillColor = new Color(255, 255, 255, ready ? 220 : 180);
    g.circle(px, py, 1.4);
    g.fill();
  }

  // Opaque mystic wells under slots.
  const locals = starchartSlotLocals();
  const wellFill = new Color(8, 22, 48, 255);
  const wellBorder = ready ? new Color(160, 240, 255, 230) : new Color(110, 200, 240, 200);
  const wellGlow = ready ? new Color(80, 180, 255, 55) : new Color(50, 120, 200, 40);
  paintSlotWell(g, locals.result.x, locals.result.y, wellFill, wellBorder, wellGlow);
  for (const p of locals.inputs) {
    paintSlotWell(g, p.x, p.y, wellFill, wellBorder, wellGlow);
  }

  roundRect(g, 0, 0, width - 8, height - 8, radius - 2);
  g.strokeColor = new Color(90, 170, 220, ready ? 180 : 130);
  g.lineWidth = 2.2;
  g.stroke();
  roundRect(g, 0, 0, width, height, radius);
  g.strokeColor = new Color(40, 70, 120, 220);
  g.lineWidth = 1.8;
  g.stroke();
}
