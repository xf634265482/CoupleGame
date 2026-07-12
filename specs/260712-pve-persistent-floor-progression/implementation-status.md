# 实施状态

## 2026-07-12 任务 1：新档案与协议边界

状态：完成。

已完成：

- 新增客户端 `PveProfile`、楼层挑战、命痕装配、固定装备实例和职业熟练度类型。
- 新增独立 `PveProgressionService`，定义 load/start/loadActive/settle 网络边界；旧 `PveService` 保持到最终切换。
- 新增云端档案版本 1；旧测试档版本不匹配时直接重建，不迁移旧 PVE 资产。
- 新增楼层、职业、装备槽、8 槽唯一命痕、挑战模式和结算请求纯校验。
- `pve.loadProfile` 已接入云函数；挑战 start/load/settle action 留给任务 2。
- `cloudfunctions/common` 已同步到部署副本。

验证：

- 云端定向测试：3 suites / 11 tests 通过。
- 新客户端类型与网络模块独立 TypeScript 编译通过（包含 `wx.d.ts`）。
- 新增云端模块与 `cloudfunctions/pve/index.js` 通过 `node --check`。
- 全量 `typecheck:game` 仍被工作区既有缺失 `assets/scripts/types/GameTypes` 阻塞。
- 全量 `typecheck:cloud` 仍被既有 `incrementUserPveRewards` JSDoc 缺少 `classId/awakenForm` 阻塞。

## 2026-07-12 任务 2：楼层挑战生命周期

状态：完成。

已完成：

- 新增 `pve_challenges` 集合常量和 ACTIVE/CLEAR/DEAD/WITHDRAW 状态机。
- 开始挑战时冻结楼层、模式、seed、职业、装备、8 槽命痕和追踪目标。
- 相同配置的重复开始请求返回同一 challengeId；不同配置在已有 ACTIVE 挑战时拒绝。
- 支持读取活跃挑战；丢失或终态挑战会修复用户档案中的陈旧指针。
- CLEAR 才更新最高通关层、解锁下一层、合并可选目标和最佳回合；DEAD/WITHDRAW 只结束当前挑战。
- 相同 challengeId 重复结算返回已存终态与空奖励快照，不重复增加 clearCount。
- 新增装备实例归属、命痕等级归属和三级升格完成校验。
- 正式奖励仍为空对象，留给计划任务 9 接入。

验证：

- 云端定向测试：5 suites / 21 tests 通过。
- 覆盖启动重试、不同配置冲突、活跃恢复、CLEAR 推进、DEAD/WITHDRAW、装备/命痕归属和重复结算。
