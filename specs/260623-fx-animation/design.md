# 《命运之塔》程序动画框架 Effects — 设计文档

> 状态：设计已确认，待实现。
> 日期：2026-06-23
> 范围：建立全项目唯一的程序动画（Procedural Animation）框架，覆盖 PVP / PVE / UI 所有动画表现。

## 1. 设计目标与边界

唯一的程序动画框架。所有 UI / 战斗 / Buff / 宝箱 / Boss / 地图交互 / 面板动画**只准**通过 `Effects` 入口调用，业务层禁止直接 `import { tween } from 'cc'`。全部用 Cocos Tween 实现。

硬性要求：

- 可复用、参数化、不依赖具体 UI、任意 Node 可调用
- 支持 Promise / async 等待
- 务实零 GC（每帧零分配；底层仍用 `tween()`，仅消除我们自己代码的分配）
- 不影响 Layout
- 支持持续时间 / 力度 / Ease / 回调 / 中断 / 连续播放 / 自由组合

**不做（YAGNI）**：时间轴/关键帧编辑器、曲线编辑器、序列帧/Spine 兼容层、为通用性增加当前项目用不到的能力。

**优先覆盖的真实场景**：棋盘移动 · 玩家/怪物/Boss 头像 · Buff/技能图标 · 宝箱 · 命运节点 · 地图交互 · UI 面板。

## 2. 目录结构

```
assets/scripts/fx/
  Effects.ts      # ★唯一公开门面★：聚合五层为单一对象 + setScreenRoot/config/stop
  FxTypes.ts      # FxOptions / FxHandle / Easing / 各效果 Options 扩展类型
  FxConfig.ts     # FX_DEFAULTS 默认值表 + FX_EASING + 全局降级开关
  fxRuntime.ts    # 运行时内核：drive 通用驱动、每(节点,通道)代理 tween 目标、临时量复用、中断登记、screenRoot、timeScale、makeHandle、parallel/sequence、数字节点池
  fxMath.ts       # 纯函数（strength→magnitude、抛物线 arc()、默认值合并）★唯一可 jest 测的部分★
  fxBasic.ts      # L1 基础能力：move/scale/rotate/fade/delay
  fxEffects.ts    # L2 基础效果：shake/punch/bounce/pop/float/flash
  fxCombat.ts     # L3 战斗效果：hit/flyTo/jumpTo/knockBack/damageNumber/healNumber/buffGain/buffLose
  fxCamera.ts     # L4 镜头效果：cameraShake/cameraPunch/cameraZoom
  fxGlobal.ts     # L5 全局效果：hitStop/slowMotion
```

业务层永远只 `import { Effects } from 'assets/scripts/fx/Effects'`。L1→L5 单向依赖，禁止反向、禁止跨层平行依赖。`assets/scripts/fx/` 是 PVP/PVE/UI 共用的顶层模块（不放进 `pve/`，因为 PVP 与 UI 也会复用）。

## 3. 模块职责

| 文件 | 职责 | 依赖 |
|---|---|---|
| `Effects.ts` | 把五层方法聚合成单一命名空间；暴露 `setScreenRoot/setCamera`、`config`、`stop(node)`、`stopAll()` | 全部 fx 层 |
| `FxTypes.ts` | 纯类型，无运行时代码 | — |
| `FxConfig.ts` | 默认值表 / 缓动常量 / 全局开关（`disableCameraShake` 无障碍降级、`globalStrength` 总力度系数） | FxTypes |
| `fxRuntime.ts` | ① `drive(host, channel, apply, dur, opts)` 通用驱动：以一个 `{t:0→1}` 代理对象为 tween 目标，`onUpdate` 时把 eased `t` 写回宿主属性 ② 复用 `Vec3/Color` 临时量 ③ 每 `(节点, 通道)` 活跃登记表（中断用）④ screenRoot/camera 注册 ⑤ `timeScale`（slowMotion 用）⑥ `makeHandle` 工厂 ⑦ `parallel/sequence` 组合器 ⑧ `damageNumber` 用的 Label 节点池 | cc, FxConfig |
| `fxMath.ts` | 纯计算，零 cc，给 ts-jest 测 | — |
| `fxBasic.ts` | 5 个最小原子能力，所有上层效果的唯一积木 | runtime, math |
| `fxEffects.ts`〜`fxGlobal.ts` | 仅**组合**下层，**禁止**自己写 `tween()` | 下层 |

