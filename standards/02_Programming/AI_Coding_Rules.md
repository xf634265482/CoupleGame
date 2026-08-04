# AI_Coding_Rules — AI 写代码额外规则

## Purpose

人类写代码遵守 `Coding_Standards.md` 已足够；AI 写代码还要遵守以下"AI 易犯错"的额外规则。

## Standards

### 1. 改前必读

- 修改某文件前必须先 `Read` 整个文件，不靠"凭印象编"
- 改 PVE 玩法前必读 `specs/260608-pve-destiny-expedition/design.md`
- 改云函数 common 前必读 `cloudfunctions/common/README.md`（若有）+ CLAUDE.md 说明

### 2. 不自创范式

- 不自创新的命名 / 目录 / 架构
- 不自创新的 EventBus / Service / Controller 抽象
- 不"顺手"加一个工具类（先问用户）

### 3. 不夹带

- 改 A 不顺手改 B（即使 B 看起来"也该改"）
- 不重命名"路过"的变量
- 不"美化"无关代码

### 4. 不破坏已批准

- 已上线类名 / 文件名 / 云函数名不改
- 已批准资产不重生成覆盖（用 `_v2` 新名）
- 已批准 spec 行为不改（先改 spec）

### 5. 失败模式

#### 5.1 测试失败
- 不为了通过测试改测试
- 修代码到测试通过；如确定测试错则在 PR 描述说明

#### 5.2 类型错误
- 不 `as any` 绕过；找出真原因
- 不 `// @ts-ignore` 不加注释

#### 5.3 钩子失败（pre-commit）
- 不 `--no-verify`；修根因
- 钩子失败 → 修 → 重新 stage → 新 commit（不 amend）

### 6. 双写规则

| 改了 | 同步 |
|------|------|
| `cloudfunctions/common/**` | 跑 `node scripts/sync-cloud-common.js` |
| PVE 玩法代码 | `specs/260608-pve-destiny-expedition/design.md` |
| PVP 玩法代码 | `specs/260529-combat-board-game-rework/design.md` |
| 命名规则 | `standards/02_Programming/Naming_Convention.md` |
| 架构 | `standards/02_Programming/Code_Architecture.md` |
| 启动流程 | `CLAUDE.md` 相关段 |

### 7. 询问而非假设

| 模糊场景 | AI 行为 |
|---------|---------|
| 不知道用户要哪个方案 | 列 2 个方案 + 推荐，等回答 |
| 不知道字段命名 | 先 grep 同类，找不到再问 |
| 不知道是否要写测试 | 默认写；不写则在汇报时说明 |
| 不知道是否同步 spec | 默认同步 |

### 8. 代码评审视角自检

提交前自问：
- 这段代码 6 个月后我自己看得懂吗？
- 这段代码会让一个新人多走弯路吗？
- 这段代码有没有破坏现有的约定？

### 9. 不允许

- ❌ 大段重构 + 大段功能一次提交
- ❌ commit message 写 "update" / "fix bug"（不写明 scope）
- ❌ 写完不验证就汇报"完成"
- ❌ 看不懂现有代码就重写
- ❌ 用废弃 API（先 grep 看现有用法）

## Examples

### 正确
> 用户："把 turn 切换的逻辑挪到 controller"
> AI：Read TurnView + ExpeditionController → 列计划 → 移动逻辑 + 删除原位置 + 跑测试 → 同步 design.md → 汇报

### 错误
> AI："顺便把命名也改成更清晰的，又重命名了 5 个变量" → 违反 §3 / §8

## AI Notes

- 本规则是 `Coding_Standards.md` 的补充，不是替代
- 当本规则与用户指令冲突 → 走 `AI_AGENT_RULES.md` §5

## Checklist

- [ ] 改前 Read 整个文件
- [ ] 没自创范式
- [ ] 没夹带无关改动
- [ ] 触发的双写都做了
- [ ] commit message 有 scope
- [ ] 没用 `as any` / `--no-verify` 绕障
