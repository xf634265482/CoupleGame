# Responsive — 多屏适配

## Purpose

让《命运之塔》在窄屏、标准屏和长屏微信竖屏设备上保持可读和可操作。

## Standards

### 1. 设计构图

- 参考设计比例：720×1280 竖屏。
- 中央玩法安全区不可裁切。
- 四周为可裁切背景扩展区。
- 关键平台、HUD 和主光方向不得因设备比例丢失。
- 背景不得拉伸。

### 2. 适配方式

- Cocos `Widget` 锚定四边
- 关键 HUD 用 `Widget` + 安全区 inset
- 文字使用 LabelOutline 包字符自适应

### 3. 安全区

- 使用 `ViewAdapt.ts` 中的 `getSafeArea`
- 不允许硬编码 notch / home indicator 高度

### 4. 字体缩放

- 用户系统字体放大时**不缩放游戏内文字**（避免布局崩）
- 设置中可选"小 / 中 / 大"字号

### 5. 横竖屏

- 默认竖屏
- 不支持横屏（专注单手玩法）
- 至少验证窄屏、标准屏和长屏

### 6. 不允许

- ❌ 假设固定 1334×750
- ❌ 写死 notch 高度
- ❌ 在 view 里查 `screen.width` 直接判断设备

## Examples

### 正确
> HUD 顶部用 Widget 锚 top + 安全区 inset，自动避刘海

### 错误
> `node.position = (375, 30)` 硬编码 → 在 SE 上错位

## AI Notes

- 改适配逻辑必须在多设备真机过；不要只看编辑器预览

## Checklist

- [ ] 用 Widget + 安全区
- [ ] 没有硬编码屏幕宽
- [ ] 字号不跟随系统