## 4. FxHandle 接口

每个 `Effects.xxx` 都返回 `FxHandle`——同时是 thenable（可 await）与可中断句柄。

```ts
interface FxHandle extends PromiseLike<void> {
  /** 可 await：动画自然结束或被 stop 时 resolve（永不 reject） */
  then<R = void>(onDone?: (() => R | PromiseLike<R>) | null): Promise<R>;
  /** 中断。finish=true 跳到终态再停；false（默认）停在当前态。两者都会 resolve。 */
  stop(finish?: boolean): void;
  /** 是否已结束 */
  readonly finished: boolean;
  /** 内部 tween 真正作用的目标对象（中断通道标识） */
  readonly target: object;
}
```

组合用法：

- 串行：`await Effects.pop(n); await Effects.flash(n);`
- 并行：`await Promise.all([Effects.shake(tok), Effects.cameraShake()]);`
- 即发即忘：`void Effects.float(icon);`
- 中断：句柄 `.stop()`，或 `Effects.stop(node)`（停该节点全部通道）。

## 5. 参数规范（FxOptions）

所有效果共享一组基础参数，再各自扩展：

```ts
type Easing =
  | 'linear' | 'quadOut' | 'quadInOut' | 'cubicOut'
  | 'backOut' | 'elasticOut' | 'sineOut' | 'bounceOut'; // FX_EASING 白名单

interface FxOptions {
  duration?: number;        // 秒，缺省取该效果默认
  strength?: number;        // 力度系数，1=默认强度；内部映射为 px/scale/angle
  easing?: Easing;          // 缺省取该效果默认
  delay?: number;           // 启动前延迟（秒），默认 0
  onComplete?: () => void;  // 完成回调（自然结束或 stop(true)）
  interrupt?: boolean;      // 默认 true：启动前停掉同目标同通道旧动画（防叠加泄漏）
}
```

效果专属扩展（示例）：

- `FlyToOptions { target: Node | Vec3; arcHeight?: number; scaleTo?: number }`
- `FlashOptions { color?: Color; times?: number }`
- `FloatOptions { distance?: number; fadeOut?: boolean }`
- `KnockBackOptions { from: Node | Vec3; distance?: number }`
- `NumberOptions { crit?: boolean; color?: Color; worldPos?: Vec3 }`
- `ZoomOptions { to: number; autoReturn?: boolean }`

**力度的统一语义**：每个效果在 `FxConfig` 里定义 `baseMagnitude`，最终幅度 = `baseMagnitude × strength × globalStrength`。这让「支持力度」在全框架口径一致——`strength:2` 在任何效果上都表示「两倍于默认幅度」。

## 6. 默认值表

