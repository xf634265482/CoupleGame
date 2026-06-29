# Asset_Quality_Checklist — 资产质量门槛

## Purpose

任何资产从 `art_pipeline/selected` → `processed` → `integrated` 之前必须过本清单。

## Standards

### 1. 视觉

- [ ] 符合 `03_Art/Character_Art_Guide.md` §2 / §7 / §10
- [ ] 描边覆盖率 ≥ 42%
- [ ] 主体在 64 / 96 / 128 px 下可识别（缩放测试）
- [ ] 符合当前 VSS Baseline；新锚图批准后完成并排评审
- [ ] 调色板在 `Color_System.md` 范围
- [ ] 无文字 / 水印 / 签名

### 2. 技术

- [ ] 透明资产使用 PNG；不透明全屏背景使用适合微信包体的压缩格式
- [ ] 角色/怪物/Boss 源图 1024 方图；图标源图 512；状态图标可用 256
- [ ] 入库尺寸按 `04_AI/Prompt_Standards.md` §5
- [ ] 文件 ≤ 100 KB（UI / 图标）或 ≤ 400 KB（章节背景）
- [ ] Transparent BG / 无 checkerboard
- [ ] 角色透明边约 10%，Boss 约 12%，物品约 10%~12%，且主体未因此缩小
- [ ] UI 按真实槽位与 9-slice 设计
- [ ] 已用 tinypng 类工具压缩

### 3. 命名

- [ ] 符合 `Naming.md`
- [ ] 文件名在 `Folder_Structure.md` 对应目录
- [ ] manifest 已更新（`art_pipeline/manifests/*.json`）

### 4. 引用

- [ ] 没有破坏现有 UUID 引用
- [ ] 已在 `UiAssets` / 加载点接入（如需启动加载）
- [ ] 已在场景中预览过（如适用）

### 5. 流程

- [ ] 走了 `todo → generated → selected → processed → integrated`
- [ ] selected 由人类筛选（非 AI 自决）
- [ ] processed 经过裁剪 / 透明化 / 命名 / 压缩
- [ ] integrated 完成 + manifest 状态 `integrated`

### 6. 不允许

- ❌ 跳过 selected 由 AI 自选
- ❌ 在 `assets/resources/art/` 直接 drop 文件
- ❌ 覆盖已批准资产（用 `_v2`）
- ❌ 新旧版本同时成为当前有效资源

## Examples

### 正确
> 第 1 章新怪物：pipeline 走完 + 64/96/128 px 测试 + 描边检查 + manifest 更新 → 通过

### 错误
> 直接把生成图扔到 `resources/art/monsters/` 里 + 同名覆盖原图 → 违反 §5 / §6

## AI Notes

- AI 完成生成后**必须**汇报本清单 §1~§5 的逐项结论
- 不能勾选未验证的项

## Checklist

> 本文件本身就是清单。
