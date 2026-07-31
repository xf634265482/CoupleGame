import { Color, Graphics } from 'cc';
import { furnaceSlotLocals } from './CampSynthStageLayout';

function roundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number): void {
  const left = x - w / 2;
  const bottom = y - h / 2;
  g.roundRect(left, bottom, w, h, r);
}

function glowCircle(g: Graphics, r: number, core: Color, glow: Color): void {
  g.strokeColor = glow;
  g.lineWidth = 5;
  g.circle(0, 0, r);
  g.stroke();
  g.strokeColor = core;
  g.lineWidth = 1.6;
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
  g.lineWidth = 5;
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  g.strokeColor = core;
  g.lineWidth = 1.6;
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

/** Warm furnace plate for equipment synth. Local origin = stage center. */
export function paintFurnaceStage(g: Graphics, width: number, height: number): void {
  const radius = 18;
  roundRect(g, 0, 0, width, height, radius);
  g.fillColor = new Color(14, 18, 32, 245);
  g.fill();

  // Warm night wash near bottom (layered circles — avoids ellipse API variance).
  g.fillColor = new Color(72, 36, 18, 70);
  g.circle(0, -height * 0.18, Math.min(width, height) * 0.28);
  g.fill();
  g.fillColor = new Color(120, 52, 20, 45);
  g.circle(0, -height * 0.28, Math.min(width, height) * 0.16);
  g.fill();

  // Furnace mouth.
  const mouthY = -height / 2 + 36;
  const mouthR = width * 0.12;
  g.fillColor = new Color(255, 120, 40, 40);
  g.circle(0, mouthY, mouthR);
  g.fill();
  g.strokeColor = new Color(255, 160, 70, 120);
  g.lineWidth = 2;
  g.circle(0, mouthY, mouthR);
  g.stroke();

  // Short heat bar under result slot.
  const locals = furnaceSlotLocals();
  const heatTop = locals.result.y - 52;
  const heatBottom = locals.inputs[1]!.y + 52;
  g.strokeColor = new Color(255, 140, 60, 55);
  g.lineWidth = 8;
  g.moveTo(0, heatBottom);
  g.lineTo(0, heatTop);
  g.stroke();
  g.strokeColor = new Color(255, 210, 120, 140);
  g.lineWidth = 2.2;
  g.moveTo(0, heatBottom);
  g.lineTo(0, heatTop);
  g.stroke();

  // Inset bronze border.
  roundRect(g, 0, 0, width - 8, height - 8, radius - 2);
  g.strokeColor = new Color(180, 130, 70, 160);
  g.lineWidth = 2;
  g.stroke();
  roundRect(g, 0, 0, width, height, radius);
  g.strokeColor = new Color(90, 70, 40, 200);
  g.lineWidth = 1.5;
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
  g.fillColor = new Color(8, 18, 36, 245);
  g.fill();

  g.fillColor = new Color(30, 90, 140, ready ? 55 : 40);
  g.circle(0, -8, Math.min(width, height) * 0.28);
  g.fill();
  g.fillColor = new Color(60, 40, 120, ready ? 40 : 28);
  g.circle(0, -8, Math.min(width, height) * 0.16);
  g.fill();

  const outerR = Math.min(width, height) * 0.38;
  const innerR = Math.min(width, height) * 0.24;
  const cyanCore = ready ? new Color(180, 250, 255, 230) : new Color(126, 230, 255, 190);
  const cyanGlow = ready ? new Color(126, 230, 255, 90) : new Color(90, 200, 240, 60);
  const violetCore = ready ? new Color(220, 200, 255, 220) : new Color(180, 160, 255, 180);
  const violetGlow = ready ? new Color(180, 160, 255, 85) : new Color(140, 120, 230, 55);

  glowCircle(g, outerR, cyanCore, cyanGlow);
  glowCircle(g, innerR, violetCore, violetGlow);

  const tickOuter = outerR + 4;
  const tickInner = outerR - 14;
  const ticks: Array<[number, number, number, number]> = [
    [0, tickOuter, 0, tickInner],
    [0, -tickOuter, 0, -tickInner],
    [tickOuter, 0, tickInner, 0],
    [-tickOuter, 0, -tickInner, 0],
  ];
  for (const [x1, y1, x2, y2] of ticks) {
    glowSegment(g, x1, y1, x2, y2, cyanCore, cyanGlow);
  }

  roundRect(g, 0, 0, width - 8, height - 8, radius - 2);
  g.strokeColor = new Color(80, 140, 190, ready ? 150 : 110);
  g.lineWidth = 2;
  g.stroke();
  roundRect(g, 0, 0, width, height, radius);
  g.strokeColor = new Color(40, 70, 110, 200);
  g.lineWidth = 1.5;
  g.stroke();
}
