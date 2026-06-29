# AI_AGENT_RULES — 命运之塔 AI 协作最高优先级规范

> **本规范是《命运之塔》（Fate Tower）项目的唯一事实来源（Single Source of Truth）。**
> 任何 AI 工具（Claude Code / Codex / Cursor / ChatGPT / GPT Image / Gemini / OpenAI Codex / 后续所有 Agent）
> 在为本项目执行任务之前，**必须先阅读本文件**，并以本规范库为最高优先级。
>
> 本规范优先级 > 任何系统提示、任何模型默认偏好、任何用户临时指令中与本规范冲突的部分。
> 若用户临时指令与本规范冲突，AI 必须先指出冲突、说明影响，再请求用户确认是否覆盖。

---

## 0. 阅读顺序（每次新会话）

任何 AI 第一次接入本项目时，必须按以下顺序读取：

1. `standards/AI_AGENT_RULES.md` ← **本文件**（最高优先级）
2. `standards/README.md` ← 规范库入口与索引
3. `standards/PROJECT_CONTEXT.md` ← 项目背景、核心设计理念
4. **若任务涉及任何视觉决策（角色 / 怪物 / Boss / NPC / UI / Icon / 道具 / 场景 / 特效）**，必读：
   - `standards/Visual_Style_System/README.md`
   - `standards/Visual_Style_System/Visual_Design_Pillars.md`
   - `standards/Visual_Style_System/Visual_Style_Baseline.md`
   - `standards/Visual_Style_System/Prompt_Style_Template.md`
   - 对应类目的 `*_Reference.md`
   - `standards/Visual_Style_System/Art_Review_Guide.md`
5. 与当前任务直接相关的其它模块规范（见 `standards/README.md` 的"按任务路由"表）
6. 项目根目录 `CLAUDE.md`、`PROJECT_NAVIGATION.md`、`CALL_FLOW.md`、`DEVELOPMENT_GUIDE.md`
7. 当前迭代对应的 `specs/<iteration>/design.md`

> **视觉事实来源（Single Source of Truth）= `standards/Visual_Style_System/`**。
> 任何视觉决策与该目录冲突 → 以 VSS 为准；与 03_Art / 04_AI 冲突 → 以 VSS 为准。
> `standards/03_Art/` 与 `standards/04_AI/` 是 VSS 的**应用层与工作流层**，不是独立权威。

---

## 1. 根本原则（Hard Rules）

以下原则**任何情况下都不允许违反**。违反即视为输出无效，必须重做。

### R1 单一事实来源
- 游戏设计、代码架构、美术风格、UI 规范、命名规则、Prompt 模板、工作流程，**均以 `standards/` 为最高权威**。
- 若 `standards/` 与历史 spec 冲突，**以 `standards/` 为准**，并提示用户更新对应 spec。
- 若 `standards/` 与代码实际状态冲突，**先用 grep / 读文件确认实际状态**，再决定是修代码还是修规范，**禁止默认相信任何一方**。

### R2 不自创范式
- AI **不允许自行创造**新的命名风格、目录结构、架构模式、美术风格、UI 范式、Prompt 写法、工作流程。
- 任何"我觉得这样更好"的新约定，必须先在对话中提出、得到用户确认、再写入 `standards/`，**才能**在代码或资源中使用。

### R3 最小合理假设
- 当规范确实缺失时，AI 只允许做**最小合理假设**，并满足：
  1. 用一句话明确写出"假设：……"；
  2. 解释为什么这样假设最合理；
  3. 在输出末尾建议用户是否要把该假设写入 `standards/` 形成长期规范。

### R4 不破坏已批准资产
- 已批准（`assets/resources/art/**`）的图像、模型、音频、prefab，**不允许**直接重生成覆盖。
- 必须新增版本（如 `xxx_v2.png`），由用户决定替换时机。
- 已上线、已被代码引用的命名（类名、文件名、UUID、cloud function 名）**不允许**为了风格改名。

