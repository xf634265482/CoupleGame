# Multi-Model Handoff

## 给 Claude Code 的一句话

《命运之塔》已完成 VSS v2.0 视觉规则统一并进入 Gold Standard Phase 1，第一章普通楼层背景已选“云暮哥布林前哨庭 A（边境防御前哨）”，请只按 `specs/260622-visual-upgrade-v1/` 的任务板与验收流程推进候选资产、评审和版本化接入，禁止使用旧蓝发/苔藓石格 Prompt、直接覆盖工程资源或跳过用户确认。

## Current State

- Phase 0 已完成。
- VSS v2.0 已成为唯一视觉权威。
- 旧锚图已降级为历史参考。
- 旧 Prompt 与机器 Style Anchor 已暂停。
- 第一章普通楼层背景方向已选择 A。
- 已选参考图：
  `specs/260622-visual-upgrade-v1/references/gs-bg-ch1-goblin-outpost-selected-a.png`
- 该图尚不是最终工程资产；仍需构图校正、评分、真机验证和用户批准。

## Authority Order

1. `standards/AI_AGENT_RULES.md`
2. `standards/Visual_Style_System/`
3. `specs/260608-pve-destiny-expedition/design.md`：章节内容与玩法身份
4. `specs/260622-visual-upgrade-v1/`：当前视觉升级任务与状态
5. `03_Art / 04_AI / 05_UI`：执行层
6. 历史锚图与旧资产：仅历史参考

## Hard Stops

- 不得批量生成全部剩余资产。
- 每批最多四个候选。
- 不得直接写入 `assets/resources/art/**`。
- 不得覆盖已接入 PNG 或破坏 `.meta`。
- 不得把生成图标记为 approved/integrated。
- 未经用户选择，不进入 selected。
- 未通过 85 分、真机验证和用户批准，不得成为 Gold Standard。

