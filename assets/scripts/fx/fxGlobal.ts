// fx/fxGlobal.ts —— 第五层：全局效果（hitStop / slowMotion）。
// 用真实时钟（setTimeout）控制窗口，避免「用被自己暂停/拖慢的 tween 来计时」的死锁。

import { FX_DURATION } from './FxConfig';
import { makeHandle, pauseAllFx, resumeAllFx, setTimeScale } from './fxRuntime';
import type { FxHandle } from './FxTypes';

/**
 * 顿帧：暂停全部活跃 fx 补间，过 seconds 真实秒后恢复，制造打击停顿。
 * 注意：只冻结 fx 动画，不冻结游戏逻辑/输入（回合制可接受）。
 */
export function hitStop(seconds: number = FX_DURATION.hitStop): FxHandle {
  pauseAllFx();
  let done = false;
  let resolveFn: () => void = () => {};
  const finish = (): void => { if (done) return; done = true; resumeAllFx(); resolveFn(); };
  const timer = setTimeout(finish, Math.max(0, seconds) * 1000);
  const promise = new Promise<void>((res) => { resolveFn = res; });
  return makeHandle(promise, { hitStop: true }, () => done, () => { clearTimeout(timer); finish(); });
}

/**
 * 慢动作：在 duration 真实秒内把全局 timeScale 设为 scale（<1 变慢）。
 * 只影响窗口内「新启动」的 fx；不改已运行 tween，也不改游戏逻辑时钟（Cocos Tween 限制）。
 */
export function slowMotion(scale = 0.3, duration: number = FX_DURATION.slowMotion): FxHandle {
  setTimeScale(scale > 0 ? scale : 1);
  let done = false;
  let resolveFn: () => void = () => {};
  const finish = (): void => { if (done) return; done = true; setTimeScale(1); resolveFn(); };
  const timer = setTimeout(finish, Math.max(0, duration) * 1000);
  const promise = new Promise<void>((res) => { resolveFn = res; });
  return makeHandle(promise, { slowMotion: true }, () => done, () => { clearTimeout(timer); finish(); });
}
