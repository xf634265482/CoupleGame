# Naming_Convention — 命名约定

## Purpose

让所有命名一眼可读、可搜、可分类。

## Standards

### 1. 文件 / 类

| 类型 | 后缀 | 装饰 | 示例 |
|------|------|------|------|
| Controller | `Controller.ts` | `@ccclass` | `ExpeditionController.ts` |
| View | `View.ts` | 普通类 | `FogMapView.ts` |
| Service | `Service.ts` | 普通类 | `PveService.ts` |
| Panel | `Panel.ts` | `@ccclass` | `PveCharacterPanel.ts` |
| Layout 工具 | `Layout.ts` 小写开头 | 函数 | `pveUiKit.ts` / `xxxLayout.ts` |
| Pure logic | 类名 PascalCase | 无装饰 | `CellResolver.ts` |
| Types | `Types.ts` | — | `PveTypes.ts` |
| Constants | `Constants.ts` | — | `PveConstants.ts` |

### 2. 变量 / 函数

- `camelCase` 普通；`PascalCase` 类与类型；`SCREAMING_SNAKE_CASE` 真常量
- 布尔变量带前缀：`isXxx` / `hasXxx` / `canXxx` / `shouldXxx`
- 私有字段 `_` 前缀
- 函数动词开头：`getXxx` / `applyXxx` / `tryAttack` / `resolveCell`

### 3. 事件名

- 格式：`module:action`
- 例：`pve:cell-entered` / `pve:turn-ended` / `lobby:player-ready`
- 定义为常量字符串放 `core/Constants.ts` 或 `pve/core/PveConstants.ts`

### 4. 云函数名

- 全小写：`pve` / `login` / `room`
- 不允许驼峰云函数名
- action 用参数 `{ action: 'startExpedition' }` 不另起函数

### 5. 资源命名

| 类别 | 模式 | 示例 |
|------|------|------|
| HUD 图标 | `icon_hud_<name>.png` | `icon_hud_hp.png` |
| 物品图标 | `icon_item_<rarity>_<name>.png` | `icon_item_rare_key.png` |
| 技能图标 | `icon_skill_<element>_<name>.png` | `icon_skill_fire_blast.png` |
| 状态图标 | `icon_status_<name>.png` | `icon_status_burning.png` |
| 章节图标 | `icon_chapter_<n>.png` | `icon_chapter_2.png` |
| 怪物 | `monster_ch{n}_{tier}_<name>.png` | `monster_ch1_common_goblin.png` |
| Boss | `boss_ch{n}_<name>.png` | `boss_ch2_quicksand_scorpion.png` |
| 玩家 | `player_<variant>.png` | `player_default.png` |
| 道具 | `item_<type>_<name>.png` | `item_weapon_oak_staff.png` |
| 背景 | `bg_<scope>.png` | `bg_lobby.png` |
| Tile | `tile_<scope>_<name>.png` | `tile_floor_ch1.png` |
| UI 按钮 | `btn_<scope>_<name>.png` | `btn_pve_attack.png` |
| UI 面板 | `panel_<scope>_<name>.png` | `panel_pve_reward.png` |

### 6. 章节 / 数值常量

- 章节编号 `1..5`，代码中用 `Chapter1Boss` 而非 `BossOne`
- 概率写成小数（`0.35` 表示 35%），不要写 `35` 然后除以 100

### 7. Git / 文档

- branch 名：`feat/pve-<topic>` / `fix/<scope>-<short>`
- commit 前缀：`feat(pve):` / `fix(pve):` / `docs(standards):` / `chore:` / `standards(<module>):`
- 文档命名：`standards/` 下 `PascalCase` 或 `UPPER_SNAKE`；`specs/` 下 `kebab-case-数字`

### 8. 不允许

- ❌ `abc.ts` / `a.ts` 等无意义名
- ❌ 中文文件名
- ❌ `XxxV2` `XxxNew` `XxxOld` 这种"版本悬浮"的命名（除非有明确灰度迁移期）
- ❌ 资源名带空格 / 中文 / 大小写混乱

## Examples

### 正确
```
assets/scripts/pve/controllers/ExpeditionController.ts
assets/resources/art/ui/pve/map/icon_chest.png
cloudfunctions/pve/index.js
```

### 错误
```
assets/scripts/pve/xpdctrl.ts    ❌ 缩写
assets/scripts/PVE/expeditionController.ts ❌ 大小写
assets/resources/art/ui/pve/map/Icon Chest 1.png ❌ 空格 / 大写 / 数字尾
```

## AI Notes

- AI 起新名前先 grep 看是否已有；命名争议归 `Coding_Standards.md` 仲裁
- 不允许"我觉得这个名字更好"重命名已上线的类 / 文件 / 云函数

## Checklist

- [ ] 文件名符合 §1
- [ ] 变量符合 §2
- [ ] 事件名常量化
- [ ] 资源命名符合 §5
- [ ] 没有空格 / 中文 / 缩写
