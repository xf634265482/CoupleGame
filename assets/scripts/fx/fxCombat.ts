// fx/fxCombat.ts —— 第三层：战斗效果。
// 全部由 L1/L2 + drive 组合。每个复合效果只负责「编排」，不含数值插值（design §7.4）。

import { Color, Label, Node, UIOpacity, Vec3 } from 'cc';
import type {
  FxOptions, FlyToOptions, JumpToOptions, KnockBackOptions, NumberOptions,
} from './FxTypes';
import { FX_DURATION, FX_MAGNITUDE, FX_EASE, FX_CONFIG } from './FxConfig';
import {
  drive, parallel, sequence, worldToLocal, getScreenRoot,
  acquireNumberNode, releaseNumberNode,
} from './fxRuntime';
import { shake, punch, flash, bounce, pop } from './fxEffects';
import { fade, scale } from './fxBasic';
import { magnitude, parabola, lerp, clampStrength } from './fxMath';
import type { FxHandle } from './FxTypes';

const RED = new Color(255, 80, 70, 255);
const GREEN = new Color(120, 230, 130, 255);
const GOLD = new Color(255, 214, 110, 255);
const WHITE = new Color(255, 255, 255, 255);

/** 把目标（节点世界坐标 / 局部点）解析为 node.parent 局部坐标。 */
function localTarget(node: Node, target: Node | Vec3): Vec3 {
  const out = new Vec3();
  if (target instanceof Node) {
    target.getWorldPosition(out);
    if (node.parent) worldToLocal(node.parent, out, out);
  } else {
    out.set(target);
  }
  return out;
}

/** 受击：白闪 ∥ 抖动 ∥ 缩放冲击。重击请额外叠 Effects.cameraShake()。 */
export function hit(node: Node, opts: FxOptions = {}): FxHandle {
  const dur = opts.duration ?? FX_DURATION.hit;
  const st = clampStrength(opts.strength);
  return parallel([
    flash(node, { color: WHITE, duration: Math.min(0.1, dur * 0.4) }),
    shake(node, { duration: dur, strength: st }),
    punch(node, { duration: dur, strength: st * 0.5, onComplete: opts.onComplete }),
  ]);
}

/** 抛物线飞向目标 + 缩小（奖励/碎片飞向 HUD）。 */
export function flyTo(node: Node, opts: FlyToOptions): FxHandle {
  const dest = localTarget(node, opts.target);
  const arc = opts.arcHeight ?? FX_MAGNITUDE.flyToArc;
  const scaleTo = opts.scaleTo ?? 0.6;
  const dur = opts.duration ?? FX_DURATION.flyTo;
  const p = node.position;
  const bx = p.x, by = p.y, bz = p.z;
  const s = node.scale;
  const sx = s.x, sy = s.y, sz = s.z;
  const moveH = drive(
    node, 'move',
    (t) => node.setPosition(lerp(bx, dest.x, t), lerp(by, dest.y, t) + parabola(t) * arc, bz),
    { duration: dur, easing: opts.easing ?? FX_EASE.flyTo, delay: opts.delay, interrupt: opts.interrupt },
  );
  const scaleH = drive(
    node, 'scale',
    (t) => { const f = lerp(1, scaleTo, t); node.setScale(sx * f, sy * f, sz); },
    { duration: dur, easing: opts.easing ?? FX_EASE.flyTo, delay: opts.delay, interrupt: opts.interrupt, onComplete: opts.onComplete },
  );
  return parallel([moveH, scaleH]);
}

/** 棋盘跳跃到目标局部点，落地内置一次弹跳。 */
export function jumpTo(node: Node, opts: JumpToOptions): FxHandle {
  const dest = opts.target;
  const arc = opts.arcHeight ?? FX_MAGNITUDE.jumpToArc;
  const dur = opts.duration ?? FX_DURATION.jumpTo;
  const p = node.position;
  const bx = p.x, by = p.y, bz = p.z;
  return sequence([
    () => drive(
      node, 'move',
      (t) => node.setPosition(lerp(bx, dest.x, t), lerp(by, dest.y, t) + parabola(t) * arc, dest.z ?? bz),
      { duration: dur, easing: opts.easing ?? FX_EASE.jumpTo, delay: opts.delay, interrupt: opts.interrupt },
    ),
    () => bounce(node, { duration: FX_DURATION.bounce * 0.6, strength: 0.5, onComplete: opts.onComplete }),
  ]);
}