| 层 | 方法 | duration(s) | strength=1 的基准幅度 | 默认 easing | 作用目标 |
|---|---|---|---|---|---|
| L1 | `move` | 0.25 | 传入绝对/相对位移 | quadOut | node·move/scale 通道 |
| L1 | `scale` | 0.20 | 传入目标缩放 | backOut | node·move/scale 通道 |
| L1 | `rotate` | 0.30 | 传入目标角度 | quadOut | node.angle |
| L1 | `fade` | 0.20 | 传入目标 opacity | quadOut | UIOpacity |
| L1 | `delay` | 传入 | — | — | 内部 dummy |
| L2 | `shake` | 0.30 | ±8px 抖动衰减 | linear | node·move/scale 通道 |
| L2 | `punch` | 0.30 | scale +0.20 过冲 | backOut | node·move/scale 通道 |
| L2 | `bounce` | 0.50 | 上跳 20px + 挤压 | quadOut/elasticOut | node·move/scale 通道 |
| L2 | `pop` | 0.35 | 0→1.15→1 + 淡入 | backOut | node·scale + opacity 通道 |
| L2 | `float` | 0.80 | 上移 40px + 淡出 | sineOut | node·scale + opacity 通道 |
| L2 | `flash` | 0.15 | 白色 tint，1 次 | quadOut | Sprite.color（无则 UIOpacity 闪） |
| L3 | `hit` | 0.25 | flash∥shake∥punch 组合 | — | 组合 |
| L3 | `flyTo` | 0.40 | arc 60px，scaleTo 0.6 | quadInOut | node·move/scale 通道 |
| L3 | `jumpTo` | 0.30 | arc 30px，落地 bounce | quadInOut | node·move/scale 通道 |
| L3 | `knockBack` | 0.25 | 退 24px 再回 | quadOut→backOut | node·move/scale 通道 |
| L3 | `damageNumber` | 0.80 | 上飘 50px 淡出；crit 放大1.4 | sineOut | 池化 Label |
| L3 | `healNumber` | 0.80 | 同上，绿色 | sineOut | 池化 Label |
| L3 | `buffGain` | 0.40 | pop + 金色 flash | backOut | icon |
| L3 | `buffLose` | 0.30 | 红 flash + 缩 0 淡出 | quadOut | icon |
| L4 | `cameraShake` | 0.40 | ±10px（`screenShake` 别名） | linear | screenRoot |
| L4 | `cameraPunch` | 0.25 | scale +0.03 顿冲 | backOut | screenRoot |
| L4 | `cameraZoom` | 0.30 | 缩放到 `to` | quadInOut | screenRoot |
| L5 | `hitStop` | 0.06 | 冻结活跃 fx 补间 | — | 全局 fx |
| L5 | `slowMotion` | 0.80 | timeScale 0.3 | — | 全局 fx |

数值是初值，实现期可微调；统一收口在 `FX_DEFAULTS`，改一处全局生效。

## 7. 动画组合规范（核心约束）

1. **分层单向**：L3/L4/L5 只能调用更低层方法或 L1 原语，**禁止**直接 `tween()`。新表现需求 → 先查能否用现有效果组合，不能再考虑加 L1/L2 积木。
2. **通道隔离即可叠加**：直接动宿主节点，但每个效果以独立的 `(节点, 通道)` 代理对象为 tween 目标，通道分为 `move` / `scale` / `rotate` / `opacity` / `color`（外加 `screenRoot` 的镜头通道、池化 Label）。不同通道互不干扰，因此天然可自由组合——
   - `flyTo + hit`：飞行(move 通道) ∥ 受击 flash(color 通道) 互不干扰。
   - `pop + flash`：缩放(scale 通道) ∥ 染色(color 通道)。
   - `shake + cameraShake`：节点抖(node·move) ∥ 整屏抖(screenRoot·move)。
3. **同通道后者打断前者**：同一节点上两个都用 `move` 通道的效果（如 shake 与 knockBack），`interrupt:true` 默认让新效果先停掉旧的同通道动画并还原基准，避免错乱与泄漏；不同通道（move vs scale）则真正并行。
4. **复合只编排不计算**：复合效果内部用 `parallel([...])`/`sequence([...])` 组织子效果，不含任何数值插值逻辑。

## 8. 命名规范

- 文件：内部分层 `fxXxx.ts`；唯一公开类 `Effects`。
- 方法：与五层清单逐字一致的小驼峰（`move/scale/.../slowMotion`）。`screenShake` 作为 `cameraShake` 的兼容别名保留。
- 类型：`XxxOptions`；常量 `FX_DEFAULTS / FX_EASING`；运行时私有函数模块内不导出。
- 通道键用字面量字符串 `'move'/'scale'/'rotate'/'opacity'/'color'`；镜头通道加 `'cam:'` 前缀。`damageNumber` 池容器节点名固定 `'__fxNumbers'`（双下划线前缀，挂在 screenRoot 下，避免与业务节点重名、便于真机排查）。

