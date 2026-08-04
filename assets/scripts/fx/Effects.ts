// fx/Effects.ts —— 《命运之塔》唯一程序动画入口。
//
// 业务层只 import { Effects }，禁止直接 import { tween } from 'cc'。
// 所有 UI / 战斗 / Buff / 宝箱 / Boss / 地图 / 面板动画都走这里；
// 新表现需求优先用已有效果组合（Promise.all 并行 / await 串行），不要重复写 Tween。
//
//   await Effects.pop(panel);                       // 面板弹出
//   await Promise.all([Effects.hit(tok), Effects.cameraShake()]);   // 受击 + 震屏
//   Effects.setScreenRoot(battlefieldRoot);         // 注册镜头/飘字根（用 cameraXxx / damageNumber 前必须）
//
// 分层（design §10）：L1 基础能力 → L2 基础效果 → L3 战斗 → L4 镜头 → L5 全局。

import type { Node } from 'cc';
import { move, scale, rotate, fade, delay } from './fxBasic';
import { shake, punch, bounce, pop, float, flash } from './fxEffects';
import {
  hit, flyTo, jumpTo, knockBack, damageNumber, healNumber, buffGain, buffLose,
} from './fxCombat';
import { cameraShake, cameraPunch, cameraZoom, screenShake } from './fxCamera';
import { hitStop, slowMotion } from './fxGlobal';
import {
  setScreenRoot, getScreenRoot, stopHost, stopAll, parallel, sequence,
} from './fxRuntime';
import { FX_CONFIG } from './FxConfig';

export const Effects = {
  // ── L1 基础能力 ──
  move, scale, rotate, fade, delay,
  // ── L2 基础效果 ──
  shake, punch, bounce, pop, float, flash,
  // ── L3 战斗效果 ──
  hit, flyTo, jumpTo, knockBack, damageNumber, healNumber, buffGain, buffLose,
  // ── L4 镜头效果 ──
  cameraShake, cameraPunch, cameraZoom, screenShake,
  // ── L5 全局效果 ──
  hitStop, slowMotion,

  // ── 组合器（业务一般用 Promise.all / await 即可，这两个供需要可中断聚合时用）──
  parallel, sequence,

  // ── 控制 ──
  /** 注册镜头 / 飘字根节点。cameraXxx 与 damageNumber/healNumber 使用前必须先调一次。 */
  setScreenRoot,
  /** setScreenRoot 的语义别名。 */
  setCamera: setScreenRoot,
  getScreenRoot,
  /** 停掉某节点的全部 fx 动画。finish=true 跳到终态。 */
  stop(node: Node, finish = false): void { stopHost(node, finish); },
  /** 停掉全部 fx 动画。 */
  stopAll,
  /** 全局可调配置（globalStrength / disableCameraShake / numberPoolMax）。 */
  config: FX_CONFIG,
} as const;

export type { FxHandle, FxOptions, Easing } from './FxTypes';
