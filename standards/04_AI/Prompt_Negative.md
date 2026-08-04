# Prompt_Negative — 全局 Negative Prompt

## Purpose

锁定一份所有图像生成调用都必须附加的 Negative Prompt，杜绝模型滑向不符合本项目风格的常见错向。

## Standards

### 1. 强制全局 Negative（每次必加）

```text
photorealistic, realistic, photograph, hyperrealistic, 3D render, octane render, plastic render,
anime screenshot, cel shaded hard shadow, manga ink,
thin line art, vector art, flat illustration, pixel art, low poly,
soft silhouette without outline, missing outline, broken outline, double outline, gradient outline, colored outline,
extra limbs, extra fingers, deformed hands, melted face, asymmetric eyes,
text, letters, words, numbers, watermark, signature, logo, copyright, frame, border, checkerboard background,
gore, blood, wound, scar, horror, creepy, scary, sexy, suggestive, lingerie,
overly bright pastel palette, neon palette, purple-dominated palette, oversaturated,
modern clothes, suit, jeans, military uniform, gun, rifle, robot, mecha, sci-fi, cyberpunk,
floor tile, pedestal, ground shadow, cast shadow on ground,
busy background, complex scenery, multiple characters, character sheet, turnaround sheet, model sheet,
JPEG artifacts, compression artifacts, low quality, blurry, out of focus.
```

### 2. 类型专属追加（按需）

#### 2.1 角色 / 怪物 / Boss 追加

```text
no weapon larger than 1.2x body height (except boss exception),
no realistic anatomy, no muscular bodybuilder, no high-heel shoes,
no real-world ethnic costume reference, no political symbol, no religious symbol.
```

#### 2.2 物品 / 图标 追加

```text
no character holding the item, no hand model, no environment behind item,
no multiple item variations, no labeled price tag, no inventory grid.
```

#### 2.3 UI / 面板 追加

```text
no fake screenshot, no real app UI mockup, no iOS / Android UI, no glass morphism,
no Material Design, no SF Pro typography, no real text strings, no menu bar.
```

#### 2.4 场景 / 背景 追加

```text
no people in scene, no foreground character, no HUD overlay, no compass, no minimap,
no realistic photography, no skybox HDR, no chromatic aberration.
```

### 3. 使用规则

- §1 是**每次都加**，无例外
- §2 按生成类型追加对应小节
- Negative 段独立于 Prompt 主体，放在 Prompt 之后用空白行分隔
- 不要修改 §1 内容；如需扩展，在 §2 加专属段

## Examples

### 正确
> 生成一个 Boss → Prompt 主体（7 段） + §1 全局 + §2.1 角色专属

### 错误
> 觉得"this list is too long"删掉一半 → 直接破坏风格收敛

## AI Notes

- 模型对 Negative 长度不敏感；过短反而容易偏移
- 如发现某项 Negative 反向触发（如 "no text" 反而生成乱码），不要删除，改去调整正向 Prompt
- 每次 pipeline 更新 Negative，必须保留旧版本快照 1 个月，便于回滚

## Checklist

- [ ] 我加上了 §1 全部
- [ ] 我按类型加了 §2 对应小节
- [ ] Negative 与 Prompt 之间留了空行
- [ ] 没有为了"省 token"删 Negative 项
