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
