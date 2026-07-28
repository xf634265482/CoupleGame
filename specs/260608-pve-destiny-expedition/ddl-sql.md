# PVE 云数据库结构

## users.pveProfile

当前资料包含：版本、最高解锁层、最高通关层、楼层记录、命痕收集与装配、装备库存与装配、星尘、三职业熟练度、当前职业、追踪状态、活动挑战 ID、体力、教程免费挑战标记和更新时间。

## pve_challenges

每条记录对应一个楼层挑战，包含挑战 ID、用户 ID、楼层、seed、状态、挑战快照、序列化运行时版本与回合、结算结果和时间戳。用户同一时间只允许一个活动挑战。

## pve_balance_configs

保存全局、章节或单位作用域的数值覆盖。所有字段都由云端白名单和范围规则校验。

## pve_mails

玩家邮件：`userId`、`title`、`body`、`attachments`（`stardust`/`stamina` 或空）、`claimed`、`read`、`deleted`、可选 `batchId`（全服广播）、`createdAt`/`createdBy`/`reason`。列表按用户过滤未删除邮件；领取入账星尘到 `pveProfile.gold`、体力到 `pveStamina`。

## 索引

- `pve_challenges`: `userId + status`
- `pve_challenges`: `challengeId`
- `users`: `pveProfile.highestClearedFloor`（排行榜查询）
- `pve_mails`: 建议 `userId + deleted + createdAt`（实现侧可先按 `userId` 查再内存过滤）
