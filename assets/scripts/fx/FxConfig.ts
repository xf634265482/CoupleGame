// fx/FxConfig.ts —— 默认值表 + 缓动白名单 + 全局降级开关。
// 一切数值收口于此：改一处，全框架生效（design §6）。
import type { Easing } from './FxTypes';

/** 每个效果的默认时长（秒）。 */
export const FX_DURATION = {
  move: 0.25,
  scale: 0.20,
  rotate: 0.30,
  fade: 0.20,
  shake: 0.30,
  punch: 0.30,
  bounce: 0.50,
  pop: 0.35,
  float: 0.80,
  flash: 0.30,
  hit: 0.25,
  flyTo: 0.40,
  jumpTo: 0.30,
  knockBack: 0.25,
  number: 0.80,
  buffGain: 0.40,
  buffLose: 0.30,
  cameraShake: 0.40,
  cameraPunch: 0.25,
  cameraZoom: 0.30,
  hitStop: 0.06,
  slowMotion: 0.80,
} as const;

/** 每个效果在 strength=1 时的基准幅度。最终幅度 = base × strength × globalStrength。 */
export const FX_MAGNITUDE = {
  /** shake/cameraShake：最大位移（px）。 */
  shake: 8,
  cameraShake: 22,
  /** punch：缩放过冲量（+0.20 → 1.20 倍）。 */
  punch: 0.20,
  cameraPunch: 0.06,
  /** bounce：上跳高度（px）。 */
  bounceRise: 20,
  /** pop：起始放大量（0→1.15→1）。 */
  popOvershoot: 0.15,
  /** float：上飘距离（px）。 */
  float: 40,
  /** knockBack：击退距离（px）。 */
  knockBack: 24,
  /** flyTo / jumpTo：抛物线拱高（px）。 */
  flyToArc: 60,
  jumpToArc: 30,
  /** damageNumber/healNumber：上飘距离（px）。 */
  numberRise: 90,
  /** shake 的抖动周期数。 */
  shakeFreq: 8,
} as const;

/** 默认缓动。 */
export const FX_EASE: Record<string, Easing> = {
  move: 'quadOut',
  scale: 'backOut',
  rotate: 'quadOut',
  fade: 'quadOut',
  shake: 'linear',
  punch: 'backOut',
  bounceUp: 'quadOut',
  bounceDown: 'bounceOut',
  pop: 'backOut',
  float: 'sineOut',
  flash: 'quadOut',
  flyTo: 'quadInOut',
  jumpTo: 'quadInOut',
  knockOut: 'quadOut',
  knockBack: 'backOut',
  number: 'sineOut',
  cameraZoom: 'quadInOut',
};

/** 缓动白名单（运行时校验 / 文档）。 */
export const FX_EASING: readonly Easing[] = [
  'linear', 'quadOut', 'quadInOut', 'cubicOut',
  'backOut', 'elasticOut', 'sineOut', 'bounceOut',
] as const;

/** 全局可调配置（运行时可改，用于无障碍 / 性能降级 / 总力度调参）。 */
export const FX_CONFIG = {
  /** 总力度系数，对所有效果生效。 */
  globalStrength: 1,
  /** 关闭镜头抖动（无障碍 / 性能降级）：开启后 cameraShake/cameraPunch 变空操作。 */
  disableCameraShake: false,
  /** 数字节点池上限（超出不回收，直接 destroy）。 */
  numberPoolMax: 32,
};
