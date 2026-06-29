# Import_Settings — Cocos 导入参数

## Purpose

定义 Cocos 资源导入参数的统一约定，避免每个资产被不同参数导入导致表现不一致。

## Standards

### 1. 通用图（UI / 角色 / 道具）

| 参数 | 值 | 备注 |
|------|----|----|
| Texture Type | sprite | |
| Filter | Bilinear | 缩放平滑 |
| Wrap | Clamp | |
| Premultiply Alpha | true | 微信 alpha 推荐 |
| MipMap | false | 2D 游戏不用 |
| 压缩 | PNG | 不用 ASTC（兼容性优先） |

### 2. Tile

| 参数 | 值 |
|------|----|
| Wrap | Repeat |
| 其他 | 同 §1 |

### 3. 音频

| 参数 | 值 |
|------|----|
| Type | m4a 优先 |
| 立体声 | BGM 立体声；SFX 单声道 |
| 采样率 | 44.1 kHz |
| 码率 | BGM 96~128 kbps；SFX 48 kbps |

### 4. Texture Packer / Atlas

- 暂不启用静态 atlas
- DynamicAtlas **必须禁用**（GameApp.onLoad 顶部）

### 5. UUID 引用

- 场景里 SpriteFrame 引用用 `<uuid>@f9941` 格式
- UUID 在对应 `.png.meta` 的 `f9941` subMeta 里
- 不在代码里硬编码 UUID；用 `UiAssets.loadSpriteFrame(path)` 按路径加载

### 6. 不允许

- ❌ 启用 DynamicAtlas
- ❌ MipMap 开启（浪费包体）
- ❌ 启用 ASTC（兼容性）

## Examples

### 正确
> 新增 `monster_ch1_common_goblin.png`：Cocos 导入 sprite + bilinear + clamp + premultiply

### 错误
> 给地图 Tile 用 Clamp → 边缘会出现透明缝

## AI Notes

- AI 无法直接改导入参数（需在 Cocos Creator）；可在汇报中提示"请按 Import_Settings 设置"
- 不要建议改 atlas / ASTC 等性能参数（已知不兼容）

## Checklist

- [ ] 参数符合 §1 ~ §3
- [ ] DynamicAtlas 已禁用
- [ ] 没有硬编码 UUID