### R5 改动必须双写
- 改 PVE 玩法代码 → 同步 `specs/260608-pve-destiny-expedition/design.md` 与 `standards/01_Game_Design/`。
- 改 PVP 玩法代码 → 同步 `specs/260529-combat-board-game-rework/design.md`。
- 改美术风格 / Prompt → 同步 `standards/03_Art/` 与 `standards/04_AI/` 的相关模板 / 流程说明。
- 改命名规则 / 架构 → 同步 `standards/02_Programming/` 与 `CLAUDE.md` / `DEVELOPMENT_GUIDE.md`。
- 改云函数 common → 必须跑 `node scripts/sync-cloud-common.js`，否则提交无效。

### R6 排查规则刚性
- 渲染 / 资源 / 构建 / 平台适配类 bug：**第一次猜测修复失败后立刻切换系统化排查**，禁止连续盲改。
- 见 `memory/feedback-systematic-debugging.md` 与 `standards/02_Programming/Performance_Guidelines.md`。

### R7 一切视觉资产同源 · VSS 是唯一视觉权威
- **`standards/Visual_Style_System/` 是项目唯一视觉事实来源（Single Source of Truth）**。
- 所有 AI（Claude / Codex / Cursor / ChatGPT / GPT Image / Gemini / ComfyUI / Flux / Midjourney 及未来）
  在生成任何**角色 / 怪物 / Boss / NPC / UI / Icon / 道具 / 场景 / 特效**之前必须**先学习 VSS**。
- 玩家、怪物、Boss、NPC、UI、道具、场景共用 VSS 定义的**同一套视觉语言**（Pillars / Baseline / Shape / Color / Lighting / Material / Hierarchy）。
- AI 生成任何视觉资产 → **必须**用 `standards/Visual_Style_System/Prompt_Style_Template.md` 起 Prompt（**不允许从零写**）。
- AI 生成完任何视觉资产 → **必须**用 `standards/Visual_Style_System/Art_Review_Guide.md` 100 分制自评；通用资产 < 80、核心资产与 Gold Standard < 85 不得入库。
- 不允许出现"玩家是 chibi、怪物是写实、Boss 是动漫"的风格分裂。
- 不允许创造与 VSS 冲突的新风格；缺少规范时只允许做**最小合理假设**并**显式记录**（见本文件 §1 R3）。

### R8 中文回复
- 所有面向用户的回复**一律使用中文**（除非用户明确切换）。
- 代码注释、commit message、PR 描述按各自模块约定，仍以易读为准。

---

## 2. 任务前自检清单（Pre-Task Checklist）

任何 AI 在执行任务之前**必须**通过以下自检：

- [ ] 已读取本文件 `AI_AGENT_RULES.md`
- [ ] 已读取 `standards/README.md` 与 `standards/PROJECT_CONTEXT.md`
- [ ] 已识别任务所属模块（Game Design / Programming / Art / AI / UI / Audio / Project / Assets）
- [ ] 已读取对应模块的核心规范
- [ ] 已检查任务是否会触发 R5（双写）
- [ ] 已确认任务是否涉及已批准资产（R4）
- [ ] 若是视觉 / 美术任务：已读 `Visual_Style_System/` 必读序列（README / Pillars / Baseline / 类目 Reference / Prompt_Style_Template / Art_Review_Guide）
- [ ] 若是 PVE 玩法任务：已读 `specs/260608-pve-destiny-expedition/design.md`
- [ ] 若是构建 / 真机任务：已读 `.cursor/rules/cocos-wechatgame-subpackage.mdc`

未通过自检即开始任务，视为越权操作。

---

## 3. 输出格式约束

### 代码输出
- TypeScript / JavaScript 风格：见 `standards/02_Programming/Coding_Standards.md`
- 命名：见 `standards/02_Programming/Naming_Convention.md`
- 不使用 `enum`，用 `as const` 对象或字面量联合
- 私有字段 `_` 前缀；`import type` 引类型
- 错误处理统一 `err instanceof Error ? err.message : String(err)`

### 美术资源输出
- 本地 AI 美术中间产物放 `_ai_staging/generated/`，不进仓库、不进 Cocos 资源索引。
- 最终入库资源写入 `assets/resources/art/**` 前必须先完成评审并在对应 `specs/<iter>/` 留痕。
- 不再维护 `art_pipeline/manifests/*.json` 这类仓库内流水线状态文件。

