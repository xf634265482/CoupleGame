# Visual Audit V1

## Audit Metadata

- Version: V1
- Date: 2026-06-22
- Scope: PVE 命运远征
- Standard: VSS v2.0
- Primary device evidence: `.superpowers/brainstorm/codex-20260622-expedition/content/current-device.jpg`
- Direction reference: `.superpowers/brainstorm/codex-20260622-expedition/content/design-reference.png`
- Historical style reference: `art_pipeline/references/pve-style-reference.png`
- Device model / exact resolution: 尚未记录；下一次真机构建必须补充

## Executive Finding

当前首要问题不是角色精度不足，而是背景、逐格地砖、迷雾、HUD、战报与操作区同时争夺注意力，造成视觉层级失序。角色与交互物被高频纹理吞没，文字阅读区也缺乏稳定、安静的承载面。

因此升级顺序必须是：

战场骨架 → 玩家比例尺 → 交互物 → 怪物/Boss → UI Kit。

## Findings

### VA-001 · 背景与棋盘同时高噪声

- Severity: P0
- Evidence: `current-device.jpg`
- VSS: Baseline §9；Environment §2~§4
- Observation:
  - 背景拥有高饱和蓝紫云层、遗迹和亮点。
  - 已探索格使用高亮、重复、完整石纹。
  - 迷雾仍显示大量内部纹理。
  - 三层纹理叠加后，玩法主体难以跳出。
- Impact: 玩家、怪物、出口和范围状态辨认吃力。
- Resolution:
  - 使用连续半透明战场平面。
  - 格线改为代码绘制。
  - 棋盘中部背景降细节和对比度。
  - 取消逐格完整地砖。
- Status: Open / Phase 1

### VA-002 · 玩家主体偏小

- Severity: P0
- Evidence: `current-device.jpg`
- VSS: Baseline §3、§11、§12
- Observation: 玩家虽然位于画面中心附近，但主体面积不足，脸、服装和身份标志需要费力辨认。
- Impact: 玩家无法成为稳定第一焦点。
- Resolution:
  - 占格提升到 75%~82%。
  - 真机主体高度原则上不低于约 64 px。
  - 保持完整深海军蓝轮廓。
  - 使用低强度青色命运环。
- Status: Open / Phase 2

### VA-003 · 迷雾视觉重量过高

- Severity: P1
- Evidence: `current-device.jpg`
- VSS: Baseline §10
- Observation: 迷雾色彩鲜艳、纹理重复，与场景和已探索区形成高频竞争。
- Impact: 未探索区比玩家与交互物更抢眼。
- Resolution:
  - 中心遮蔽 90%~100%。
  - 低饱和深蓝主体。
  - 少量蓝紫星点和云纹。
  - 0.3 秒探索淡出。
- Status: Open / Phase 1

### VA-004 · 旧地砖造成重复拼贴感

- Severity: P1
- Evidence: `current-device.jpg`
- VSS: Baseline §9
- Observation: 每格重复相同石纹，地图表现像拼贴表格而非连续可行走空间。
- Impact: 世界感被棋盘纹理切碎，角色出现漂浮或贴图感。
- Resolution: 废止逐格完整地砖，改连续平台与代码格线。
- Status: Open / Phase 1

### VA-005 · HUD 信息层级平均

- Severity: P1
- Evidence: `current-device.jpg`
- VSS: UI Reference §8
- Observation: 章节、HP、AP、金币、灵气、钥匙和碎片平铺在同一大面板，缺少阅读顺序。
- Impact: 玩家需要来回搜索当前敌人、玩家状态和局外资源。
- Resolution:
  - 采用已批准 A V4 信息流。
  - 顶部第一层关卡与碎片。
  - 第二层怪物卡 60% + 资源区 40%。
  - 战场下方战报与玩家卡 6:4。
- Status: Layout approved / Visual skin pending Phase 5

### VA-006 · 文字阅读区不够稳定

- Severity: P0
- Evidence: `current-device.jpg`
- VSS: UI Reference §2~§3
- Observation: 文字字号、字重和背景承载不统一；战报与资源信息在高噪声画面中显得偏轻。
- Impact: 正常握持距离阅读吃力。
- Resolution:
  - 阅读区 88%~95% 不透明。
  - 正文 20~22，中粗。
  - 辅助信息不低于 18。
  - 禁止缩字塞内容。
- Status: Open / Phase 5

### VA-007 · 操作按钮视觉体系陈旧且层级不清

- Severity: P1
- Evidence: `current-device.jpg`
- VSS: UI Reference §4
- Observation: 攻击、互动、结束回合和低频入口使用相近的厚重旧框体，主次主要依赖位置。
- Impact: 核心操作识别速度不足，整体与天空幻想世界脱节。
- Resolution:
  - 攻击最高对比。
  - 互动蓝金次级。
  - 结束回合降饱和。
  - 返回/角色降视觉重量但保持尺寸。
- Status: Open / Phase 5

### VA-008 · 方向键真机辨认与触控风险

- Severity: P1
- Evidence: existing handoff and A V4 review
- VSS: UI Reference §4
- Observation: 方向键视觉尺寸和箭头笔画偏小。
- Resolution:
  - 中列内放大约 20%~30%。
  - 箭头加粗、提高对比。
  - 点击区不得小于约 76×76。
- Status: Open / Phase 5

### VA-009 · 当前角色身份仍未形成正式 Gold Standard

- Severity: P0
- Evidence: current player asset and conflicting historical anchor
- VSS: Character Reference §2
- Observation: 当前棕发玩家方向已确认，但尚无通过 VSS v2.0 评分和真机验证的正式源资产。
- Impact: 后续职业、怪物比例和新 Prompt 缺少最终角色比例尺。
- Resolution: Phase 2 制作 Gold Standard 玩家。
- Status: Open / Phase 2

### VA-010 · 现有资源全部标记 integrated，但不等于符合 VSS v2.0

- Severity: P1
- Evidence: `art_pipeline/manifests/pve_ui.json`
- Observation: 当前 manifest 含 96 项 integrated 资产，但状态仅代表旧流水线已接入，不代表通过新规范。
- Impact: 后续 Agent 可能误把全部现有资源视为继续沿用的视觉标准。
- Resolution:
  - 保留 integrated 技术状态。
  - 另建 VSS v2.0 disposition 状态。
  - 禁止直接批量改 manifest，待逐批确认。
- Status: Open / Phase 0

## Current Audit Limits

- 当前真机截图早于部分 A V4 代码和布局调整，不能证明最新构建状态。
- 缺少设备型号、实际像素尺寸和顶部/中部/底部三状态截图。
- 缺少 Boss、弹窗、命运树与大厅的同设备截图。

下一轮真机证据必须补齐这些信息。

## Art Direction Correction 2026-06-22

第一轮 Phase 1 背景候选 A/B/C 仅表达了天空塔庭世界氛围，未充分关联第一章哥布林族群、哥布林酋长、增援号角与入门探索内容，因此不进入 Gold Standard 评审。

后续所有章节背景必须通过 VSS Baseline §8.1 的“统一世界身份 + 章节内容身份”双重检查。
