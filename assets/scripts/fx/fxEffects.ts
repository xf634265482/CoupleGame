// fx/fxEffects.ts —— 第二层：基础效果（shake / punch / bounce / pop / float / flash）。
// 全部由 drive（运行时通用驱动）+ fxMath 包络组合而成，不写一行 tween()。
// 通道分配让同节点多效果可并行：shake→move、punch→scale、flash→color 互不打断。

import { Color, Node, Sprite } from 'cc';
import type { FxOptions, FlashOptions, FloatOptions } from './FxTypes';
import { FX_DURATION, FX_MAGNITUDE, FX_EASE, FX_CONFIG } from './FxConfig';
import { drive, parallel, ensureUIOpacity, tmpColor } from './fxRuntime';
import {
  magnitude, parabola, dampedSine, lerp, clampStrength, resolveDuration,
} from './fxMath';
import type { FxHandle } from './FxTypes';

const WHITE = new Color(255, 255, 255, 255);

function strengthOf(opts: FxOptions): number {
  return clampStrength(opts.strength) * FX_CONFIG.globalStrength;
}

/** 抖动：阻尼正弦位移，t=1 干净落回基准。channel='move'。 */
export function shake(node: Node, opts: FxOptions = {}): FxHandle {
  const amp = magnitude(FX_MAGNITUDE.shake, clampStrength(opts.strength), FX_CONFIG.globalStrength);
  const freq = FX_MAGNITUDE.shakeFreq;
  const p = node.position;
  const bx = p.x, by = p.y, bz = p.z;
  return drive(
    node, 'move',
    (t) => node.setPosition(
      bx + dampedSine(t, freq) * amp,
      by + dampedSine(t, freq * 0.85 + 0.3) * amp * 0.6,
      bz,
    ),
    {
      duration: resolveDuration(opts.duration, FX_DURATION.shake),
      easing: opts.easing ?? FX_EASE.shake,
      delay: opts.delay, interrupt: opts.interrupt, settleOnStop: true,
      onComplete: opts.onComplete,
    },
  );
}

/** 缩放冲击：从 base×(1+amp) 回弹到 base。channel='scale'。 */
export function punch(node: Node, opts: FxOptions = {}): FxHandle {
  const amp = magnitude(FX_MAGNITUDE.punch, clampStrength(opts.strength), FX_CONFIG.globalStrength);
  const s = node.scale;
  const bx = s.x, by = s.y, bz = s.z;
  return drive(
    node, 'scale',
    (t) => {
      const f = lerp(1 + amp, 1, t);
      node.setScale(bx * f, by * f, bz);
    },
    {
      duration: resolveDuration(opts.duration, FX_DURATION.punch),
      easing: opts.easing ?? FX_EASE.punch,
      delay: opts.delay, interrupt: opts.interrupt, settleOnStop: true,
      onComplete: opts.onComplete,
    },
  );
}

/** 弹跳：抛物线上跳一次再落回基准。channel='move'。 */
export function bounce(node: Node, opts: FxOptions = {}): FxHandle {
  const rise = magnitude(FX_MAGNITUDE.bounceRise, clampStrength(opts.strength), FX_CONFIG.globalStrength);
  const p = node.position;
  const bx = p.x, by = p.y, bz = p.z;
  return drive(
    node, 'move',
    (t) => node.setPosition(bx, by + parabola(t) * rise, bz),
    {
      duration: resolveDuration(opts.duration, FX_DURATION.bounce),
      easing: opts.easing ?? FX_EASE.bounceUp,
      delay: opts.delay, interrupt: opts.interrupt, settleOnStop: true,
      onComplete: opts.onComplete,
    },
  );
}

