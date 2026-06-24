// fx/fxRuntime.ts —— 程序动画框架运行时内核。
//
// 核心抽象 drive()：以一个 { t: 0→1 } 代理对象为 tween 目标，onUpdate 时把「已缓动的 t」
// 交给 apply 回调写回宿主节点属性。好处：
//   1) 每个效果有独立代理 → 按 (节点, 通道) 精确中断，position 与 scale 可真正并行；
//   2) 直接动宿主节点 → 内容（Sprite/Label）真实变化（不像空子节点动不了宿主）；
//   3) base 快照由各效果在 apply 闭包里持有，drive 本身与具体属性无关，纯通用。
//
// 务实零 GC：底层用 cc tween()；复用模块级 Vec3/Color 临时量；每次「启动」仅一次代理/闭包分配。

import { Color, Label, Node, UIOpacity, UITransform, tween, Tween, Vec3 } from 'cc';
import { FX_CONFIG } from './FxConfig';
import type { FxHandle } from './FxTypes';
import { scaledDuration } from './fxMath';

// ── 复用临时量（避免每帧分配）──────────────────────────
const _tmpColor = new Color();
const _tmpV3 = new Vec3();

/** 把世界坐标换算到某父节点的局部坐标，复用 _tmpV3（用完即取，勿跨调用持有）。 */
export function worldToLocal(parent: Node, world: Vec3, out: Vec3): Vec3 {
  const ut = parent.getComponent(UITransform);
  if (ut) return ut.convertToNodeSpaceAR(world, out);
  out.set(world);
  return out;
}

export function tmpColor(): Color { return _tmpColor; }
export function tmpVec3(): Vec3 { return _tmpV3; }

// ── 全局时间缩放（slowMotion 用）────────────────────────
let _timeScale = 1;
export function getTimeScale(): number { return _timeScale; }
export function setTimeScale(v: number): void { _timeScale = v > 0 ? v : 1; }

// ── screenRoot / 镜头根注册 ─────────────────────────────
let _screenRoot: Node | null = null;
export function setScreenRoot(node: Node | null): void { _screenRoot = node; }
export function getScreenRoot(): Node | null { return _screenRoot; }

// ── (节点, 通道) 活跃登记表 + 全局活跃 tween 集合 ──────────
interface Entry {
  tw: Tween<object>;
  settle: () => void;   // 落到终态 apply(1)
  finish: () => void;   // 清理 + resolve + onComplete
}
const _registry = new WeakMap<object, Map<string, Entry>>();
const _hosts = new Set<object>();                 // WeakMap 不可迭代，辅助集合支持 stopAll
const _liveTweens = new Set<Tween<object>>();     // hitStop 暂停/恢复用

function channelMap(host: object): Map<string, Entry> {
  let m = _registry.get(host);
  if (!m) { m = new Map(); _registry.set(host, m); _hosts.add(host); }
  return m;
}

function clearEntry(host: object, channel: string, entry: Entry): void {
  const m = _registry.get(host);
  if (m && m.get(channel) === entry) {
    m.delete(channel);
    if (m.size === 0) { _registry.delete(host); _hosts.delete(host); }
  }
  _liveTweens.delete(entry.tw);
}

/** 驱动器选项。 */
export interface DriveOptions {
  duration: number;            // 已是「该效果默认值或调用方覆盖值」，drive 内再按 timeScale 换算
  easing?: string;
  delay?: number;
  interrupt?: boolean;         // 默认 true
  settleOnStop?: boolean;      // 显式 stop(无 finish) 时是否落到终态；瞬态效果传 true
  onComplete?: () => void;
}

/**
 * 通用驱动：在 host 的 channel 通道上，用时长 duration 把 t 从 0 缓动到 1，
 * 每帧调用 apply(已缓动 t)。返回可 await + 可中断的 FxHandle。
 */
export function drive(
  host: object,
  channel: string,
  apply: (t: number) => void,
  opts: DriveOptions,
): FxHandle {
  const interrupt = opts.interrupt !== false;
  if (interrupt) {
    const prev = _registry.get(host)?.get(channel);
    if (prev) { prev.settle(); prev.finish(); }   // 先把旧效果落到终态再清理，保证新效果基准干净
  }

  const proxy = { t: 0 };
  const dur = scaledDuration(opts.duration, _timeScale);
  let done = false;
  let resolveFn: () => void = () => {};

  const settle = (): void => { apply(1); };
  const finish = (): void => {
    if (done) return;
    done = true;
    clearEntry(host, channel, entry);
    opts.onComplete?.();
    resolveFn();
  };

  const tw = tween(proxy)
    .delay(opts.delay ?? 0)
    .to(dur, { t: 1 }, {
      easing: (opts.easing ?? 'linear') as never,
      onUpdate: () => apply(proxy.t),
    })
    .call(() => { apply(1); finish(); }) as unknown as Tween<object>;

  const entry: Entry = { tw, settle, finish };
  channelMap(host).set(channel, entry);
  _liveTweens.add(tw);
  tw.start();

  const promise = new Promise<void>((res) => { resolveFn = res; });
  return makeHandle(promise, proxy, () => done, (doFinish?: boolean) => {
    if (done) return;
    tw.stop();
    if (doFinish || opts.settleOnStop) settle();
    finish();
  });
}