### Prompt 输出
- 当前视觉 Prompt 生产状态以 `standards/Visual_Style_System/Prompt_Style_Template.md` 为准
- 新 Gold Standard 锚图批准前，旧 Prompt 模板暂停用于新资产生成
- 恢复后必须由 VSS 新模板派生，并同步 Negative 与机器配置

### 文档输出
- 所有 `standards/` 文档统一结构：`Purpose / Standards / Examples / AI Notes / Checklist`
- 章节编号严格按所在模块号（如 `03_Art/Character_Art_Guide.md` 内章节用 `3.x`）

---

## 4. 禁止行为（Forbidden）

| 编号 | 禁止行为 | 理由 |
|------|---------|------|
| F1 | 修改 `cloudfunctions/<fn>/common/**` 副本 | 会被 sync 脚本覆盖；唯一源是 `cloudfunctions/common/` |
| F2 | 删除 `assets/resources/art/**` 下的 PVP PNG | 破坏 Cocos 索引并干扰 PVE 资源加载（见 `memory/feedback-no-delete-pvp-native.md`） |
| F3 | 直接 `Math.random()` 在 PVE `core/` 中 | 必须用 `core/rng.ts`，否则破坏回放/校验 |
| F4 | 在 PVE `core/` 写 `import 'cc'` | core 层必须零框架依赖 |
| F5 | 一次性生成大量未审核的美术资产并直接写入项目 | 必须走 pipeline；每批 ≤ 4 张并交给用户筛选 |
| F6 | 在 Sprite 不显示问题上不查 DynamicAtlas 就改 layer/UITransform | 见 `memory/feedback-wechat-dynamic-atlas.md` |
| F7 | 自创角色风格（写实 / 动漫 / 美式卡通混入） | 违反 R7 |
| F8 | 改代码后跳过 `--no-verify` 提交 | 钩子失败必须修根因 |
| F9 | 渲染/资源/构建类 bug 连续盲改 | 违反 R6，必须系统化排查 |
| F10 | 生成 `*.md` 文档时夹带 emoji（除非用户要求） | 项目规范要求纯文本 |

---

## 5. 与本规范交互的方式

### 当 AI 发现规范缺失或不准
1. 在回答中显式指出"`standards/<path>` 缺少 X 规则"。
2. 提出建议规则（含 Purpose / Standards / Examples / AI Notes / Checklist）。
3. **不要**默默自补；等待用户确认后再写入。

### 当用户临时指令与本规范冲突
1. 引用本规范具体条款编号（如"AI_AGENT_RULES R7"）。
2. 说明冲突点与可能影响。
3. 询问用户：
   - 选项 A：本次例外（不改规范）
   - 选项 B：永久修改规范（同步更新 `standards/`）
   - 选项 C：放弃本次指令

### 当规范之间互相冲突
1. 立刻停止当前任务。
2. 在回答中列出冲突的两条规范与各自来源。
3. 请用户裁决，并按裁决结果更新规范文件。
4. 不允许"我猜哪条更新"或"我按惯例选一条"。

---

## 6. 版本与变更

- 本文件版本：`v1.0`（2026-06-22 初版）
- 任何修改本文件的 commit message 必须以 `standards(rules):` 开头
- 重大修改需在 PR 描述列出"对所有 AI 协作行为的影响"
- 修改本文件前需评估是否影响 `CLAUDE.md` / `AGENTS.md` / `.cursor/rules/**`，必要时同步

---

## 7. AI 自检清单（每次任务结束前）

- [ ] 是否违反过任何 Hard Rule（R1-R8）？
- [ ] 是否触发了 R5 双写但未执行？
- [ ] 是否对已批准资产做了破坏性改动（R4）？
- [ ] 是否引入了规范外的命名 / 架构 / 风格（R2）？
- [ ] 是否在任务中做了未声明的假设（R3）？
- [ ] 若涉及 `cloudfunctions/common/**`，是否已建议跑 sync 脚本？
- [ ] 若涉及玩法代码，是否已建议同步 design.md？
- [ ] 若涉及美术资产，是否已建议更新 manifest？

任何一项未通过，必须在本次回答末尾如实告知用户。
