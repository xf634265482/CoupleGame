# 上线前必做 — Design

> 范围：上线前 UX 与防作弊基线，三项最影响首发口碑的工程改造。
> 关联：[性能与启动优化V1](../game-design/性能与启动优化V1.md)、[经济养成与存档系统V1](../game-design/经济养成与存档系统V1.md)。
> 决定日期：2026-06-13。

## 目标

1. **大厅 → 棋盘/PVE 切换 spinner**：消除真机 1-2s 静默切场感
2. **启动加载耗时埋点**：让 M2 优化"有数据可依"
3. **服务端下发 runSeed**：防客户端"选有利种子"

## 一、切换 spinner

### 1.1 现状

- `LobbyController` 点击「创建房间」/「开始远征」/「命运树」按钮立刻 `SceneLoader.loadXxx()`
- 若 `preloadLobbyBackgroundAssets`（房间/棋子图）/ PVE 存档 loadActiveSave 未完成，玩家 1-2s 看不到反馈
- 真机分包重试链最坏 1.6s 黑屏（[性能与启动优化V1](../game-design/性能与启动优化V1.md) §九.2）

### 1.2 方案

新建 `assets/scripts/ui/LoadingOverlay.ts`：
- 一个全屏半透明遮罩 + 中心 spinner（用 Graphics 画圆弧旋转，避免引入图片资源）+ 可选文案 Label
- API：`LoadingOverlay.show(text?)` / `LoadingOverlay.hide()` / `LoadingOverlay.update(text)`
- 挂在 `director.getScene()` 根节点的最高 layer，跨场景持续

接入点：
- `LobbyController` 创建房间按钮 → `LoadingOverlay.show('进入房间…')` → 等 preload → `SceneLoader.loadBoard()` → 场景加载完成 hide
- `LobbyController` 命运远征按钮 → `LoadingOverlay.show('加载远征…')` → 等 `loadActiveSave` → `SceneLoader.loadPveExpedition()` → hide
- `GameApp.onLoad` 替换 `statusLabel` 文案的位置 → 用 LoadingOverlay 统一展示

### 1.3 防误触

- spinner 显示期间，禁用按钮交互（`_busy=true`）
- 超时兜底：10s 仍未完成 → `hide()` + toast「加载较慢，请检查网络」，让玩家可重试

## 二、启动加载耗时埋点

### 2.1 现状

`GameApp.onLoad` 全靠 `console.log` 时间戳人工估算，无可比较的基线数据。

### 2.2 方案

新建 `assets/scripts/core/PerfMarks.ts`：
```ts
export const PerfMarks = {
  mark(name: string): void,       // performance.now() 记录
  measure(from: string, to: string): number,  // 计算两点间耗时
  report(): Record<string, number>,           // 返回所有 measure 结果
  dump(): void,                               // console.table 输出
}
```

埋点位置（按启动主路径顺序）：
- `app_start`（GameApp.onLoad 第一行）
- `wx_cloud_init_done`（initWxCloud 之后）
- `login_done`（Promise.all 拿到 user 时）
- `resources_bundle_done`（拿到 bundle 时）
- `preload_lobby_ui_done`（preloadLobbyUi 之后 / race 超时时）
- `lobby_scene_loaded`（loadLobby 后帧 1）
- `lobby_bg_preload_done`（preloadLobbyBackgroundAssets 完成）
- `bgm_started`（tryStartBgm 之后）

### 2.3 上报

M2 阶段先**本地 dump**（dev 环境 console.table），不立刻接云端日志。

控制开关：`Constants.PERF_TRACE_ENABLED = true / false`（dev=true, release 提交前关掉）。

### 2.4 输出示例

```
┌─────────────────────────┬──────┐
│ segment                 │ ms   │
├─────────────────────────┼──────┤
│ wx_cloud_init           │   45 │
│ login                   │  320 │
│ resources_bundle        │  180 │
│ preload_lobby_ui        │  420 │
│ lobby_scene_load        │  110 │
│ total_to_lobby_visible  │ 1075 │
└─────────────────────────┴──────┘
```

## 三、服务端下发 runSeed

### 3.1 现状

[经济养成与存档系统V1](../game-design/经济养成与存档系统V1.md) §5.2 + §七.4：runSeed 由客户端 `Math.floor(Math.random()*0x7fffffff)||1` 生成。
理论上客户端可"反复试种子直到出好布局"再开始正式远征——尤其在 [地图与探索系统V1](../game-design/地图与探索系统V1.md) §2 `generateFloor` 完全 seed 决定的情况下，刷种成本极低。

### 3.2 方案

云函数 `pve` 新增 action `startRun`：
- 输入：无（或可选 `meta` 同步用，但 seed 不来自客户端）
- 处理：
  - 检查无 `pve_saves` 活跃存档（有则直接返回该存档，按 resume 走）
  - 服务端用 `Math.floor(Math.random() * 0x7fffffff) || 1` 生成 runSeed
  - 不立即写存档（client 必须打通第 1 层 FLOOR_CLEARED 才走 saveFloorProgress），仅返回 `{ runSeed }`
- 输出：`{ runSeed: number }`

客户端改造：
- `ExpeditionController._beginNewRun` 异步化：先 `PveService.startRun()` 拿 runSeed，再 `startExpedition(runSeed, meta)`
- `startRun` 失败 → toast「开启远征失败：${err.message}」+ 不进场

### 3.3 校验

`PveValidate.validateSaveFloorReport`/`validateSettleReport` 已校验"runSeed 与存档一致"。无需追加新规则——服务端从不信客户端生成的种子，但服务端**也不存**未存档前的"待开局 runSeed"，这意味着：
- 客户端拿到 runSeed 后未存档前断开，下次 `startRun` 会给新 runSeed（无副作用）
- 客户端**仍可以**试 startRun 多次拿不同 seed——但每次都是服务端独立生成，玩家无法控制结果，等同于"刷开局界面"的成本

这就够了。完全防作弊需要"服务端复算地图布局并落 db"，工程成本远超收益，本批不做。

### 3.4 兼容

旧版本客户端仍走 `Math.random`：保留 `startExpedition(seed?: number)` 兼容签名，仅 controller 调用点改异步。

## 四、验收

- AC-501：大厅→棋盘/PVE 切换按钮点击后立即出现 spinner，10s 超时兜底文案出现
- AC-502：dev 环境 `PerfMarks.dump()` 输出关键节点耗时
- AC-503：新远征开局必须先调云函数 `startRun`，本地禁止生成 runSeed（grep `Math.random()` 在 controller 中仅剩防御性代码）
- AC-504：startRun 云函数返回的 runSeed 写入 `ExpeditionState.runSeed`，与后续 saveFloorProgress 一致
- AC-505：客户端断网时 startRun 抛错 + UI 友好提示

## 五、不在本批范围

- 云端日志上报 PerfMarks（M3）
- 完全反作弊（服务端复算地图落库）
- 加载文案的国际化
