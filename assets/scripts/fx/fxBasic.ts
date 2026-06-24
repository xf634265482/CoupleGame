// fx/fxBasic.ts —— 第一层：基础能力（move / scale / rotate / fade / delay）。
// 这是所有上层效果唯一的属性级积木。每个能力 = 快照宿主基准 → 走 drive 把 t 缓动 → apply 写回。
// 全程不分配 Vec3：只读基准的 x/y/z 数值，apply 用 lerp 计算后 setXxx。

import type { Node } from 'cc';
import type { FxOptions } from './FxTypes';
import { FX_DURATION, FX_EASE } from './FxConfig';
import { drive, delay as runtimeDelay, ensureUIOpacity } from './fxRuntime';
import { lerp, resolveDuration } from './fxMath';
import type { FxHandle } from './FxTypes';
import { Vec3 } from 'cc';

/** 移动到局部坐标 to（绝对值）。channel='move'。 */
export function move(node: Node, to: Vec3, opts: FxOptions = {}): FxHandle {
  const p = node.position;
  const bx = p.x, by = p.y, bz = p.z;
  const tx = to.x, ty = to.y, tz = to.z;
  return drive(
    node,
    'move',
    (t) => node.setPosition(lerp(bx, tx, t), lerp(by, ty, t), lerp(bz, tz, t)),
    {
      duration: resolveDuration(opts.duration, FX_DURATION.move),
      easing: opts.easing ?? FX_EASE.move,
      delay: opts.delay,
      interrupt: opts.interrupt,
      onComplete: opts.onComplete,
    },
  );
}

/** 缩放到 to（数字=等比，或 Vec3）。channel='scale'。 */
export function scale(node: Node, to: number | Vec3, opts: FxOptions = {}): FxHandle {
  const s = node.scale;
  const bx = s.x, by = s.y, bz = s.z;
  const tx = typeof to === 'number' ? to : to.x;
  const ty = typeof to === 'number' ? to : to.y;
  const tz = typeof to === 'number' ? to : to.z;
  return drive(
    node,
    'scale',
    (t) => node.setScale(lerp(bx, tx, t), lerp(by, ty, t), lerp(bz, tz, t)),
    {
      duration: resolveDuration(opts.duration, FX_DURATION.scale),
      easing: opts.easing ?? FX_EASE.scale,
      delay: opts.delay,
      interrupt: opts.interrupt,
      onComplete: opts.onComplete,
    },
  );
}

/** 旋转到角度 toAngle（度）。channel='rotate'。 */
export function rotate(node: Node, toAngle: number, opts: FxOptions = {}): FxHandle {
  const base = node.angle;
  return drive(
    node,
    'rotate',
    (t) => { node.angle = lerp(base, toAngle, t); },
    {
      duration: resolveDuration(opts.duration, FX_DURATION.rotate),
      easing: opts.easing ?? FX_EASE.rotate,
      delay: opts.delay,
      interrupt: opts.interrupt,
      onComplete: opts.onComplete,
    },
  );
}

/** 淡入/淡出到 toOpacity（0~255）。channel='opacity'，自动确保 UIOpacity。 */
export function fade(node: Node, toOpacity: number, opts: FxOptions = {}): FxHandle {
  const comp = ensureUIOpacity(node);
  const base = comp.opacity;
  return drive(
    node,
    'opacity',
    (t) => { comp.opacity = lerp(base, toOpacity, t); },
    {
      duration: resolveDuration(opts.duration, FX_DURATION.fade),
      easing: opts.easing ?? FX_EASE.fade,
      delay: opts.delay,
      interrupt: opts.interrupt,
      onComplete: opts.onComplete,
    },
  );
}

/** 纯延时（可 await、可 stop）。 */
export function delay(seconds: number): FxHandle {
  return runtimeDelay(seconds);
}
