# Visual Style System — 命运之塔视觉风格系统

> **Visual Style System 是《命运之塔》唯一的视觉事实来源（Single Source of Truth）。**
> 所有 AI（Claude Code / Codex / Cursor / ChatGPT / GPT Image / Gemini / ComfyUI / Flux / Midjourney
> 以及未来所有 AI Agent）在生成任何**角色、怪物、Boss、UI、Icon、道具、场景、特效**之前，
> **必须优先学习并遵守本系统，不允许创造与本系统冲突的新风格。**
>
> 如果本系统缺少某条规范，AI 只允许做**最小合理假设**，并在产出中明确记录该假设，
> 以便后续把它写入本系统形成长期规范。

---

## 0. 与既有规范库的关系（必读）

| 文件 / 模块 | 角色 |
|------------|------|
| `standards/AI_AGENT_RULES.md` | 最高优先级 · 协作硬规则（语言、流程、双写） |
| **`standards/Visual_Style_System/`** ← 本目录 | **视觉事实来源** · 所有视觉决策的最高权威 |
| `standards/03_Art/` | **应用规则**，按"类目"组织（Character / UI / Icon / Item / VFX 等），全部**实现** VSS 原则 |
| `standards/04_AI/` | **生成方法**（Prompt 怎么写、流程怎么走），消费 `Prompt_Style_Template.md` 与 VSS 风格段 |
| `_ai_staging/generated/` | 本地 AI 美术暂存区；不再把流水线状态文件放进仓库 |
| `specs/<iter>/` 评审记录 | 历史锚图、Prompt 与打分表的归档位置 |

> **冲突仲裁**：
> 视觉问题 → VSS > 03_Art > 04_AI > 任何外部参考。
> 非视觉问题（命名、架构、流程）→ 仍以 `AI_AGENT_RULES.md` 与对应模块为准。

---

## 1. 目录与阅读顺序

```
Visual_Style_System/
├── README.md                       ← 本文件
├── Visual_Design_Pillars.md        ← 7 条视觉设计原则（WHY）
├── Visual_Style_Baseline.md        ← 唯一视觉基准 · 不可漂移的锚点
│
├── ── 基础语言层 ──
├── Shape_Language.md               ← 形状语言（剪影、几何骨架、Q版结构）
├── Color_Language.md               ← 色彩语言（调色板、温度、和声）
├── Lighting_Guide.md               ← 光照（方向、温度、对比、阴影）
├── Material_Library.md             ← 材质（皮 / 布 / 金 / 木 / 石 / 水晶 / 火 / 冰 / 魔法）
├── Visual_Hierarchy.md             ← 视觉层级（主角 > Boss > 怪物 > 道具 > 场景）
│
├── ── 类目应用层 ──
├── Character_Reference.md          ← 玩家 / NPC 视觉语言
├── Monster_Reference.md            ← 怪物体系
├── Boss_Reference.md               ← Boss 体系
├── UI_Reference.md                 ← UI 视觉语言
├── Icon_Reference.md               ← Icon 规范
├── Item_Reference.md               ← 道具与拾取物
├── Environment_Reference.md        ← 场景规范
│
├── ── 质保层 ──
├── Art_Review_Guide.md             ← 美术评分标准（100 分制）
├── Visual_Audit_Guide.md            ← 真机审计、证据与视觉回归
└── Prompt_Style_Template.md        ← 所有 AI 统一 Prompt 模板
```

### AI 第一次进入项目的阅读顺序

1. `standards/AI_AGENT_RULES.md`
2. `standards/Visual_Style_System/README.md` ← 本文件
3. `Visual_Design_Pillars.md`（理解 WHY）
4. `Visual_Style_Baseline.md`（确定锚点）
5. `Shape_Language.md` + `Color_Language.md` + `Lighting_Guide.md` + `Material_Library.md` + `Visual_Hierarchy.md`（基础语言）
6. 你当前要生成的类目对应的 `*_Reference.md`
7. `Prompt_Style_Template.md`
8. `Art_Review_Guide.md`

跳过任何一步即视为未读规范。

---

## 2. 三个不可违反的元规则

