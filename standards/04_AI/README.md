# 04_AI — AI 协同与 Prompt 规范（VSS 工作流层）

> **关系声明**：自 VSS v1.0 起，视觉类 Prompt 的**唯一权威模板**是 [`Visual_Style_System/Prompt_Style_Template.md`](../Visual_Style_System/Prompt_Style_Template.md)。
> 本模块的 `*_Prompt_Template.md` 与 `Prompt_Negative.md` 是 VSS 模板的**应用速查与历史链接**；与 VSS 冲突以 VSS 为准。
> 本模块的 `AI_Workflow.md` 与 `Prompt_Standards.md` 仍然有效（管流程与通用结构），与 VSS 互补不冲突。

## Purpose

让本项目所有 AI 调用（文本 / 图像 / 代码 / 设计辅助）使用统一标准，输出可预期、可复用、可被人工审批。

## Standards

### 4.0 模块清单

| 文件 | 范围 |
|------|------|
| [`Prompt_Standards.md`](Prompt_Standards.md) | 所有 Prompt 的通用结构 / 写作规范 |
| [`Character_Prompt_Template.md`](Character_Prompt_Template.md) | 玩家 / NPC 类角色 |
| [`Monster_Prompt_Template.md`](Monster_Prompt_Template.md) | 普通 / 精英怪物 |
| [`Boss_Prompt_Template.md`](Boss_Prompt_Template.md) | 章节 Boss |
| [`UI_Prompt_Template.md`](UI_Prompt_Template.md) | 面板 / 背景 / 按钮 |
| [`Item_Prompt_Template.md`](Item_Prompt_Template.md) | 武器 / 道具 / 卷轴 / 遗物 |
| [`Prompt_Negative.md`](Prompt_Negative.md) | 全局 Negative Prompt |
| [`AI_Workflow.md`](AI_Workflow.md) | AI 任务生命周期、审批流程、迭代规则 |

### 4.1 元规则

1. **任何图像生成 Prompt 必须基于本目录模板**，禁止"现编"。
2. **任何模板的"风格段落"必须引用** `art_pipeline/styles/pve_fantasy.json` 中的 `style[]` 字段，避免人工 paraphrase 偏移。
3. **每次生成必须附加** `Prompt_Negative.md` 全文。
4. **Prompt 不允许涉及外部艺术家名字、品牌、知名 IP**。
5. **生成结果必须走 `art_pipeline/` 流程**，不直接覆盖项目资产。

### 4.2 与 03_Art 的关系

| 03_Art 章节 | 04_AI 实现 |
|------------|----------|
| Character_Art_Guide §1 风格定位 | 写入 Prompt 风格段落 |
| §7 描边规范 | 写入 Prompt constraints |
| §10 缩放可读性 | 写入 Prompt composition |
| §12 色彩规范 | 填入模板的 main/sub/accent |
| §15 Negative | → `Prompt_Negative.md` |

## Examples

### 正确
> 用 `Monster_Prompt_Template.md` 填空，附加 `Prompt_Negative.md`，走 pipeline

### 错误
> AI 自行写 "in the style of Studio Ghibli" → 违反 §4.1.4

## AI Notes

- 模板里 `{xxx}` 占位符必须全部填空才能提交
- Prompt 写好后必须粘到 `art_pipeline/manifests/*.json` 的对应 entry 里保留可追溯

## Checklist

- [ ] 用了正确模板
- [ ] 附加了 Prompt_Negative
- [ ] 引用了 pve_fantasy.json 风格段
- [ ] 走了 pipeline
