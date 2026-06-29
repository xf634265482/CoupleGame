# Folder_Structure — 资产目录结构

## Purpose

让资产"放对地方"，搜索 / 加载 / 分包都按目录走。

## Standards

### 1. 顶层

```
assets/
├── resources/         # 运行时加载（resources.load）
│   ├── art/
│   ├── audio/
│   └── prefab/
├── scripts/           # 客户端代码
└── scenes/            # Cocos 场景
```

### 2. resources/art

```
art/
├── ui/
│   ├── backgrounds/        # 全屏背景
│   ├── pve/
│   │   ├── hud/            # 战斗 HUD
│   │   ├── map/            # 地图 Tile / 实体
│   │   ├── panel/          # 面板背板
│   │   └── decoration/     # 装饰
│   └── common/             # 跨模块通用 UI
├── monsters/               # 普通 / 精英怪物
├── bosses/                 # Boss 立绘
├── players/                # 玩家化身
├── items/                  # 道具图标
│   ├── weapons/
│   ├── armors/
│   ├── scrolls/
│   ├── relics/
│   └── consumables/
└── effects/                # 静态特效贴图
```

### 3. resources/audio

```
audio/
├── bgm/
│   ├── lobby/
│   ├── ch1/ ch2/ ch3/ ch4/ ch5/
│   ├── boss/
│   └── stinger/        # 胜利 / 失败短曲
└── sfx/
    ├── ui/             # 按钮 / 弹窗
    ├── battle/         # 战斗
    ├── explore/        # 走格 / 宝箱
    └── world/          # 环境音
```

### 4. 分包

- 大型章节素材按需放分包目录（参见 `.cursor/rules/cocos-wechatgame-subpackage.mdc`）
- 分包路径与 `project.config.json` 一致

### 5. 不允许

- ❌ 散文件在 `resources/` 顶层
- ❌ 不在分类目录下的图（必须归类）
- ❌ PVP / PVE 资源混（PVP 保留在原位置不动）

## Examples

### 正确
```
assets/resources/art/ui/pve/map/icon_chest.png
assets/resources/audio/sfx/battle/sfx_battle_hit_light.m4a
```

### 错误
```
assets/resources/icon_chest.png                ❌ 平铺
assets/resources/art/sfx_hit.m4a               ❌ 类型错位
```

## AI Notes

- 新建目录前看 §1~§3 是否已有合适位置
- 不要为单个资产新建目录

## Checklist

- [ ] 资产在 §1~§3 对应位置
- [ ] 没有散文件
- [ ] 分包路径正确
