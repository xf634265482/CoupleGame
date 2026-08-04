// fx/FxTypes.ts —— 程序动画框架的公共类型（纯类型，无运行时代码）。
import type { Node, Vec3, Color } from 'cc';

/** 允许的缓动名白名单（FX_EASING 的键）。统一收口，禁止业务层乱传字符串。 */
export type Easing =
  | 'linear'
  | 'quadOut'
  | 'quadInOut'
  | 'cubicOut'
  | 'backOut'
  | 'elasticOut'
  | 'sineOut'
  | 'bounceOut';

/** 所有效果共享的基础参数。各效果再各自扩展。 */
export interface FxOptions {
  /** 持续时间（秒）。缺省取该效果默认。 */
  duration?: number;
  /** 力度系数，1 = 默认强度。内部映射为 px / scale / angle。 */
  strength?: number;
  /** 缓动名。缺省取该效果默认。 */
  easing?: Easing;
  /** 启动前延迟（秒），默认 0。 */
  delay?: number;
  /** 完成回调（自然结束或 stop(true) 时触发）。 */
  onComplete?: () => void;
  /** 默认 true：启动前停掉同节点同通道的旧动画并还原基准，防叠加泄漏。 */
  interrupt?: boolean;
}

/**
 * 动画句柄：既是可 await 的 Promise（永不 reject），又带中断能力。
 * 由 fxRuntime.makeHandle 在原生 Promise 上附加 stop/finished/target 得到。
 */
export interface FxHandle extends Promise<void> {
  /** 中断。finish=true 跳到终态再停；false（默认）停在当前态。两者都会 resolve 并触发 onComplete。 */
  stop(finish?: boolean): void;
  /** 是否已结束。 */
  readonly finished: boolean;
  /** 内部 tween 真正作用的代理目标（中断通道标识，调试用）。 */
  readonly target: object;
}

// ── 各效果的专属参数扩展 ───────────────────────────────

export interface FlashOptions extends FxOptions {
  /** 闪烁目标色，默认白色。 */
  color?: Color;
  /** 闪烁次数，默认 1。 */
  times?: number;
}

export interface FloatOptions extends FxOptions {
  /** 上飘距离（px），默认取 FX_DEFAULTS.float。 */
  distance?: number;
  /** 是否同时淡出，默认 true。 */
  fadeOut?: boolean;
}

export interface FlyToOptions extends FxOptions {
  /** 目标：节点（取世界坐标）或局部坐标点。 */
  target: Node | Vec3;
  /** 抛物线拱高（px）。 */
  arcHeight?: number;
  /** 飞行终点缩放，默认 0.6。 */
  scaleTo?: number;
}

export interface JumpToOptions extends FxOptions {
  /** 目标局部坐标点。 */
  target: Vec3;
  /** 跳跃拱高（px）。 */
  arcHeight?: number;
}

export interface KnockBackOptions extends FxOptions {
  /** 冲击来源：节点或坐标点，用于计算击退方向（远离来源）。 */
  from: Node | Vec3;
  /** 击退距离（px）。 */
  distance?: number;
}

export interface NumberOptions extends FxOptions {
  /** 是否暴击/重击：放大并换强调色。 */
  crit?: boolean;
  /** 文字颜色，缺省由 damageNumber/healNumber 各自定。 */
  color?: Color;
  /** 起始世界坐标，缺省取宿主节点世界坐标。 */
  worldPos?: Vec3;
}

export interface ZoomOptions extends FxOptions {
  /** 目标缩放值（screenRoot.scale）。 */
  to: number;
  /** 是否在到达后自动回弹到 1，默认 false。 */
  autoReturn?: boolean;
}
