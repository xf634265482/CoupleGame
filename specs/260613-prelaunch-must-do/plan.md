# 上线前必做 — Implementation Plan

> 配套 [design.md](design.md)。三项独立工作，无内部前置依赖。

## 阶段 1：LoadingOverlay（1.5 小时）

### T1.1 组件实现
- `assets/scripts/ui/LoadingOverlay.ts`：
  - 静态方法 `show(text?)/hide()/update(text)`，单例管理
  - Graphics 画 spinner（圆弧 + `schedule(0.016)` 旋转角度）
  - 半透明黑色全屏遮罩 + 中心 Label
  - 挂在 `director.getScene()` 根节点，setSiblingIndex 最大

### T1.2 接入点
- `LobbyController` 三个跳转按钮包装：
  ```ts
  LoadingOverlay.show('进入房间…');
  await Promise.race([preloadBoardAssets(), delay(10000)]);
  LoadingOverlay.hide();
  SceneLoader.loadBoard();
  ```
- `GameApp.onLoad` 把 `_setStatus` 文案接到 LoadingOverlay.update
- 各 Controller 进场后 `LoadingOverlay.hide()`

### T1.3 测试
- 手动真机：清缓存、断网慢速、正常网络三档验证

---

## 阶段 2：PerfMarks 埋点（1 小时）

### T2.1 工具实现
- `assets/scripts/core/PerfMarks.ts`：
  - `mark(name)`：`_marks[name] = performance.now()`
  - `measure(from, to)`：返回毫秒差
  - `report()`：返回所有相邻 mark 的差值字典
  - `dump()`：`console.table`

### T2.2 埋点
- `GameApp.onLoad` 8 处 mark（见 design §2.2）
- `Constants.PERF_TRACE_ENABLED` 控制是否 mark/dump
- onLoad 结尾 if(enabled) `setTimeout(() => PerfMarks.dump(), 0)`

### T2.3 验证
- 编辑器预览：console 看到 table
- 真机：console 看到 table（微信开发者工具）

---

## 阶段 3：服务端下发 runSeed（2 小时）

### T3.1 云函数
- `cloudfunctions/common/pve/PveSave.js` 新增 `startRun(user)`：
  ```js
  async function startRun(user) {
    const existing = await getPveSaveByUserId(user.id);
    if (existing) return { runSeed: existing.runSeed, resume: true };
    const runSeed = Math.floor(Math.random() * 0x7fffffff) || 1;
    return { runSeed, resume: false };
  }
  ```
- `cloudfunctions/pve/index.js` 新增 action `startRun` 分发
- `cloudfunctions/common/__tests__` 加测试用例

### T3.2 同步脚本
- `node scripts/sync-cloud-common.js`

### T3.3 客户端
- `assets/scripts/network/PveService.ts` 新增 `startRun(): Promise<{runSeed, resume}>`
- `ExpeditionController._beginNewRun` 改异步：
  ```ts
  private async _beginNewRun(): Promise<void> {
    const { runSeed } = await PveService.startRun();
    this._state = startExpedition(runSeed, this._meta ?? undefined);
    ...
  }
  ```
- 失败处理 + toast

### T3.4 测试
- `test/pve/` 已有的 `startExpedition` 单测保持原签名（接受 seed 参数）
- `cloudfunctions/common/__tests__/pve.test.js` 新增 startRun 用例

### T3.5 同步文档
- [经济养成与存档系统V1](../game-design/经济养成与存档系统V1.md) §5.2 修改 runSeed 描述："服务端 `startRun` action 生成下发"
- §七.4 已知限制移除"客户端 Math.random 生成"那条

---

## 阶段 4：验收（30 分钟）

- [ ] 真机：spinner 三档网络验证
- [ ] 真机：PerfMarks dump table 完整
- [ ] 真机：新远征 `startRun` 云函数调用成功
- [ ] `npm test` 全绿（含云函数）

---

## 工作量估算

| 阶段 | 时间 |
|---|---|
| 阶段 1 LoadingOverlay | 1.5 小时 |
| 阶段 2 PerfMarks | 1 小时 |
| 阶段 3 服务端 runSeed | 2 小时 |
| 阶段 4 验收 | 30 分钟 |
| **合计** | **~5 小时** |