### M1 · Single Source of Truth
任何视觉判断（"这张图行不行"、"这个颜色对不对"、"这个剪影够不够"）都必须能在 VSS 中找到依据。
找不到依据 → 触发 §3 缺失规范流程，**不允许凭模型直觉决定**。

### M2 · 同一世界，同一只笔
玩家、怪物、Boss、NPC、道具、UI 在视觉上必须像出自**同一支美术团队、同一周内画完**。
任何"风格分裂"（chibi + 写实、半厚涂 + 赛璐璐、卡通 + 写实金属）都是 P0 缺陷，必须返工。

### M3 · 100px 优先（Phone-First Readability）
任何视觉资产**最终都要在手机上被人在 100px 左右尺寸里识别**。
"在 1024px 源图里好看"不算合格；"在 100px 缩略图里还能一眼分辨身份"才算合格。
所有的描边粗细、剪影简化、配色对比、装饰取舍，都为这条服务。

---

## 3. 缺失规范流程（Missing-Spec Protocol）

当 AI 在生成过程中发现 VSS 没有覆盖到当前情况：

1. **停下**，不要继续生成
2. 在回答中说明："VSS 中缺少 `<具体规则>` 的规定"
3. 提出**最小合理假设**："为了完成当前任务，我假设 `<X>`，因为 `<Y>`"
4. 提交假设给用户确认
5. 用户确认后，如果该假设值得长期保留 → 写入对应 VSS 文档；否则只作本次例外

> **禁止**：默默自补、说"按行业惯例"、引用外部艺术家、用模型默认偏好填补。

---

## 4. VSS 与"生成"的关系

VSS **不是**只给 AI 看的文档；它同时给：

- **图像生成模型**（GPT Image / Flux / Midjourney / SD / ComfyUI）：通过 `Prompt_Style_Template.md` 把 VSS 写进 prompt
- **代码生成 AI**（Claude / Codex / Cursor）：通过 VSS 决定 UI / VFX / 渲染参数
- **人类美术 / 设计师**：作为提案与评审的共同语言
- **审稿 AI**（Art Review）：作为打分依据

**所有生成都必须**：
1. 走 `Prompt_Style_Template.md` 起 Prompt
2. 产出后用 `Art_Review_Guide.md` 100 分制自评
3. 通用资产 < 80 分不得入库；核心资产与 Gold Standard < 85 分不得入库

---

## 5. 文档结构约定

VSS 内每份文档统一 5 段：

```markdown
## Purpose       本文件要解决什么、给谁看
## Standards     规范条款，按 X.Y 编号，可作锚点
## Examples      正确 / 错误对照（解释 WHY，不只列对错）
## AI Notes      AI 使用本规范时的陷阱、交叉点、判断准则
## Checklist     最后一道防线
```

新增 VSS 文档必须遵循此结构。

---

## 6. 版本与变更

- 当前版本：`VSS v2.0`（2026-06-22 视觉冲突裁决版）
- VSS 任何修改 commit 前缀：`vss(<file>):`
- 修改前必读 §0 关系图，评估对 `03_Art/` 与 `04_AI/` 的牵动
- 重大风格变更（如改变头身比 / 改变描边色 / 改变核心调色板）必须先开"视觉评审会"
- 当前旧 Prompt 处于暂停状态；新 Gold Standard 锚图批准前禁止生成正式新资产

---

## 7. 快速索引（按问题查）

| 问题 | 去哪 |
|------|------|
| 为什么这个游戏要长成这样？ | `Visual_Design_Pillars.md` |
| 风格锚点是哪张图 / 哪些关键词？ | `Visual_Style_Baseline.md` |
| 角色 / 怪物 / Boss 长什么样？ | `Character / Monster / Boss _Reference.md` |
| UI / Icon / 道具 / 场景长什么样？ | 对应 `*_Reference.md` |
| 配色 / 光照 / 材质 / 形状 / 层级 怎么处理？ | 基础语言层 5 份 |
| 我做完了，怎么判断合格？ | `Art_Review_Guide.md` |
| 怎么保存真机证据和做视觉回归？ | `Visual_Audit_Guide.md` |
| 我要生成新资源，Prompt 怎么写？ | `Prompt_Style_Template.md` |
| 模糊问题 / 缺失规范 | 回 §3 缺失规范流程 |
