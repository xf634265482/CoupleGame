# 仓库环境清理计划

> 目标（2026-06-29）：以当前稳定版（分支 `feature/pvp-removal`，PVP 已移除 + 玩法 V3 Phase A/B 已落地）为基准，清掉未提交残留、跟踪污染、孤儿 .meta 与体积膨胀，让后续开发不再绕路。
> 原则：**安全的先做，危险的（改写 git 历史）单独隔离并加门禁**。每阶段独立提交，做完 `npm run test:pve` + 编辑器无导入报错再进下一阶段。
> 红线：`assets/resources/native*` 属敏感区（memory `feedback-no-delete-pvp-native`），**只调查不盲删**。

## 0. 现状体检结论（执行前先认账）

- ✅ 工作区**无未解决合并冲突**；无 `.orig/.rej` 真冲突残留（仅 art_pipeline 备份里有同名文件）。
- ⚠️ 待提交：3 个 PVP 移除遗留的删除——`assets/scripts/board.meta`、`game.meta`、`settlement.meta`（对应目录已删）。
- ⚠️ 跟踪污染大头：`assets/generated/` 382 文件 / 58MB，**未被 .gitignore**，且不是发布用资源（发布美术在 `assets/resources`、`assets/textures` 等）。它漏进 assets/ 导致 Cocos 导入 + 孤儿 .meta 噪音。
- ⚠️ `art_pipeline/`（本地 113M，57 跟踪文件）——美术流水线已弃用、游戏零引用，整目录移除（Phase 4）。
- ℹ️ 孤儿 .meta 共 12 个：3 个 PVP 遗留（Phase 1）+ assets/generated 下若干（随 Phase 3 消失）+ `assets/resources/native.meta`（**确认保留**，构建产物目录标记，非污染）。
- ⚠️ `.git` 255MB（pack 253MB），主要由历史上提交的生成态美术堆积——**仅清当前树不会缩小历史**，需要 Phase 5 的历史改写才会瘦身（高风险，可选）。

## Phase 1 — 提交遗留删除（零风险，先做）

```bash
git rm assets/scripts/board.meta assets/scripts/game.meta assets/scripts/settlement.meta
git commit -m "chore(cleanup): 清理 PVP 移除遗留的孤儿目录 .meta"
```

## Phase 2 — 孤儿 .meta 清理（低风险）

1. 列出全部孤儿（.meta 在、资源已不在）：
   ```bash
   git ls-files 'assets/**/*.meta' | while read m; do a="${m%.meta}"; [ ! -e "$a" ] && echo "$m"; done
   ```
2. **`assets/resources/native.meta` —— 确认保留，不要删**（2026-06-29 已查证）：native 是 **Cocos 构建时输出的 critical-native 贴图目录**（`patch-wechatgame-config.js` 构建后复制贴图进来），内容本就被 .gitignore、每次构建重新生成；`native.meta` 仅是该目录的稳定 UUID 标记（`e6ad7473…`），import 映射可能引用。它"孤儿"只是因为本地尚未构建，**非数据丢失**。划出清理范围。
3. 其余 assets/generated 下的孤儿 .meta 随 Phase 3 一起处理（整目录搬走时一并消失），本阶段只删**不在 generated、也不在 native** 的零散孤儿（若有）。

## Phase 3 — 把 `assets/generated/` 移出资源管线（中风险，收益最大）

`assets/generated/` 是 AI 生成暂存，不该在 `assets/`（会被 Cocos 导入、产孤儿 meta、进构建索引）。

1. **先验证无引用**（防误删正在用的资源）：抽取 generated 下 .meta 的 UUID，确认无任何 `.scene`/`.prefab` 引用：
   ```bash
   # 收集 generated 的 uuid
   grep -rhoE '"uuid": *"[0-9a-f-]+"' assets/generated --include=*.meta | grep -oE '[0-9a-f-]{36}' | sort -u > /tmp/gen_uuids.txt
   # 在场景/预制里搜这些 uuid（有命中=被引用，需保留/迁移那一份）
   while read u; do grep -rl "$u" assets --include=*.scene --include=*.prefab | grep -v assets/generated; done < /tmp/gen_uuids.txt | sort -u
   ```
   - 无输出 → 安全，继续。
   - 有输出 → 那几个资源已被正式引用，应先把它们迁到正式资源目录（如 `assets/resources/...`）再继续。