## 9. 与零 GC / Layout / 真机的契合

- **零 GC**：底层 `tween()`；播放前 `Tween.stopAllByTarget`；位置/颜色读写复用模块级 `Vec3/Color` 临时量；缓动用字符串名（无闭包）；`damageNumber/healNumber` 走 Label 对象池。每帧零分配，仅每次「启动」一次 `.to({...})` 字面量开销（务实零 GC 可接受）。
- **Layout**：本项目动画目标全是手动 `setPosition` 的独立节点，未挂 Cocos `Layout` 组件（全项目仅 `PveMessageLog` 滚动列表用了 Layout，而它不参与动画）。因此直接动宿主节点即可；瞬态效果（shake/punch/bounce/hit/knockBack）结束或中断时按通道基准快照还原，业务坐标零污染；持久效果（fade 到某值、cameraZoom）保留终态。唯一例外：真正在 `Layout` 下的节点位移类不支持，改用 scale/opacity。
- **真机**：遵守项目 DynamicAtlas 已全局禁用的前提；`FxConfig.disableCameraShake` 提供性能/无障碍降级；不新增贴图资源，纯节点变换。

## 10. 五层清单与场景映射

### 第一层 基础能力（fxBasic）

`move` / `scale` / `rotate` / `fade` / `delay` —— 最小原子，所有上层效果的唯一积木。

### 第二层 基础效果（fxEffects）

`shake` / `punch` / `bounce` / `pop` / `float` / `flash` —— 由 L1 组合。

### 第三层 战斗效果（fxCombat）

`hit` / `flyTo` / `jumpTo` / `knockBack` / `damageNumber` / `healNumber` / `buffGain` / `buffLose`。

- `hit = flash ∥ shake ∥ punch`
- `flyTo`：抛物线移动 + 缩小，奖励飞向 HUD
- `jumpTo`：棋盘跳跃，落地内置 `bounce`
- `knockBack`：受击位移退回
- `damageNumber/healNumber`：池化 Label + `float` + `fade`，crit 放大
- `buffGain = pop + 金色 flash`；`buffLose = 红 flash + 缩 0 淡出`

### 第四层 镜头效果（fxCamera）

`cameraShake`（别名 `screenShake`）/ `cameraPunch` / `cameraZoom`，全部作用在 `setScreenRoot` 注册的根节点（即「镜头」= screenRoot 的变换）。

### 第五层 全局效果（fxGlobal）

- `hitStop(ms)`：暂停活跃 fx 补间 + 节拍延时，制造顿帧打击感。
- `slowMotion(scale, duration)`：在窗口内设 `fxRuntime.timeScale`，让窗口内**新启动**的 fx 变慢（用于 Boss 死亡慢镜头）。

### 场景映射

| 场景 | 组合 |
|---|---|
| 棋盘移动 | `jumpTo(token, cellPos)` → 落地内置 `bounce` |
| 头像受击 | `hit(portrait, {strength})`；重击叠 `cameraShake` |
| Boss 登场/技能 | `pop(boss)` + `cameraPunch()`；释放 `cameraShake()` |
| Buff 获得/失去 | `buffGain(icon)` / `buffLose(icon)` |
| 技能就绪/释放 | 就绪 `flash(icon)`；释放 `punch(icon)` |
| 宝箱开启 | `shake(chest,{蓄力})` → `pop` + `flash` |
| 命运节点选中 | `punch(node)` + `flash`；解锁 `pop` |
| 地图交互物 | `bounce(icon)` 提示可交互 |
| UI 面板开/关 | 开 `pop(panel)`；关 `fade(panel,0)`；输入错误 `shake(panel)` |
| 伤害/治疗数字 | `damageNumber(token, n, {crit})` / `healNumber(...)` |

## 11. 每个效果的文档要素

实现阶段每个效果在源码 JSDoc 中必须给齐：默认参数、可配置参数、使用示例、组合示例、注意事项。已知注意事项汇总：

