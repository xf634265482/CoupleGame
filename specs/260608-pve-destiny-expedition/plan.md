# PVE「命运远征」开发计划

> 完整背景、关键决策与编码规范见根计划文件 `d-desktop-pve-txt-pve-cocos2d-valiant-shore.md`；玩法与 AC 见 `design.md`；任务拆解见 `tasks.md`；编码强约束见 `.cursor/rules/pve-module.mdc`。本文件只记录实现策略要点。

## 1. 整体策略

- **客户端模拟 + 云端校验**：局内玩法（迷雾/AP/战斗/AI）在 `assets/scripts/pve/core` 即时运行；`pve` 云函数仅存档与奖励边界校验入账。
- **垂直切片优先**：M1 只做第一章 1~5 层，端到端打通核心循环（迷雾 8×8 + AP + 移动/普攻 + 普通怪 + 宝箱/钥匙/出口门 + 灵气强化简版 + Boss 哥布林酋长 + 自动存档 + 续玩）。
- **核心逻辑 TDD**：`pve/core` 零框架依赖、确定性、种子化 RNG，ts-jest 单测。

## 2. 分层

```
core (纯逻辑/权威, ts-jest)  →  controllers (cc.Component, 输入/动画编排)  →  views (普通类, 纯渲染)
        ↓ 仅在结算/入账边界
cloudfunctions/pve (存档 + 奖励校验)
```

## 3. 关键决策（PD）

| ID | 决策 | 选择 | 理由 |
|----|------|------|------|
| PD1 | 权威模型 | 客户端模拟 + 云端存档/校验 | AP 逐格操作多、需碎片化游玩，全云端权威延迟与成本不可接受；单人作弊只影响自身，钻石/碎片入账由云端边界校验兜底 |
| PD2 | RNG | 种子化确定性 PRNG（mulberry32） | 可复现、云端可复算、存档续算 |
| PD3 | 里程碑 | 垂直切片（第一章） | 先验证 3~5 分钟核心手感再横向扩展 |
| PD4 | 测试 | ts-jest 单测 core | 核心逻辑可回归、重构安全 |
| PD5 | 测试位置 | repo 根 `test/`（不在 assets/） | 避免被 Cocos 编译进游戏包 |
| PD6 | 文档 | 独立 design.md + 独立 .cursor 规则 | PVE 与 PVP 完全独立，避免主文档冲突 |

## 4. 实现顺序

P0 文档与脚手架（✅）→ P1 核心逻辑（11 模块 TDD）→ P2 客户端场景与表现 → P3 网络与存档 → P4 测试与验收。详见 `tasks.md`。

## 5. 验证策略

| 层面 | 方式 |
|------|------|
| core 纯逻辑 | ts-jest：地图/AP/战斗/AI/掉落/通关/存档往返；同种子确定性 |
| 客户端编译 | TypeScript 通过；core 无 `cc` 依赖 |
| 场景联调 | 微信开发者工具进入远征场景走核心循环 |
| 云端 | 本地调试 loadSave/saveFloor/settleRun；越界奖励被拒 |
| 真机 | 重建 → 压缩 → patch → 真机（资源红线见 cocos-wechatgame-subpackage.mdc） |
| 验收 | design.md AC-1～AC-14 走查 |
