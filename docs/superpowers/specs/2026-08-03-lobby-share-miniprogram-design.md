# 大厅分享小程序（纯拉新）

日期：2026-08-03  
范围：大厅右侧「分享」入口；调用微信 `wx.shareAppMessage` 拉起分享面板。实现时同步 `PROJECT_NAVIGATION.md`、`CALL_FLOW.md`。不改 PVE 玩法 `design.md`（无规则/数值变更）。

## 背景

项目已有旧 PVP 房间分享工具 `assets/scripts/platform/wechat/WxShare.ts`（`shareRoom`），但大厅尚无「分享小程序」入口。当前产品为单人 PVE「命运远征」，需要一个轻量拉新分享能力。

## 目标

1. 大厅商会入口正上方有「分享」按钮，风格与商会侧栏入口一致。
2. 点击后立刻拉起微信分享面板；好友点开可进入本小程序。
3. 非微信环境点击不崩溃（仅日志提示）。

## 非目标（本版不做）

- 邀请奖励、邀请码、归因 query、云端统计
- 自定义分享封面图
- 注册右上角菜单 `onShareAppMessage` / `showShareMenu`
- 二次确认弹层 / 独立 ShareController

## 已确认决策

| 项 | 选择 |
|----|------|
| 目的 | 纯拉新（方案 A） |
| 入口位置 | 大厅右侧，商会正上方 |
| 分享卡片 | 固定文案 + 微信默认封面 |
| 实现路径 | 扩展 `WxShare.ts` + 大厅加入口 |
| 权威/云端 | 无；纯客户端微信 API |

## 架构

```text
大厅「分享」按钮
  -> PveLobbyController._buildSideShareEntry
  -> shareMiniProgram()（WxShare.ts）
  -> wx.shareAppMessage({ title })
```

落点：

- 平台：`assets/scripts/platform/wechat/WxShare.ts`（新增 `shareMiniProgram`）
- 大厅：`assets/scripts/lobby/PveLobbyController.ts`（商会旁侧栏分享入口）
- 类型：`assets/scripts/types/wx.d.ts`（按需补全 `shareAppMessage` 可选字段）
- 导航：`PROJECT_NAVIGATION.md`、`CALL_FLOW.md`

保留现有 `shareRoom` / `parseLaunchRoomCode`；本版不强制清理旧房间分享 API。

## UI

- 新增 `_buildSideShareEntry(root)`，与 `_buildSideShopEntry` 同区挂载。
- 尺寸/风格对齐商会：约 `88×110`、圆角底、图标 + 文案「分享」。
- 坐标：X 对齐商会 `312`；商会 `y≈40`，分享放在其上方（约 `y=170`，中间留空隙）。
- 图标：无现成 `icon_share` 时可用简单图形或相近现有资源；不强制本版新美术入库。
- 点击无确认弹层，直接分享。

## 平台 API

```ts
shareMiniProgram(): void {
  // 无 wx / 无 shareAppMessage → console.warn，return
  wx.shareAppMessage({
    title: '一起来玩命运远征！',
    // 不传 query、不传 imageUrl
  });
}
```

- 固定标题：`一起来玩命运远征！`
- 不传 `query`（无归因）
- 不传 `imageUrl`（用微信默认封面）

## 验收

1. 微信真机：大厅商会上方可见「分享」；点击弹出微信分享面板；选好友/群后可发出卡片。
2. 好友点开卡片可进入本小程序（进入大厅即可，无特殊落地页要求）。
3. 编辑器 / 非微信：点击不抛未捕获异常；控制台有不可用提示。
4. 不出现邀请奖励、红点、云函数调用。

## 文档与后续

- 实现时更新 `PROJECT_NAVIGATION.md`、`CALL_FLOW.md`。
- 后续若加邀请奖励或自定义封面，另开规格；可复用同一入口与 `shareMiniProgram` 扩展参数。
