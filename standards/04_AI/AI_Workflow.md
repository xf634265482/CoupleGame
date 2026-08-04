# AI_Workflow — AI 任务生命周期

## Purpose

定义任何 AI 任务从"接到需求"到"产物入库"的标准生命周期；让所有 AI 工具按同一节奏与人协作。

## Standards

### 1. 任务七阶段

```
[1] Understand    阅读规范 + 澄清意图
[2] Plan          列出步骤 + 风险 + 假设
[3] Generate      按模板产出
[4] Self-Check    自检对照本规范库
[5] Present       提交给人类
[6] Iterate       根据反馈修改
[7] Integrate     入库 + 更新 manifest + 同步 design.md
```

### 2. 每阶段约束

#### Understand
- 必读：`AI_AGENT_RULES.md` → `README.md` → 任务对应模块
- 不明意图时**先问**，不要边猜边做
- 写出"任务输入 / 期望输出 / 不在范围"三条

#### Plan
- 列 3~7 步可验证步骤
- 标注哪一步可能违反 Hard Rule（R1~R8）
- 标注假设（最小合理假设原则 R3）
- 工作量超过 30 分钟先与用户确认

#### Generate
- 严格用对应模板
- 不"现编"风格 / 命名 / 架构
- 多次生成时记录 seed / 参数以便复现

#### Self-Check
- 跑对应模块 README 的 Checklist
- 跑 `AI_AGENT_RULES.md` §7 自检
- 不通过则回 Generate 或回 Plan

#### Present
- 简明列出"产出物 / 已做的 / 没做的 / 假设 / 风险"
- 若有 Hard Rule 例外情况必须显式说明

#### Iterate
- 人类反馈优先级 > 规范优先级（同一回合）
- 但若反馈与规范长期冲突，按 `AI_AGENT_RULES.md` §5 处理

#### Integrate
- 美术资产 → 对应 `specs/<iter>/` 的评审 / 交付记录
- 代码 → 跑测试 + 同步 `cloudfunctions/common/` sync 脚本（如适用）
- 玩法 → 同步 `specs/<iter>/design.md`
- 规范变更 → 更新 `standards/`

### 3. 多 AI 协作

- 同一会话不要同时 spawn 多个 Agent 做同一件事
- spawn Agent 前先用 `standards/README.md` "按任务路由"判断该任务模块归属
- Agent 完成后必须在主会话验证产物，不只信摘要

### 4. 失败处理

- 渲染 / 资源 / 构建类 bug → `AI_AGENT_RULES.md` R6 系统化排查
- 生成质量不行 → 调 Prompt 不是改规范
- 规范不能覆盖问题 → 先在对话提案补规范，再做

### 5. 审计可追溯

- 重要 AI 输出（设计 / Prompt / 大段代码）应在 commit message 或 PR 描述里标记 `[AI-assisted]` 并指明用的什么模型
- AI Prompt 应保留在 `_ai_staging/generated/` 或对应 `specs/<iter>/` 记录中，不要"用完即删"

## Examples

### 正确
> 任务："设计第 3 章普通怪"
> [1] 读 AI_AGENT_RULES / Character_Art_Guide / Monster_Design / Monster_Prompt_Template
> [2] Plan 3 步：选剪影家族 → 填模板 → 走 pipeline
> [3] Generate Prompt
> [4] Self-Check Monster_Prompt_Template Checklist
> [5] Present 给用户
> [6] 根据反馈调
> [7] 入 pipeline + 更新 manifest

### 错误
> 直接生成图 → 没读规范 → 没自检 → 不入库

## AI Notes

- 任何 AI 必须能复述本 §1 七阶段
- 节奏：宁慢勿错；本项目重视一次性合格率而不是出货速度
- "我以为这样更好"在本项目里几乎总是错的，规范优先

## Checklist

- [ ] 我走完 7 个阶段
- [ ] 每阶段约束都满足
- [ ] 产物可追溯（manifest / commit 标注）
- [ ] 没有越过 Hard Rule
