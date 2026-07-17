# PVE 云数据库结构

## users.pveProfile

当前资料包含：版本、最高解锁层、最高通关层、楼层记录、命痕收集与装配、装备库存与装配、星尘、三职业熟练度、当前职业、追踪状态、活动挑战 ID、体力、教程免费挑战标记和更新时间。

## pve_challenges

每条记录对应一个楼层挑战，包含挑战 ID、用户 ID、楼层、seed、状态、挑战快照、序列化运行时版本与回合、结算结果和时间戳。用户同一时间只允许一个活动挑战。

## pve_balance_configs

保存全局、章节或单位作用域的数值覆盖。所有字段都由云端白名单和范围规则校验。

## 索引

- `pve_challenges`: `userId + status`
- `pve_challenges`: `challengeId`
- `users`: `pveProfile.highestClearedFloor`（排行榜查询）
