// fx/fxCamera.ts —— 第四层：镜头效果（cameraShake / cameraPunch / cameraZoom）。
// 「镜头」= setScreenRoot 注册的根节点的变换。无 root 或全局降级时静默返回 no-op 句柄。

import type { ZoomOptions, FxOptions } from './FxTypes';
import { FX_DURATION, FX_MAGNITUDE, FX_EASE, FX_CONFIG } from './FxConfig';
import { drive, sequence, getScreenRoot } from './fxRuntime';
import { magnitude, dampedSine, lerp, clampStrength, resolveDuration } from './fxMath';
import type { FxHandle } from './FxTypes';

function noop(): FxHandle {
  const p = Promise.resolve() as FxHandle;
  Object.defineProperty(p, 'stop', { value: () => {}, enumerable: false });
  Object.defineProperty(p, 'finished', { value: true, enumerable: false });
  Object.defineProperty(p, 'target', { value: {}, enumerable: false });
  return p;
}

/** 整屏抖动（screenShake 别名）。 */
export function cameraShake(opts: FxOptions = {}): FxHandle {
  const root = getScreenRoot();
  if (!root || FX_CONFIG.disableCameraShake) return noop();
  const amp = magnitude(FX_MAGNITUDE.cameraShake, clampStrength(opts.strength), FX_CONFIG.globalStrength);
  const p = root.position;
  const bx = p.x, by = p.y, bz = p.z;
  return drive(
    root, 'move',
    (t) => root.setPosition(
      bx + dampedSine(t, FX_MAGNITUDE.shakeFreq) * amp,
      by + dampedSine(t, FX_MAGNITUDE.shakeFreq * 0.8 + 0.5) * amp * 0.7,
      bz,
    ),
    {
      duration: resolveDuration(opts.duration, FX_DURATION.cameraShake),
      easing: opts.easing ?? FX_EASE.shake,
      delay: opts.delay, interrupt: opts.interrupt, settleOnStop: true,
      onComplete: opts.onComplete,
    },
  );
}

/** 镜头顿冲：整屏 scale 微过冲回弹（重击命中感）。 */
export function cameraPunch(opts: FxOptions = {}): FxHandle {
  const root = getScreenRoot();
  if (!root || FX_CONFIG.disableCameraShake) return noop();
  const amp = magnitude(FX_MAGNITUDE.cameraPunch, clampStrength(opts.strength), FX_CONFIG.globalStrength);
  const s = root.scale;
  const bx = s.x, by = s.y, bz = s.z;
  return drive(
    root, 'scale',
    (t) => { const f = lerp(1 + amp, 1, t); root.setScale(bx * f, by * f, bz); },
    {
      duration: resolveDuration(opts.duration, FX_DURATION.cameraPunch),
      easing: opts.easing ?? FX_EASE.punch,
      delay: opts.delay, interrupt: opts.interrupt, settleOnStop: true,
      onComplete: opts.onComplete,
    },
  );
}

/** 镜头缩放到 to；autoReturn=true 时到达后回弹到原始缩放。 */
export function cameraZoom(opts: ZoomOptions): FxHandle {
  const root = getScreenRoot();
  if (!root) return noop();
  const s = root.scale;
  const bx = s.x, by = s.y, bz = s.z;
  const dur = resolveDuration(opts.duration, FX_DURATION.cameraZoom);
  const easing = opts.easing ?? FX_EASE.cameraZoom;
  const zoomTo = (toScale: number, onDone?: () => void): FxHandle => {
    const from = root.scale.x;
    return drive(
      root, 'scale',
      (t) => { const v = lerp(from, toScale, t); root.setScale(v, v, bz); },
      { duration: dur, easing, interrupt: opts.interrupt, onComplete: onDone },
    );
  };
  void bx; void by;
  if (!opts.autoReturn) return zoomTo(opts.to, opts.onComplete);
  return sequence([
    () => zoomTo(opts.to),
    () => zoomTo(s.x, opts.onComplete),
  ]);
}

/** 兼容别名：等价 cameraShake。 */
export const screenShake = cameraShake;