/** 出现：缩放 0→1（backOut 过冲）+ 淡入。channel='scale'∥'opacity'。 */
export function pop(node: Node, opts: FxOptions = {}): FxHandle {
  const s = node.scale;
  const bx = s.x, by = s.y, bz = s.z;
  const comp = ensureUIOpacity(node);
  const baseOpacity = comp.opacity > 0 ? comp.opacity : 255;
  const dur = resolveDuration(opts.duration, FX_DURATION.pop);
  const scaleH = drive(
    node, 'scale',
    (t) => node.setScale(bx * t, by * t, bz),
    {
      duration: dur, easing: opts.easing ?? FX_EASE.pop,
      delay: opts.delay, interrupt: opts.interrupt, settleOnStop: true,
    },
  );
  const fadeH = drive(
    node, 'opacity',
    (t) => { comp.opacity = lerp(0, baseOpacity, t); },
    {
      duration: dur, easing: 'quadOut',
      delay: opts.delay, interrupt: opts.interrupt, settleOnStop: true,
      onComplete: opts.onComplete,
    },
  );
  return parallel([scaleH, fadeH]);
}

/** 上飘 + 淡出（拾取/数字基础动作）。channel='move'∥'opacity'。 */
export function float(node: Node, opts: FloatOptions = {}): FxHandle {
  const dist = opts.distance ?? magnitude(FX_MAGNITUDE.float, clampStrength(opts.strength), FX_CONFIG.globalStrength);
  const fadeOut = opts.fadeOut !== false;
  const p = node.position;
  const bx = p.x, by = p.y, bz = p.z;
  const dur = resolveDuration(opts.duration, FX_DURATION.float);
  const moveH = drive(
    node, 'move',
    (t) => node.setPosition(bx, by + dist * t, bz),
    {
      duration: dur, easing: opts.easing ?? FX_EASE.float,
      delay: opts.delay, interrupt: opts.interrupt,
      onComplete: fadeOut ? undefined : opts.onComplete,
    },
  );
  if (!fadeOut) return moveH;
  const comp = ensureUIOpacity(node);
  const base = comp.opacity;
  const fadeH = drive(
    node, 'opacity',
    (t) => { comp.opacity = lerp(base, 0, t); },
    {
      duration: dur, easing: 'quadOut',
      delay: opts.delay, interrupt: opts.interrupt,
      onComplete: opts.onComplete,
    },
  );
  return parallel([moveH, fadeH]);
}

/** 闪光：Sprite 染色一闪回原色；无 Sprite 时降级为透明度闪。channel='color'/'opacity'。 */
export function flash(node: Node, opts: FlashOptions = {}): FxHandle {
  const times = Math.max(1, opts.times ?? 1);
  const dur = resolveDuration(opts.duration, FX_DURATION.flash) * times;
  const sprite = node.getComponent(Sprite);
  if (sprite) {
    const target = opts.color ?? WHITE;
    const base = sprite.color.clone();
    const tr = target.r, tg = target.g, tb = target.b;
    return drive(
      node, 'color',
      (t) => {
        const env = Math.abs(Math.sin(t * times * Math.PI));
        const c = tmpColor();
        c.set(
          lerp(base.r, tr, env),
          lerp(base.g, tg, env),
          lerp(base.b, tb, env),
          base.a,
        );
        sprite.color = c;
      },
      {
        duration: dur, easing: opts.easing ?? FX_EASE.flash,
        delay: opts.delay, interrupt: opts.interrupt, settleOnStop: true,
        onComplete: opts.onComplete,
      },
    );
  }
  // 降级：透明度闪（变暗再回满）。
  const comp = ensureUIOpacity(node);
  const base = comp.opacity;
  return drive(
    node, 'opacity',
    (t) => {
      const env = Math.abs(Math.sin(t * times * Math.PI));
      comp.opacity = lerp(base, base * 0.35, env);
    },
    {
      duration: dur, easing: opts.easing ?? FX_EASE.flash,
      delay: opts.delay, interrupt: opts.interrupt, settleOnStop: true,
      onComplete: opts.onComplete,
    },
  );
}

// 给上层复用的力度工具（L3 组合时按统一口径取力度）。
export { strengthOf };
