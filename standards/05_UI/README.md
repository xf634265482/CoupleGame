# 05_UI — UI 规范模块

## Purpose

定义 UI 的**行为 / 布局 / 响应式**规则。UI 的**视觉外观**归 [`../03_Art/UI_Art_Guide.md`](../03_Art/UI_Art_Guide.md)。

## Standards

### 5.0 模块清单

| 文件 | 范围 |
|------|------|
| [`UI_Rules.md`](UI_Rules.md) | UI 通用规则与原则 |
| [`HUD_Guide.md`](HUD_Guide.md) | 战斗 HUD 元素 |
| [`Popup_Guide.md`](Popup_Guide.md) | 弹窗 / 对话框 |
| [`Button_Guide.md`](Button_Guide.md) | 按钮行为与状态 |
| [`Icon_Size.md`](Icon_Size.md) | 图标尺寸规范 |
| [`Layout_System.md`](Layout_System.md) | 布局栅格 |
| [`Responsive.md`](Responsive.md) | 多屏适配 |

### 5.1 元规则

- UI 用代码构建，不依赖 prefab（与 `02_Programming` 一致）
- 视觉细节走 03_Art；本模块定行为
- 任何 UI 要支持 iPhone SE ~ 6.7" 全屏宽度
- 单手可达原则：关键交互在屏幕下半部

## Checklist

- [ ] 行为按本模块；视觉按 03_Art
- [ ] 用代码构建
- [ ] 单手可达
