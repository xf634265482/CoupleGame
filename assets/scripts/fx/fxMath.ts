// fx/fxMath.ts —— 程序动画框架的纯计算层。
// 零 cc 依赖、零副作用、确定性，是整套框架里唯一可被 ts-jest 直接覆盖的部分。
// 上层（fxRuntime / fxBasic …）只把这里的函数当积木用，不在别处重写同样的数学。

/** 力度映射：最终幅度 = 基准幅度 × 力度系数 × 全局力度系数。全框架口径一致。 */
export function magnitude(base: number, strength: number, globalStrength: number): number {
  return base * strength * globalStrength;
}

/** 慢动作时长换算：timeScale<1 → 动画变慢（时长变长）。timeScale<=0 视为 1。 */
export function scaledDuration(duration: number, timeScale: number): number {
  return timeScale > 0 ? duration / timeScale : duration;
}

/** 线性插值。 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 0→1→0 的抛物线包络，t∈[0,1]，峰值在 t=0.5 处为 1。用于 float/jumpTo 的拱高。 */
export function parabola(t: number): number {
  return 4 * t * (1 - t);
}

/** 阻尼正弦抖动包络：振幅随 t 线性衰减到 0，t=1 时恰好归零。freq = 周期数。 */
export function dampedSine(t: number, freq: number): number {
  return Math.sin(t * freq * Math.PI * 2) * (1 - t);
}

/** 规整力度系数：缺省 / 非有限 / 负数一律回落到 1。 */
export function clampStrength(s: number | undefined): number {
  if (s === undefined || !Number.isFinite(s) || s < 0) return 1;
  return s;
}

/** 取有效正时长：缺省 / 非有限 / 非正一律回落到 fallback。 */
export function resolveDuration(d: number | undefined, fallback: number): number {
  if (d === undefined || !Number.isFinite(d) || d <= 0) return fallback;
  return d;
}