2. 关闭 Cocos 编辑器，移出 assets/ 并停止跟踪（保留本地副本到非资源暂存区）：
   ```bash
   mkdir -p _ai_staging
   git mv assets/generated _ai_staging/generated   # 若想保留在仓库历史外，改用 git rm -r --cached + 手动 mv
   ```
   - 若**不想再跟踪**这些暂存（推荐，省 58MB 跟踪量）：
     ```bash
     git rm -r --cached assets/generated
     mv assets/generated _ai_staging/generated
     ```
3. `.gitignore` 增补（见 Phase 6），把暂存区与 generated 政策固化。
4. 重开编辑器，确认资源库重建后**无导入错误、无丢失引用**；`npm run test:pve` 绿。
5. 提交。

> 说明：此步去掉 58MB **跟踪**与编辑器导入负担；`.git` 历史体积要 Phase 5 才会真正下降。

## Phase 4 — 整目录移除 art_pipeline（已确认弃用，低风险）

art_pipeline 这条美术流水线已关闭、不再使用；游戏代码/构建/配置**零引用**（已 grep 确认），仅离线暂存。整目录移除。

1. 删除跟踪 + 本地目录：
   ```bash
   git rm -r art_pipeline          # 移除 57 个跟踪文件（generated/approved 本就被忽略，不在内）
   rm -rf art_pipeline             # 清本地 113MB
   git commit -m "chore(cleanup): 移除已弃用的 art_pipeline 美术流水线"
   ```
2. `.gitignore` 把残留的 `art_pipeline/generated`、`art_pipeline/approved` 两条忽略规则删掉（目录已不存在，规则无意义），见 Phase 6。
3. 文档失效链接：`art_pipeline/README.md` 随目录消失；`specs/260622-visual-upgrade-v1/*` 等归档文档里指向 art_pipeline 的链接会失效——属历史归档，不强制修，可在该 spec 顶部加一句「art_pipeline 已于 2026-06-29 移除」备注。

> native.meta 已在 Phase 2 确认**保留**，不在本阶段处理。

## Phase 5 —（可选 / 高风险）`.git` 历史瘦身

仅当确实需要把 255MB 仓库压下来时做。**会改写历史、使所有现有 clone / 未合并 PR 失效**，须全员知会。

1. 备份整个仓库目录。
2. 用 `git filter-repo`（推荐）或 BFG 移除历史中的大体积生成态路径：
   ```bash
   git filter-repo --path assets/generated --path art_pipeline/generated --invert-paths
   ```
3. 强制推送、通知所有人重新 clone。
4. 验证构建与测试。

> 不确定是否值得就**先不做**——Phase 1-4 已能解决「开发绕路」的日常痛点；历史瘦身只影响 clone 速度与磁盘，不影响开发体验。

## Phase 6 — `.gitignore` 加固（固化，防复发）

在 `.gitignore` 增补：

```gitignore
# AI 生成暂存（不进资源管线、不跟踪）
assets/generated/
_ai_staging/
```

并**删除**原有的失效规则（art_pipeline 已整目录移除）：

```diff
- art_pipeline/generated/
- art_pipeline/approved/
```

## 收尾验证（DoD）

- [ ] `git status` 干净；除 `assets/resources/native.meta`（构建产物目录标记，保留）外无孤儿 .meta。
- [ ] Cocos 编辑器打开零导入错误、无丢失引用红字。
- [ ] `npm run test:pve` 与 `cloudfunctions/common` jest 全绿。
- [ ] 全量构建一次微信包成功（确认移除 generated 不影响发布资源）。
- [ ] `.gitignore` 已加固，重新生成暂存不会再被跟踪。

## 不在本次范围

- 分支合并策略（`feature/pvp-removal` → `master`）：当前所有稳定工作在 `feature/pvp-removal`，`master` 落后。是否合并/何时合并由 owner 决定，与环境清理解耦。
