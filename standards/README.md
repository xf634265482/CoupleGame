# 命运之塔 · AI Development Standards

> 本目录是《命运之塔》（Fate Tower / 工作代号 PVE Destiny Expedition）的 **AI 开发规范库**。
> 所有面向项目工作的 AI 工具（Claude Code / Codex / Cursor / ChatGPT / GPT Image / Gemini 等）
> 都必须以本目录为唯一事实来源。
>
> **第一次接入项目，请先读 `AI_AGENT_RULES.md`。**

---

## 入口（必读，按顺序）

| 顺序 | 文件 | 说明 |
|------|------|------|
| 1 | [`AI_AGENT_RULES.md`](AI_AGENT_RULES.md) | **最高优先级**。所有 AI 协作的硬性规则与禁止行为 |
| 2 | [`README.md`](README.md) | 本文件。规范库目录与路由 |
| 3 | [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) | 项目背景、世界观、核心设计理念 |
| 4 | [`Visual_Style_System/README.md`](Visual_Style_System/README.md) | **视觉事实来源（Single Source of Truth）**。任何视觉决策都必须先读 |

---

## 目录结构

```
standards/
├── AI_AGENT_RULES.md          # 最高优先级规范
├── README.md                  # 本文件（入口与路由）
├── PROJECT_CONTEXT.md         # 项目背景与核心设计理念
│
├── Visual_Style_System/       # ★ 视觉事实来源（Art Bible）★
│   ├── README.md
│   ├── Visual_Design_Pillars.md
│   ├── Visual_Style_Baseline.md
│   ├── Shape_Language.md
│   ├── Color_Language.md
│   ├── Lighting_Guide.md
│   ├── Material_Library.md
│   ├── Visual_Hierarchy.md
│   ├── Character_Reference.md
│   ├── Monster_Reference.md
│   ├── Boss_Reference.md
│   ├── UI_Reference.md
│   ├── Icon_Reference.md
│   ├── Item_Reference.md
│   ├── Environment_Reference.md
│   ├── Art_Review_Guide.md
│   └── Prompt_Style_Template.md
│
├── 01_Game_Design/            # 玩法设计规范
│   ├── README.md
│   ├── Game_Overview.md
│   ├── Core_Gameplay.md
│   ├── Battle_System.md
│   ├── Dungeon_System.md
│   ├── Boss_Design.md
│   ├── Monster_Design.md
│   ├── Item_System.md
│   ├── Progression.md
│   └── Glossary.md
│
├── 02_Programming/            # 工程规范
│   ├── README.md
│   ├── Code_Architecture.md
│   ├── Coding_Standards.md
│   ├── File_Structure.md
│   ├── Naming_Convention.md
│   ├── Asset_Loading.md
│   ├── Performance_Guidelines.md
│   └── AI_Coding_Rules.md
│
├── 03_Art/                    # 美术规范（核心：Character_Art_Guide）
│   ├── README.md
│   ├── Character_Art_Guide.md   ← 角色美术总纲（最重要）
│   ├── Environment_Art_Guide.md
│   ├── UI_Art_Guide.md
│   ├── Item_Art_Guide.md
│   ├── Icon_Style_Guide.md
│   ├── Color_System.md
│   ├── Material_Library.md
│   ├── Animation_Guide.md
│   └── VFX_Guide.md
│
├── 04_AI/                     # AI 协同与 Prompt 规范
│   ├── README.md
│   ├── Prompt_Standards.md
│   ├── Character_Prompt_Template.md
│   ├── Monster_Prompt_Template.md
│   ├── Boss_Prompt_Template.md
│   ├── UI_Prompt_Template.md
│   ├── Item_Prompt_Template.md
│   ├── Prompt_Negative.md
│   └── AI_Workflow.md
│
├── 05_UI/                     # UI 规范
│   ├── README.md
│   ├── UI_Rules.md
│   ├── HUD_Guide.md
│   ├── Popup_Guide.md
│   ├── Button_Guide.md
│   ├── Icon_Size.md
│   ├── Layout_System.md
│   └── Responsive.md
│
├── 06_Audio/                  # 音频规范
│   ├── README.md
│   ├── Music_Guide.md
│   ├── SFX_Guide.md
│   └── Voice_Guide.md
│
├── 07_Project/                # 项目管理
│   ├── README.md
│   ├── Development_Roadmap.md
│   ├── TODO.md
│   ├── Milestones.md
│   ├── Task_Workflow.md
│   └── Release_Checklist.md
│
├── 08_Assets/                 # 资产规范
│   ├── README.md
│   ├── Naming.md
│   ├── Folder_Structure.md
│   ├── Import_Settings.md
│   └── Asset_Quality_Checklist.md
│
└── 09_Examples/               # 示例集
    ├── README.md
    ├── Character_Examples.md
    ├── Monster_Examples.md
    ├── UI_Examples.md
    └── Prompt_Examples.md
```

---

## 按任务路由（AI 必须按此选择阅读路径）

> **视觉类任务一律先读 `Visual_Style_System/`**，它是项目唯一的视觉事实来源。
> 03_Art / 04_AI 仍可读，但与 VSS 冲突时以 VSS 为准。