- `flash` / `hit` 需要 `Sprite`；无 `Sprite` 时降级为 `UIOpacity` 闪。
- 位移/缩放类直接动宿主节点，瞬态效果结束/中断按通道基准还原；业务读节点真实坐标在动画结束后不受影响。
- `damageNumber/healNumber` 池在 `screenRoot` 下，**必须先 `Effects.setScreenRoot`**。
- `cameraZoom` 作用 `screenRoot.scale`，会放大整屏（含 HUD）。若只想缩放战场，`setScreenRoot` 指向战场根而非全屏 Canvas。
- `hitStop` 只冻结 fx 动画，不冻结游戏逻辑/输入（回合制可接受）。
- `slowMotion` 只影响窗口内**新启动**的 fx，不改已运行 tween，也不改游戏逻辑时钟（Cocos Tween 无运行时 timescale 的固有限制）。
- **禁止**在 `pve/core/` 里 `import Effects`（core 零 cc 依赖）；动画只在 controllers/views 调用。

## 12. 验证策略

- `fxMath.ts` 纯函数（力度映射 / 抛物线 / 默认值合并）→ ts-jest，置于 `test/fx/`（仿照 `test/pve/`，不进游戏包）。
- 其余 cc 耦合部分靠**编辑器预览 + 可选 `FxGallery` 调试面板**（一屏按钮逐个点放，肉眼验收）。`FxGallery` 列为可选附加项，不阻塞主框架。
- 遵守项目排查规则：表现类 bug 第一次猜测失败即转系统化排查。

## 13. 实现进度

| # | 模块 | 状态 |
|---|---|---|
| 1 | `FxTypes` + `FxConfig` + `fxMath`（+ `test/fx/fxMath.test.ts` 9 例） | ✅ 完成，单测通过 |
| 2 | `fxRuntime`（drive / 临时量复用 / 通道中断登记 / makeHandle / parallel-sequence / screenRoot / timeScale / 数字池 / pauseAllFx） | ✅ 完成，tsc 通过 |
| 3 | `fxBasic`（L1 move/scale/rotate/fade/delay） | ✅ 完成 |
| 4 | `fxEffects`（L2 shake/punch/bounce/pop/float/flash） | ✅ 完成 |
| 5 | `fxCombat`（L3 hit/flyTo/jumpTo/knockBack/damageNumber/healNumber/buffGain/buffLose，含池化 Label 数字） | ✅ 完成 |
| 6 | `fxCamera`（L4 cameraShake/cameraPunch/cameraZoom + screenShake 别名） | ✅ 完成 |
| 7 | `fxGlobal`（L5 hitStop/slowMotion） | ✅ 完成 |
| 8 | `Effects` 门面聚合 | ✅ 完成 |
| 9 | `FxGallery` 调试面板 — 一屏逐个肉眼验收 cc 耦合的实际播放 | ✅ 完成，tsc 通过；待编辑器预览验收 |
| 10 | 真实场景试点接入（如棋盘 `jumpTo` / 面板 `pop`） | ⬜ 待定 |

**已验证**：`fxMath` 纯逻辑单测 9/9 通过；全部 10 个 fx 文件 `tsc --noEmit` EXIT=0。
**已静态消除的风险**：`proxy.t` 是否携带缓动值 —— 查引擎声明 `ITweenOption.onUpdate?(target, ratio)`，且 `to({t:1})` 对属性的插值公式为 `t = easing(进度)`，故 `proxy.t` 必为已缓动值，`drive` 读 `proxy.t` 正确（pop/punch 过冲一定生效）。所用 8 个缓动名均在引擎 `TweenEasing` 合法集内。

**仍需目视**：实际播放的「手感/时长调参」、`FxGallery` 触摸事件接线、`Texture2D` 渲染——这些属低风险调优项，经 #9 FxGallery 或 #10 试点确认即可。无 Cocos MCP 连接时，可用浏览器 Preview MCP 挂到 Cocos web 预览（canvas）做自动化冒烟：截图 + 读运行时 console 抓崩溃/告警 + 经 eval 触发效果。