/** 纯延时句柄（Effects.delay 用）。 */
export function delay(seconds: number): FxHandle {
  const proxy = { t: 0 };
  let done = false;
  let resolveFn: () => void = () => {};
  const finish = (): void => {
    if (done) return;
    done = true;
    _liveTweens.delete(tw);
    resolveFn();
  };
  const tw = tween(proxy)
    .delay(scaledDuration(seconds, _timeScale))
    .call(finish) as unknown as Tween<object>;
  _liveTweens.add(tw);
  tw.start();
  const promise = new Promise<void>((res) => { resolveFn = res; });
  return makeHandle(promise, proxy, () => done, () => { tw.stop(); finish(); });
}

/** 在原生 Promise 上附加 stop/finished/target，得到 FxHandle。 */
export function makeHandle(
  promise: Promise<void>,
  target: object,
  finished: () => boolean,
  stop: (finish?: boolean) => void,
): FxHandle {
  const h = promise as FxHandle;
  Object.defineProperty(h, 'stop', { value: stop, enumerable: false });
  Object.defineProperty(h, 'finished', { get: finished, enumerable: false });
  Object.defineProperty(h, 'target', { value: target, enumerable: false });
  return h;
}

/** 停掉某节点（及其作为 host 的全部通道）的所有动画。 */
export function stopHost(host: object, finish = false): void {
  const m = _registry.get(host);
  if (!m) return;
  for (const entry of Array.from(m.values())) {
    entry.tw.stop();
    if (finish) entry.settle();
    entry.finish();
  }
}

/** 停掉全部 fx 动画。 */
export function stopAll(finish = false): void {
  for (const host of Array.from(_hosts)) stopHost(host, finish);
}

// ── 组合器 ─────────────────────────────────────────────

/** 并行：全部子句柄结束后 resolve；stop 停掉所有子句柄。 */
export function parallel(handles: FxHandle[]): FxHandle {
  let done = false;
  let resolveFn: () => void = () => {};
  const promise = new Promise<void>((res) => { resolveFn = res; });
  Promise.all(handles).then(() => { done = true; resolveFn(); });
  return makeHandle(promise, handles, () => done, (finish?: boolean) => {
    for (const h of handles) h.stop(finish);
  });
}

/** 串行：依次执行每个工厂返回的句柄。 */
export function sequence(factories: Array<() => FxHandle>): FxHandle {
  let current: FxHandle | null = null;
  let cancelled = false;
  let done = false;
  let resolveFn: () => void = () => {};
  const promise = new Promise<void>((res) => { resolveFn = res; });
  (async () => {
    for (const make of factories) {
      if (cancelled) break;
      current = make();
      await current;
    }
    done = true;
    resolveFn();
  })();
  return makeHandle(promise, factories, () => done, (finish?: boolean) => {
    cancelled = true;
    current?.stop(finish);
  });
}

// ── hitStop：暂停 / 恢复全部活跃 fx tween ────────────────
export function pauseAllFx(): void {
  for (const tw of _liveTweens) { try { tw.pause(); } catch { /* noop */ } }
}
export function resumeAllFx(): void {
  for (const tw of _liveTweens) { try { tw.resume(); } catch { /* noop */ } }
}

// ── 组件兜底 ───────────────────────────────────────────
export function ensureUIOpacity(node: Node): UIOpacity {
  return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
}

// ── damageNumber / healNumber 的 Label 节点池 ───────────
const _numberPool: Node[] = [];
let _numberLayer: Node | null = null;

function ensureNumberLayer(): Node | null {
  const root = _screenRoot;
  if (!root || !root.isValid) return null;
  if (!_numberLayer || !_numberLayer.isValid) {
    const layer = new Node('__fxNumbers');
    layer.layer = root.layer;
    root.addChild(layer);
    layer.setSiblingIndex(9999);
    _numberLayer = layer;
  }
  return _numberLayer;
}

/** 取一个飘字节点（含 Label + UIOpacity），缺则新建。需先 setScreenRoot。 */
export function acquireNumberNode(): Node | null {
  const layer = ensureNumberLayer();
  if (!layer) return null;
  const n = _numberPool.pop();
  if (n && n.isValid) { n.active = true; n.setParent(layer); return n; }
  const node = new Node('FxNumber');
  node.layer = layer.layer;
  node.setParent(layer);
  node.addComponent(UITransform).setContentSize(160, 48);
  const label = node.addComponent(Label);
  label.fontSize = 32;
  label.lineHeight = 36;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  node.addComponent(UIOpacity);
  return node;
}

/** 回收飘字节点。超过上限则直接销毁。 */
export function releaseNumberNode(node: Node): void {
  if (!node.isValid) return;
  if (_numberPool.length >= FX_CONFIG.numberPoolMax) { node.destroy(); return; }
  node.active = false;
  _numberPool.push(node);
}
