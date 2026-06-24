# AI Art Production Workflow

## Purpose

指导用户调度 Claude Code、ChatGPT 和其他绘图模型完成剩余资产，同时防止风格漂移、重复返工和直接污染工程资源。

## 1. 模型职责建议

### Claude Code

适合：

- 阅读仓库、玩法设计和 VSS。
- 维护任务板、manifest 候选记录、文件路径和版本。
- 检查尺寸、透明边、命名、重复资产和代码引用。
- 生成缩放对照、联系表和评审卡。
- 在最终批准后版本化接入资源。

不应单独决定：

- 视觉方向。
- 候选选择。
- Gold Standard 批准。

### ChatGPT / 通用视觉模型

适合：

- 将玩法和 VSS 转成具体 Art Brief。
- 分析候选差异。
- 生成背景、角色、怪物、交互物和 UI 方向图。
- 填写初步 Art Review Card。

### 专用图像模型

适合：

- 按固定 Brief 生成 1~4 个候选。
- 在选中候选上做一次单点修改。
- 输出高质量源图。

不要让图像模型自行设计玩法、章节身份或命名规则。

## 2. 每个资产的标准循环

### Step 1 · 领取任务

从 `asset-task-board-v1.md` 领取一个 `READY` 资产。

不要跳到后续章节，也不要同时领取一整组角色。

### Step 2 · 读取权威

最少读取：

1. `Visual_Style_Baseline.md`
2. 对应 VSS 类目文件
3. PVE `design.md` 中对应章节/怪物/Boss/机制
4. `multi-model-art-brief.md`
5. 已批准的同类参考

### Step 3 · 填写 Asset Brief

使用 `multi-model-art-brief.md §9` 模板。

Brief 必须明确：

- 玩法用途。
- 显示尺寸。
- 世界身份。
- 章节内容身份。
- 剪影和材质。
- 禁项。

### Step 4 · 生成候选

- 每批 1~4 个。
- 每个候选只改变一个主要方向。
- 不生成组合大礼包。
- 不写入正式资源目录。
- 保存原始 Prompt、模型、日期、seed（如有）。

### Step 5 · 用户选择

用户选择：

- 直接选中。
- 指定一个候选做单点修改。
- 全部退回并说明原因。

未选择前不得进入 selected。

### Step 6 · 技术处理

Claude Code 或本地工具处理：

- 裁切。
- 透明化。
- 色彩空间。
- 尺寸。
- 透明边。
- 文件压缩。
- 命名。
- 32/48 或 64/96/128 px 对照。

禁止改变已批准的主体设计。

### Step 7 · VSS 评分

填写 `Art_Review_Guide.md` 的完整评分卡。

- 通用资产 ≥ 80。
- 核心资产和 Gold Standard ≥ 85。
- 任一 Hard Veto 直接退回。
- 玩家身份、文字、交互物、危险预警不清楚时直接退回。

### Step 8 · 合成与真机

不要只看透明单图：

- 放入真实背景。
- 使用真实目标尺寸。
- 与玩家、怪物、UI 或格线同屏。
- 在窄屏、标准屏、长屏检查。
- 保存真机或等比例截图。

### Step 9 · 最终批准

只有用户可以批准 Gold Standard。

批准后：

- 将候选标记 selected。
- 处理为 processed。
- 版本化接入。
- 切换代码或 manifest 引用。
- 完成回归后标记 integrated。

### Step 10 · 更新锚点

只有整套 GS-01~GS-05 完成后，才能组合新锚图并恢复 Prompt 系统。

## 3. 文件与版本规则

候选目录建议：

```text
art_pipeline/generated/fate-v2-<date>-<asset-id>/
  prompt.txt
  candidate-a.png
  candidate-b.png
  candidate-c.png
  contact-sheet.png
  review.md
```

选中后：

```text
art_pipeline/selected/fate-v2-<asset-id>/
```

正式处理后：

```text
art_pipeline/processed/fate-v2-<asset-id>/
```

不要直接写入：

```text
assets/resources/art/**
```

## 4. 用户给 AI 的最短指令

### 给 Claude Code

```text
阅读 specs/260622-visual-upgrade-v1/README.md 和 multi-model-handoff.md，从 asset-task-board-v1.md 领取下一个 READY 任务；先生成/整理候选与评审资料，不覆盖工程资源，不跳过我的选择。
```

### 给 ChatGPT

```text
阅读 multi-model-art-brief.md，按 asset-task-board-v1.md 中指定资产填写完整 Asset Brief，并只为该资产给出最多三个明确不同的绘制方向；不得修改玩法或视觉规则。
```

### 给图像模型

```text
严格按以下 Asset Brief 生成最多四个候选；只生成指定资产，不添加文字、Logo、额外角色或玩法元素，不改变章节身份和统一世界风格。
```

## 5. 失败处理

如果候选失败，只判断一个首要原因：

- 世界身份不对。
- 章节内容关联不足。
- 中央安全区被侵占。
- 剪影不可读。
- 色彩过暗/过艳。
- 材质或渲染漂移。
- 尺寸不适用。

下一轮只修正这个首要原因，避免一次改十件事。

连续两轮失败时：

- 停止继续生成。
- 检查 Brief 是否矛盾或缺失。
- 提交 Conflict Report。

## 6. 完成定义

一个资产只有同时满足以下条件才算完成：

- 用户选择。
- 技术规格通过。
- 达到对应评分。
- 无 Hard Veto。
- 完成真实尺寸合成。
- 核心资产完成真机验证。
- 版本化接入且可回退。
- 文档和任务板已更新。

