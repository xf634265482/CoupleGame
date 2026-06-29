# Character_Art_Guide — 角色美术执行指南

## Purpose

将 VSS 的角色规则应用到资产生产。角色视觉权威仅来自：

- `../Visual_Style_System/Visual_Style_Baseline.md`
- `../Visual_Style_System/Character_Reference.md`
- `../Visual_Style_System/Monster_Reference.md`
- `../Visual_Style_System/Boss_Reference.md`

本文件不再复制另一套头身、描边、配色或玩家身份规则。

## Standards

### 1. 生产前

1. 先确认资产类型、章节和 Tier。
2. 从 VSS 选择身体原型、剪影记忆点、章节调色板和材质。
3. 明确真机目标显示尺寸。
4. 当前 Prompt 处于暂停状态；新 Gold Standard 锚图批准前不得生成正式新角色资产。

### 2. 默认玩家

默认玩家为棕发蓝金冒险者，带青色命运围巾，约 1.9 头身并手持短剑。玩家身份与职业变体规则以 VSS `Character_Reference.md` 为准。

### 3. 真机可读

- 角色、怪物和 Boss 必须测试 64/96/128 px。
- 玩家地图形象原则上不低于约 64 px 高。
- 玩家清晰可辨高于整张地图同时完整显示。
- 不可读时先简化装饰、放大剪影记忆点和提高局部对比，禁止依赖巨大光效补救。

### 4. 资产版本

- 不直接覆盖已批准资源。
- 新版本先进入候选路径或 `_v2`。
- 通过评分、真机验证和用户批准后切换引用。
- 旧资产标记 deprecated/history。

## Examples

正确：为第三章 Elite 先定义 2.7 头身、冰晶冠剪影、晨辉冰晶调色和 96 px 真机目标，再进入 Gold Standard 流程。

错误：直接使用旧蓝发剑士 Prompt 生成一批新怪物。

## AI Notes

- VSS 是唯一视觉权威。
- 本文件只定义执行顺序，不得自行扩展视觉风格。

## Checklist

- [ ] 已读对应 VSS 类目规则
- [ ] 已确认章节与 Tier
- [ ] 已定义真机目标尺寸
- [ ] 未使用暂停中的旧 Prompt
- [ ] 未覆盖旧资产
