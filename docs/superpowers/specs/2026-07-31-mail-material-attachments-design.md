# 邮件附件扩展：材料与补签卡

日期：2026-07-31  
状态：已确认  
关联：`2026-07-28-mail-system-design.md`、`2026-07-31-camp-materials-v1-design.md`、签到补签卡

## 1. 目标

GM 发信附件在保留星尘 / 体力的基础上，支持营地三种材料与补签卡，玩家领取后写入对应档案字段。

## 2. 已确认决策

| 项 | 选择 |
|----|------|
| 附件集合 | 星尘、体力、淬星砂、聚星核、虚空革、补签卡（全套） |
| GM 表单 | 保持「下拉单选一种 + 数量」 |
| type 形态 | 扁平字符串，与档案字段名对齐 |
| 非目标 | 一封多附件；本轮不改 GM「资源调整」加三种材料 |

## 3. 附件白名单

| `type` | 中文 | 入账 |
|--------|------|------|
| （空 / 无附件） | 纯通知 | 无 |
| `stardust` | 星尘 | `pveProfile.gold += amount` |
| `stamina` | 体力 | `pveStamina = min(STAMINA_MAX, +amount)` |
| `quenchSand` | 淬星砂 | `pveProfile.materials.quenchSand += amount` |
| `fusionCore` | 聚星核 | `pveProfile.materials.fusionCore += amount` |
| `voidHide` | 虚空革 | `pveProfile.materials.voidHide += amount` |
| `makeupCards` | 补签卡 | `pveProfile.checkIn.makeupCards += amount` |

校验：正整数；上限与现网邮件一致（≤999999；补签卡可与 GM `RESOURCE_LIMITS.makeupCards` 对齐为 999，实现时钉死：**邮件单条 amount ≤999999，补签卡单条 ≤999**）。

材料写入前经 `normalizeMaterials`；补签卡经 `normalizeCheckIn`（换月逻辑与现有签到一致，避免脏结构）。

## 4. 行为不变

- 未领且有附件不可删；领取幂等；`claimed` / `read` 规则不变。
- 广播仍 fan-out + `batchId`，硬顶 500。
- 不过期；软删。

## 5. 改动面

| 层 | 文件 / 点 |
|----|-----------|
| 云端纯逻辑 | `cloudfunctions/common/pve/PveMail.js`：`MAIL_ATTACHMENT_TYPES`、`normalizeAttachment`、`applyMailAttachmentsToUserState` |
| 单测 | `cloudfunctions/common/__tests__/PveMail.test.js` |
| 客户端展示 | `MailView` 附件摘要文案；`PveService` 类型 |
| GM Web | `gm-web` 发信下拉与标签 |
| 文档 | `specs/260608-pve-destiny-expedition/design.md` 邮箱条；本 spec |

领取事务仍走现有 `PveMailService`（整份 `pveProfile` 写回即可覆盖 materials / checkIn）。

## 6. AC

1. GM 可选上述六种附件（加纯通知）发单人 / 全服邮件。
2. 玩家领取后对应字段增加，星尘/体力行为与旧版一致。
3. 非法 type / 非正整数被拒。
4. 大厅邮件列表/详情能读懂新附件名称。
5. 未领材料/补签卡邮件不可删；领取后可删。

## 7. 非目标

- 一封邮件多个附件
- GM `adjustResources` 增加淬星砂/聚星核/虚空革（可另开）
- 装备、命痕附件
