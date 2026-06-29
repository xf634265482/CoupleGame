# Prompt_Standards — Prompt 执行规范

## Purpose

定义 Prompt 工作流。视觉内容与风格字段全部由 VSS `Prompt_Style_Template.md` 决定。

## Standards

### 1. 当前状态

视觉 Prompt 生产暂停。新 Gold Standard 锚图批准前，不允许使用历史模板生成正式新资产。

### 2. 恢复后

- 只从 VSS 新模板派生。
- 不复制或改写 Style Anchor。
- 必须使用新锚图、章节主题、Deep Navy Charcoal 轮廓和手机可读规则。
- Prompt、Negative、机器 JSON、示例必须一次性同步。
- 所有生成继续走 pipeline、评分、真机验证和人类批准。

## Examples

正确：当前只编写路线图和 Gold Standard 制作计划。

错误：手动替换旧模板里的玩家发色后继续生成。

## AI Notes

任何类目模板与 VSS 暂停状态冲突时，以 VSS 为准。

## Checklist

- [ ] 已检查 VSS Prompt 状态
- [ ] 未使用历史模板生成新资产
- [ ] 恢复后从唯一模板派生
