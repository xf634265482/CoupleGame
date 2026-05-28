# 云数据库索引创建清单

> 环境 ID：`cloud1-d9gsn7mh609335539`  
> 在微信开发者工具 → **云开发** → **数据库** → 对应集合 → **索引管理** → **添加**

---

## users

| 索引名称 | 字段 | 排序 | 唯一 |
|----------|------|------|------|
| openid_unique | `_openid` | 升序 | ✅ 是 |
| id_index | `id` | 升序 | 否 |

---

## rooms

| 索引名称 | 字段 | 排序 | 唯一 |
|----------|------|------|------|
| roomCode_unique | `roomCode` | 升序 | ✅ 是 |
| status_expire | `status` 升序 + `expireAt` 升序 | 复合 | 否 |
| gameId_index | `gameId` | 升序 | 否 |

> 复合索引：先加 `status`，再点「添加字段」加 `expireAt`。

---

## games

| 索引名称 | 字段 | 排序 | 唯一 |
|----------|------|------|------|
| roomId_index | `roomId` | 升序 | 否 |
| phase_started | `phase` 升序 + `startedAt` 升序 | 复合 | 否 |

---

## match_queue

| 索引名称 | 字段 | 排序 | 唯一 |
|----------|------|------|------|
| enqueueAt_index | `enqueueAt` | 升序 | 否 |
| openId_index | `openId` | 升序 | 否 |

---

## 验证

索引创建后状态应为「正常」。首版数据量小，即使暂未建索引也可开发，但 **roomCode 唯一索引** 建议在联调前完成。
