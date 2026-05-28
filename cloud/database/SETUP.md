# Task 1.3 云数据库配置指南

> 环境 ID：**cloud1-d9gsn7mh609335539**  
> 完整字段说明见：`specs/260526-online-party-board-game/ddl-sql.md`

---

## 你需要做的（约 10 分钟）

### 步骤 1：在云开发控制台 **手动创建四个集合**

> 你的环境返回 `-502005 collection not exists`，说明**不能**靠代码自动建表，需先在控制台点几下。

1. 微信开发者工具顶部 → **云开发**
2. 左侧 **数据库**
3. 点击 **「+ 添加集合」**（或「创建集合」）
4. 依次创建四个集合（名称必须完全一致，全小写）：

| 序号 | 集合名称 |
|------|----------|
| 1 | `users` |
| 2 | `rooms` |
| 3 | `games` |
| 4 | `match_queue` |

5. 每个集合创建后可以是 **空的**，不用加字段

---

### 步骤 2：部署并运行 `initDb`（验证集合是否就绪）

1. 右键 **`cloudfunctions/initDb`** → **创建并部署：云端安装依赖**
2. **云开发 → 云函数 → initDb → 测试** → 参数 `{}` → **运行**
3. 成功时应返回 `"ok": true`，且四个 collection 均为 `"status": "ok"`

#### 若反复弹出「node modules 未安装」

**原因**：本机未安装 Node.js / npm，工具无法在本地装依赖（与云端部署无关）。

**处理（二选一）**：

| 方案 | 操作 |
|------|------|
| **A. 推荐** | 不用本地调试，按上文用 **云开发面板 → 云函数 → 测试** |
| **B. 一劳永逸** | 安装 [Node.js LTS](https://nodejs.org/) → 重启微信开发者工具 → 在 `cloudfunctions/initDb` 目录打开终端执行 `npm install` |

安装 Node 后可在 PowerShell 验证：`node -v` 和 `npm -v` 都有版本号即可。

---

### 步骤 2：创建索引

打开 `cloud/database/indexes.md`，在控制台为每个集合添加索引。

**最低优先级（联调前必做）**：

- `rooms.roomCode` **唯一索引**（防房间号冲突）

其余索引可在 Task 2 联调前补全。

---

### 步骤 3：配置安全规则（客户端只读）

对每个集合：**数据库** → 点集合名 → **权限设置** → **自定义安全规则** → 粘贴对应 JSON：

| 集合 | 复制文件 |
|------|----------|
| users | `cloud/database/security-rules/users.json` |
| rooms | `cloud/database/security-rules/rooms.json` |
| games | `cloud/database/security-rules/games.json` |
| match_queue | `cloud/database/security-rules/match_queue.json` |

规则含义：

- **users**：仅本人可读自己的文档，任何人都不能客户端写
- **rooms / games**：所有人可读（用于 watch），客户端不能写
- **match_queue**：客户端不可读写（仅云函数）

---

### 步骤 4：验证客户端不能写 games（可选）

1. 在开发者工具 **调试器 → Console** 执行：

```javascript
wx.cloud.database().collection('games').add({
  data: { test: true }
}).then(console.log).catch(console.error)
```

2. 应 **失败**（permission denied），说明安全规则生效。

---

### 步骤 5：更新检查清单

完成后回复 **「Task 1.3 做完了」**，或在 `ddl-sql.md` §5 自行勾选。

---

## 仓库内已准备好的文件（AI 已完成）

| 路径 | 用途 |
|------|------|
| `cloudfunctions/initDb/` | 一键创建四个空集合 |
| `cloud/database/security-rules/*.json` | 安全规则模板 |
| `cloud/database/indexes.md` | 索引清单 |
| `specs/.../ddl-sql.md` | 字段定义与上线文档 |
| `shared/protocol.ts` | 与集合字段对齐的 TypeScript 类型 |

---

## 常见问题

**Q：找不到 cloudfunctions 目录？**  
A：确保导入的是仓库根目录，且 `project.config.json` 中 `cloudfunctionRoot` 为 `cloudfunctions/`。

**Q：initDb 报错没有权限？**  
A：确认已开通云开发且 envId 正确；云函数需「上传并部署」而非仅保存本地。

**Q：集合有了但索引太多懒得建？**  
A：首版可先只建 `rooms.roomCode` 唯一索引，其余后续补。
