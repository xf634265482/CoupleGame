# Task_Workflow — 任务流程

## Purpose

定义任何任务从"提出"到"合并"的标准流程。

## Standards

### 1. 任务生命周期

```
[1] 提出 (Issue / 对话需求)
[2] 立 spec (specs/<date>-<slug>/design.md)
[3] 分解任务 (TaskCreate)
[4] 实施 (按 standards/04_AI/AI_Workflow.md 七阶段)
[5] 自检 (各模块 Checklist)
[6] 提交 (commit + 双写)
[7] 验收 (与 spec 对照)
[8] 合并 / 关闭
```

### 2. 立 spec 阈值

- 工作量 ≥ 1 天 → 立 spec
- 涉及玩法 / 美术 / UI 重大变更 → 必立
- 一行修复 / 文档 typo → 不必

### 3. spec 结构

```
specs/<date>-<slug>/
├── design.md           # 设计与决策
├── ac.md               # 验收标准（可选合并到 design）
├── ddl-sql.md          # 数据库变更（如有）
└── notes/              # 散记
```

`<date>` 用 6 位 YYMMDD；`<slug>` kebab-case。

### 4. AI 协作约定

- AI 接到任务先按 `AI_AGENT_RULES.md` §2 自检
- AI 写代码遵循 `02_Programming/AI_Coding_Rules.md`
- AI 生成美术遵循 `04_AI/AI_Workflow.md`

### 5. Commit / PR

- commit 前缀：`feat(<scope>):` / `fix(<scope>):` / `docs(<scope>):` / `standards(<module>):` / `chore:`
- PR 标题 ≤ 70 字符
- PR 描述列出"做了什么 / 没做什么 / 风险 / 测试"

### 6. 不允许

- ❌ 大段重构混入功能 PR
- ❌ 跳过 spec 直接动主分支
- ❌ commit message 写 "update"
- ❌ AI 自主合并

## Checklist

- [ ] 是否需要 spec 已判断
- [ ] 任务被 TaskCreate 跟踪
- [ ] 触发的双写都做了
- [ ] commit message 有 scope
- [ ] 验收对齐 spec