/** 击退：沿「远离 from」方向退出再弹回。channel='move'。 */
export function knockBack(node: Node, opts: KnockBackOptions): FxHandle {
  const dist = (opts.distance ?? FX_MAGNITUDE.knockBack)
    * clampStrength(opts.strength) * FX_CONFIG.globalStrength;
  // 计算单位方向（远离 from），在 node.parent 局部坐标系下。
  const here = node.position;
  const src = localTarget(node, opts.from);
  let dx = here.x - src.x, dy = here.y - src.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const bx = here.x, by = here.y, bz = here.z;
  return drive(
    node, 'move',
    (t) => {
      const off = parabola(t) * dist;
      node.setPosition(bx + dx * off, by + dy * off, bz);
    },
    {
      duration: opts.duration ?? FX_DURATION.knockBack,
      easing: opts.easing ?? FX_EASE.knockBack,
      delay: opts.delay, interrupt: opts.interrupt, settleOnStop: true,
      onComplete: opts.onComplete,
    },
  );
}

/** 内部：飘字（伤害/治疗共用）。 */
function spawnNumber(host: Node, text: string, color: Color, opts: NumberOptions): FxHandle {
  const root = getScreenRoot();
  const node = acquireNumberNode();
  if (!root || !node) {
    // 未注册 screenRoot：静默降级为 no-op（仍返回可 await 句柄）。
    const p = Promise.resolve();
    return Object.assign(p, { stop() {}, finished: true, target: {} }) as unknown as FxHandle;
  }
  // 定位：宿主世界坐标 → screenRoot 局部坐标（__fxNumbers 层位于 screenRoot 原点，局部一致）。
  const world = new Vec3();
  if (opts.worldPos) world.set(opts.worldPos);
  else host.getWorldPosition(world);
  worldToLocal(root, world, world);
  node.setPosition(world.x, world.y, 0);

  const label = node.getComponent(Label);
  if (label) {
    label.string = text;
    label.color = opts.color ?? color;
    label.fontSize = opts.crit ? 80 : 56;
    label.enableOutline = true;
    label.outlineColor = new Color(0, 0, 0, 210);
    label.outlineWidth = 3;
  }
  const op = node.getComponent(UIOpacity);
  if (op) op.opacity = 255;
  node.setScale(opts.crit ? 1.4 : 1, opts.crit ? 1.4 : 1, 1);

  const dist = FX_MAGNITUDE.numberRise * (opts.crit ? 1.3 : 1);
  const dur = opts.duration ?? FX_DURATION.number;
  const bx = node.position.x, by = node.position.y;
  const moveH = drive(
    node, 'move',
    (t) => node.setPosition(bx, by + dist * t, 0),
    { duration: dur, easing: FX_EASE.number, interrupt: false },
  );
  const fadeH = drive(
    node, 'opacity',
    (t) => { if (op) op.opacity = lerp(255, 0, t); },
    {
      duration: dur, easing: 'quadOut', interrupt: false,
      onComplete: () => { releaseNumberNode(node); opts.onComplete?.(); },
    },
  );
  return parallel([moveH, fadeH]);
}

/** 伤害数字（默认红，crit 金色放大）。 */
export function damageNumber(host: Node, value: number | string, opts: NumberOptions = {}): FxHandle {
  return spawnNumber(host, `-${value}`, opts.crit ? GOLD : RED, opts);
}

/** 治疗数字（绿色）。 */
export function healNumber(host: Node, value: number | string, opts: NumberOptions = {}): FxHandle {
  return spawnNumber(host, `+${value}`, GREEN, opts);
}

/** Buff 获得：弹出（scale/opacity 通道）+ 金色闪（color 通道）。 */
export function buffGain(icon: Node, opts: FxOptions = {}): FxHandle {
  return parallel([
    pop(icon, { duration: FX_DURATION.buffGain, strength: opts.strength, onComplete: opts.onComplete }),
    flash(icon, { color: GOLD, duration: FX_DURATION.buffGain }),
  ]);
}

/** Buff 失去：红闪 + 缩小淡出。 */
export function buffLose(icon: Node, opts: FxOptions = {}): FxHandle {
  const dur = opts.duration ?? FX_DURATION.buffLose;
  return parallel([
    flash(icon, { color: RED, duration: dur * 0.5 }),
    scale(icon, 0, { duration: dur, easing: 'quadOut' }),
    fade(icon, 0, { duration: dur, easing: 'quadOut', onComplete: opts.onComplete }),
  ]);
}
