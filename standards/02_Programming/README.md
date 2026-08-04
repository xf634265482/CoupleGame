# 02_Programming — 工程规范模块

## Purpose

让 AI 与人写出的代码风格一致、架构一致、可读可维护。与 `CLAUDE.md` / `DEVELOPMENT_GUIDE.md` 互补；冲突时以本模块为准。

## Standards

### 2.0 模块清单

| 文件 | 范围 |
|------|------|
| [`Code_Architecture.md`](Code_Architecture.md) | 客户端 / 云端整体架构 |
| [`Coding_Standards.md`](Coding_Standards.md) | TypeScript / JavaScript 风格 |
| [`File_Structure.md`](File_Structure.md) | 文件夹与文件组织 |
| [`Naming_Convention.md`](Naming_Convention.md) | 类 / 方法 / 文件 / 资源命名 |
| [`Asset_Loading.md`](Asset_Loading.md) | UiAssets / 资源加载 / 分包 |
| [`Performance_Guidelines.md`](Performance_Guidelines.md) | 微信小游戏性能红线 |
| [`AI_Coding_Rules.md`](AI_Coding_Rules.md) | AI 写代码必须遵守的额外规则 |

### 2.1 与其他文档关系

- `CLAUDE.md` = 项目入口指南；本模块 = 详细规则
- `DEVELOPMENT_GUIDE.md` = 工程惯例；本模块覆盖更广
- `.cursor/rules/cocos-wechatgame-subpackage.mdc` = 微信小游戏分包细则，本模块在 `Asset_Loading.md` 引用

## Checklist

- [ ] 写代码前读了 `Coding_Standards.md` + `Naming_Convention.md`
- [ ] 改架构前读了 `Code_Architecture.md`
- [ ] 性能相关改动读了 `Performance_Guidelines.md`
