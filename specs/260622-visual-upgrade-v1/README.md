# Visual Upgrade V1

## Purpose

本目录承载《命运之塔》VSS v2.0 生效后的视觉升级执行资料。

当前阶段：Phase 3 Gold Standard 交互物。宝箱、钥匙、共享传送门和恢复温泉均已接入，等待真机组合验证。

## Documents

| 文件 | 用途 |
|------|------|
| `visual-upgrade-roadmap-v1.md` | 已批准的完整视觉升级路线图 |
| `visual-audit-v1.md` | 当前真机视觉审计与问题优先级 |
| `gold-standard-assets-v1.md` | Gold Standard 制作顺序、规格与验收 |
| `existing-asset-disposition-v1.md` | 现有资产保留、重制、归档策略 |
| `multi-model-handoff.md` | Claude Code、ChatGPT 与其他模型的统一交接 |
| `multi-model-art-brief.md` | 所有绘图模型必须遵守的绘制标准与资产 Brief |
| `ai-art-production-workflow.md` | 用户调度多模型完成剩余美术的操作流程 |
| `asset-task-board-v1.md` | 剩余资产任务、顺序、状态和建议分工 |
| `phase3-interactables-design.md` | Phase 3 交互物家族、尺寸、动态与真机验收规则 |

## Current Selection

- 第一章普通楼层背景选择 A：“云暮哥布林前哨庭·边境防御前哨”。
- 正式修订：`references/gs-bg-ch1-goblin-outpost-a-revision-1.png`。
- C 方向仅保留为第一章 Boss 层构图参考。
- 背景当前状态为 `integrated-pending-device`。
- Gold Standard 玩家已选择候选 H：约 1.9 头身、大头短身、手持短剑。
- 玩家正式候选：`selected/gs-player-h-final-1024.png`。
- 玩家运行资源：`assets/resources/art/ui/pve/map/icon_player.png`，原 UUID 保留。
- 玩家状态：`integrated-pending-device`；VSS 已同步新头身与持剑规则。
- Phase 3 宝箱与钥匙选择 C Revision 1：塔庭拱形宝箱与同族青晶钥匙。
- 选中源：`art_pipeline/selected/fate-v2-gs-chest-key-c-rev1/`。
- 宝箱与钥匙运行资源已保留原 UUID 接入，状态为 `integrated-pending-device`。
- 普通出口与 Boss 传送门最终统一使用当前青色石拱门；分别使用 84×84 与 128×128 版本并保留各自 UUID。
- 阶梯出口 A Revision 1 仅保留为历史候选，不再作为现行规则。
- 恢复温泉已采用圆形青水泉池、柔金十字与两缕暖白蒸汽版本。
- 玩家使用 256 px / 5 px 外描边；宝箱、钥匙、温泉使用 84 px / 2 px 外描边，颜色统一为 `#17243A`。

## Hard Gate

- Phase 0 完成前不生成新资源。
- 新 Gold Standard 资产只进入候选路径，不直接覆盖工程资源。
- 每批最多四个候选，并由用户选择。
- 核心资产评分不得低于 85。
- 新组合锚图通过真机验证和用户批准后，旧 Prompt 才能解除暂停。