| 你要做什么 | 必读 | 强烈建议 |
|-----------|------|---------|
| 写 / 改 TypeScript 代码 | `AI_AGENT_RULES` · `02_Programming/Coding_Standards` · `02_Programming/Naming_Convention` | `02_Programming/File_Structure` · `02_Programming/AI_Coding_Rules` · `CLAUDE.md` |
| 接入 / 改 PVE 玩法 | `AI_AGENT_RULES` · `01_Game_Design/Core_Gameplay` · `01_Game_Design/Battle_System` | `specs/260608-pve-destiny-expedition/design.md` · `01_Game_Design/Dungeon_System` |
| 设计怪物 | `AI_AGENT_RULES` · **`Visual_Style_System/Monster_Reference`** · **`Visual_Style_System/Character_Reference`** · **`Visual_Style_System/Prompt_Style_Template`** · `01_Game_Design/Monster_Design` | VSS 基础层 5 份 · `09_Examples/Monster_Examples` |
| 设计 Boss | `AI_AGENT_RULES` · **`Visual_Style_System/Boss_Reference`** · **`Visual_Style_System/Character_Reference`** · **`Visual_Style_System/Prompt_Style_Template`** · `01_Game_Design/Boss_Design` | VSS 基础层 5 份 |
| 设计 / 生成角色 | `AI_AGENT_RULES` · **`Visual_Style_System/README` + `Visual_Design_Pillars` + `Visual_Style_Baseline`** · **`Character_Reference`** · **`Prompt_Style_Template`** | VSS 基础层 5 份 · `03_Art/Animation_Guide` |
| 设计 / 生成 UI | `AI_AGENT_RULES` · **`Visual_Style_System/UI_Reference`** · **`Visual_Style_System/Prompt_Style_Template`** · `05_UI/UI_Rules` | `05_UI/Button_Guide` · `05_UI/Icon_Size` |
| 设计 / 生成 HUD | `AI_AGENT_RULES` · **`Visual_Style_System/UI_Reference`** · `05_UI/HUD_Guide` | `05_UI/Layout_System` · `05_UI/Responsive` |
| 设计 / 生成图标 | `AI_AGENT_RULES` · **`Visual_Style_System/Icon_Reference`** · **`Visual_Style_System/Prompt_Style_Template`** · `05_UI/Icon_Size` | `Visual_Style_System/Color_Language` |
| 设计 / 生成道具 | `AI_AGENT_RULES` · **`Visual_Style_System/Item_Reference`** · **`Visual_Style_System/Icon_Reference`** · **`Prompt_Style_Template`** | `01_Game_Design/Item_System` |
| 设计 / 生成场景 / Tile / 背景 | `AI_AGENT_RULES` · **`Visual_Style_System/Environment_Reference`** · **`Prompt_Style_Template`** | `Visual_Style_System/Color_Language` |
| 视觉评审 / 资产入库前自检 | `AI_AGENT_RULES` · **`Visual_Style_System/Art_Review_Guide`** | `08_Assets/Asset_Quality_Checklist` |
| 接入 / 优化音频 | `AI_AGENT_RULES` · `06_Audio/Music_Guide` · `06_Audio/SFX_Guide` | — |
| 资产命名 / 入库 | `AI_AGENT_RULES` · `08_Assets/Naming` · `08_Assets/Folder_Structure` · `08_Assets/Import_Settings` | `02_Programming/Asset_Loading` |
| 准备发版 | `AI_AGENT_RULES` · `07_Project/Release_Checklist` · `02_Programming/Performance_Guidelines` | `08_Assets/Asset_Quality_Checklist` |
| 撰写新规范 | `AI_AGENT_RULES` · `04_AI/AI_Workflow` | 任意已有规范作为模板 |

---

## 文档统一结构

所有 `standards/` 下的规范文档**必须**遵循以下章节顺序：

```markdown
# <Title>

## Purpose
目的：这份规范解决什么问题，给谁看。

## Standards
规范条款（按 X.Y 编号，可作为引用锚点）。

## Examples
正确示例 / 错误示例 对照。

## AI Notes
AI 在使用此规范时的特别注意事项（陷阱、常见误用、与其他规范的交叉点）。

## Checklist
自检清单，最后一道防线。
```

---

## 与项目其他文档的关系

| 文档 | 关系 |
|------|------|
| `CLAUDE.md`（项目根） | 项目级 AI 指南，**与本规范并列**。冲突时以 `standards/` 为准；`CLAUDE.md` 的简短规则视为本规范的快捷摘要 |
| `AGENTS.md`（项目根） | 多 Agent 协作约定，**优先级低于** `AI_AGENT_RULES.md` |
| `PROJECT_NAVIGATION.md` | 代码地图，本规范在"找代码"问题上指向它 |
| `CALL_FLOW.md` | 调用链文档，本规范在"理解流程"问题上指向它 |
| `DEVELOPMENT_GUIDE.md` | 工程惯例，与 `02_Programming/` 互补；冲突时以 `02_Programming/` 为准 |
| `specs/<iter>/design.md` | 单次迭代设计文档，**实现细节权威**；与本规范冲突时按"玩法细节走 specs，跨迭代规则走 standards"区分 |
| `art_pipeline/` | 美术生产流水线；本规范定义"应该长什么样"，pipeline 负责"怎么生成出来" |
| `.cursor/rules/**` | Cursor 专用规则文件，是本规范的子集 / 摘要 |
| `memory/**` | 跨会话个人化记忆，**不属于** project standards，不强制其他 AI 遵守 |

---

## 维护方式

- 新增规范：先在对话中得到用户确认，再写入对应模块；同时更新本 README 的目录与路由表
- 修改规范：commit message 用 `standards(<module>):` 前缀
- 废弃规范：不删，标记 `> **Deprecated v1.x**：原因 / 替代方案`，保留 1 个版本周期
- 规范冲突：参见 `AI_AGENT_RULES.md` §5

---

## 当前版本

- `v1.0`（2026-06-22）骨架与核心治理文档；Character_Art_Guide 完整；其余模块持续迭代
- 见 `07_Project/Development_Roadmap.md` 了解规范库后续完善计划
