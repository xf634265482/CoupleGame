# 邮件系统（大厅邮箱 + GM 发奖）

日期：2026-07-28  
范围：大厅邮箱入口与领取 UI；云端邮件存取与领取入账；GM 单人/全服发信。同步清除「钻石」对 PVE/GM 的干扰（游戏货币仅星尘）。

## 背景

GM 需要向玩家发放奖励与系统通知；后续星尘、体力等应先入邮箱，由玩家主动领取，避免直接改档难以审计。大厅尚无邮箱入口。现网仍残留「钻石」命名与 GM 钻石调整（局外字段 `users.diamond` 来自已移除的 PVP），干扰星尘口径。

## 目标

1. 大厅左上头像信息卡下方有「邮箱」按钮（未读红点）。
2. 玩家可查看邮件、领取附件、删除、一键领取全部。
3. GM 可向指定玩家或全服发送：纯通知 / 星尘 / 体力。
4. 清除 PVE 大厅与 GM 工具中的钻石展示与调整入口，统一为星尘（`pveProfile.gold`）。

## 已确认决策

| 项 | 选择 |
|----|------|
| 范围 | 完整 MVP（大厅 + 云端 + GM） |
| 附件 | 纯通知、星尘、体力（无钻石、无装备/命痕） |
| 发送对象 | 指定玩家 + 全服广播 |
| 领取/删除 | 单封领取；领完可删；纯通知可删；一键领取全部 |
| 过期 | 第一版不过期 |
| 入口位置 | 左上头像信息卡正下方 |
| 存储 | 每人独立 `pve_mails` 文档；广播 fan-out |

## 架构

```text
GM Web sendMail / sendMailBroadcast
  -> adminTool -> AdminToolService
  -> 写入 pve_mails（单人 1 条 / 全服按用户 fan-out，同 batchId）

大厅邮箱按钮
  -> listMails / claimMail / claimAllMails / deleteMail（pve 云函数）
  -> 领取事务：标记 claimed + 增加 profile.gold 或 user.pveStamina
  -> 刷新大厅星尘/体力条
```

## 数据模型

集合 `pve_mails`（`initDb` 创建）：

| 字段 | 说明 |
|------|------|
| `_id` / `id` | 邮件 ID |
| `userId` | 收件玩家 |
| `title` / `body` | 标题与正文 |
| `attachments` | `[]` 或 `[{ type: 'stardust' \| 'stamina', amount: number }]`；星尘入账到 `pveProfile.gold` |
| `claimed` | 是否已领取附件（无附件视为无需领取，打开即算已读可用 `read` 字段） |
| `read` | 是否已读（用于红点；领取或打开详情置 true） |
| `deleted` | 软删，列表过滤 |
| `batchId` | 可选；全服广播共用 |
| `createdAt` / `createdBy` | 时间与管理员账号 |
| `reason` | GM 操作原因（审计） |

索引建议：`userId + deleted + createdAt` 降序。

不过期；玩家删除后 `deleted=true`，不再出现在列表。

## 云端 API

### 玩家（`cloudfunctions/pve`，逻辑在 `cloudfunctions/common/`）

- `listMails`：当前用户未删除邮件，新→旧；附带 `unreadCount`（未读或未领附件）。
- `claimMail({ mailId })`：幂等；已领直接返回；有附件则事务内入账并 `claimed=true`、`read=true`。
- `claimAllMails`：批量领取所有未领且含附件的邮件（同样幂等）。
- `deleteMail({ mailId })`：已领或无附件可删；未领且有附件则拒绝（或先提示须领取——实现钉死：**未领有附件不可删**）。

入账规则：

- `stardust` → `pveProfile.gold += amount`
- `stamina` → `pveStamina = min(STAMINA_MAX, pveStamina + amount)`，并更新恢复时间戳字段（与现有体力逻辑一致）

### GM（`adminTool`）

- `sendMail`：payload 含目标 userId/openId、title、body、attachments、reason。
- `sendMailBroadcast`：同上但无单人目标；枚举用户 fan-out 写入（同 `batchId`）；写 admin 日志。
- 单次广播用户数过大时分批写（实现计划钉死批次大小与超时策略）。

## 大厅 UI

- 在 `PveLobbyController._buildTopBar` 的 `PlayerCard` **下方**增加邮箱按钮（文案「邮箱」或图标+文案）。
- 未读红点：`unreadCount > 0`。
- 弹层（`MailView` + 可选 `MailController` 挂点，或 Lobby 内嵌面板，与商会/排行榜风格一致）：
  - 列表：标题、时间、附件摘要、未读/未领标记
  - 详情：正文、领取、删除
  - 底部「一键领取」
- 领取成功后调用现有 `_applyStardust` / 体力刷新。

## GM Web

- 新增「发邮件」区：对象（搜玩家 / 全服）、标题、正文、附件类型与数量、原因。
- 发信成功展示写入数量（广播时）。

## 清除钻石干扰（本设计强制项）

游戏对外货币只有**星尘**（`pveProfile.gold`）。本轮同时做：

1. **GM**：`adjustResources` 去掉 `diamond`；可改为支持 `stardust`（写 `pveProfile.gold`）或仅保留 `stamina`（星尘改走邮件）。推荐：`RESOURCE_TYPES` 改为 `stardust` + `stamina`，UI 文案全改「星尘」。
2. **GM 玩家视图**：不再展示「钻石」字段；展示星尘（`gold`）与体力。
3. **大厅**：`_diamondLabel` 重命名为 `_stardustLabel`；芯片节点名与注释统一星尘；继续绑定 `profile.gold`（已有 `_applyStardust`）。
4. **不**在本轮删除 `users.diamond` 历史字段或改写已废弃 PVP specs；仅切断 PVE/GM 产品路径上的钻石入口。

## 文档同步

- `specs/260608-pve-destiny-expedition/design.md`：邮箱与领取规则；货币口径仅星尘。
- `CALL_FLOW.md`：大厅邮箱与 GM 发信链路。
- `PROJECT_NAVIGATION.md`：邮箱入口文件。
- `initDb` / ddl 说明：`pve_mails`。

## 非目标

- 装备、命痕、钻石附件
- 邮件过期与自动清理
- 按通关层等条件筛选群发
- 微信订阅消息推送
- 把旧远征结算奖励改走邮件（仍直接入账）

## 验收

1. GM 给指定玩家发「星尘 100」→ 大厅邮箱可见 → 领取后星尘 +100，邮件可删。
2. GM 全服广播纯通知 → 多账号均可见；无附件可直接删；红点可消。
3. 一键领取多封含附件邮件，重复领取不重复入账。
4. 未领附件邮件不可删除。
5. GM 与大厅不再出现可操作的「钻石」；星尘展示与 `gold` 一致。

## 风险

- 全服 fan-out 用户量大时云函数超时：需分批 + 日志；首版可限制单次广播最大用户数并在 UI 提示。
- 领取与体力恢复并发：领取体力须走与 `PveStamina` 一致的写字段，避免恢复时钟错乱。
