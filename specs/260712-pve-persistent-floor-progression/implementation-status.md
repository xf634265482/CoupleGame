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

## 2026-07-12 任务 3：客户端单层运行态

状态：完成。

已完成：

- 新增独立 `FloorChallengeState` 与 `FloorChallengeLifecycle`，不直接改写旧 `ExpeditionState`。
- 开始楼层时统一恢复 HP/AP，清空灵气、护盾、异常、临时效果和职业回合态。
- 支持 CLEAR/DEAD/WITHDRAW 终态和云端结算请求生成。
- 支持续档序列化；恢复时严格匹配 challengeId、floor、seed 和冻结配置。
- 新增 `saveFloorChallengeRuntime` 云端 action，活跃挑战加载时一并返回运行态。
- 运行态存档重复请求幂等；低 turn 存档不能覆盖高 turn 存档。
- 单个运行态 JSON 上限 900000 字符，拒绝非法 JSON、错误版本和非 ACTIVE 状态。

验证：

- 客户端定向测试：1 suite / 8 tests 通过。
- 云端挑战相关定向测试：5 suites / 23 tests 通过。
- 新客户端生命周期与网络模块独立 TypeScript 编译通过。

## 2026-07-12 任务 4A：三职业纯规则内核

状态：完成。

已完成：

- 新增战士蓄力攻击预览、战技门槛、破甲、击退/失衡与横扫参数解析。
- 新增射手跨回合瞄准状态机，区分主动移动与强制位移，并实现三种射术校验。
- 新增游侠交替行动连击、重复行动不增长、回合清空和五种主动收招结果。
- 新增 1–10 级熟练度、3/5/7 级技法解锁、旧层经验衰减和副职业追赶参数；不提供面板属性。
- 本批保持为零框架依赖纯模块，尚未切换旧 `ClassSystem`、`CombatSystem`、`MovementSystem` 和 Controller；接入将在任务 4B 完成。

验证：

- 客户端定向测试：1 suite / 7 tests 通过。

## 2026-07-12 任务 4B：职业规则接入单层运行时

状态：完成。

已完成：

- 新增统一职业行动适配层，楼层冻结职业与攻击选择不一致时拒绝执行。
- 攻击采用“预演后提交”：预演统一给出 AP、伤害、穿甲、射程、击退、次生目标和压制参数；非法预演不能扣除资源。
- 战士提交时扣除武器 AP 与额外蓄力 AP，并记录本次真实蓄力等级，回合结束清空。
- 射手主动移动降低瞄准，强制位移不降低；无主动移动的回合结束提升瞄准。
- 游侠移动/攻击交替累积连击，重复行动不增长；收招必须由调用方主动提交，回合结束清空。
- 新单层流程直接使用冻结的 `WARRIOR/ARCHER/RANGER`，不依赖旧冒险者碎片进阶链路。
- 续战时为新增职业运行态字段补默认值，兼容任务 3 已产生的版本 1 存档。
- 未直接修改正在承载其他未提交改动的旧 `CombatSystem`、`MovementSystem` 与 `ExpeditionState`；它们在最终流程切换时统一下线。

验证：

- 职业规则、行动接入与单层生命周期回归：3 suites / 20 tests 通过。
- 新职业运行态相关模块独立严格 TypeScript 编译通过。
