# PVE 运维手册

## 数据入口

- 玩家永久资料：`users.pveProfile`
- 楼层挑战：`pve_challenges`
- 数值覆盖：`pve_balance_configs`

## 常用检查

1. 确认玩家资料的最高解锁层、最高通关层、体力和 `activeChallengeId`。
2. 若挑战异常，核对 `pve_challenges` 中的状态、楼层、运行时版本和回合。
3. 需要重置时通过 GM 的“重置远征”或“重置营地库存”操作，并填写原因。
4. 数值配置只通过 GM 白名单字段修改；第一、二章内容完成前不做整体数值重算。

云端共享代码只修改 `cloudfunctions/common/`，随后执行 `node scripts/sync-cloud-common.js`。
