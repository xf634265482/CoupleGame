# Release_Checklist — 发版前必过

## Purpose

任何"准备发版 / 准备上传体验版 / 准备给非项目人员看"的工作都必须先过本清单。

## Standards

### 1. 代码

- [ ] `npm test` 全绿
- [ ] `npm run test:pve` 全绿
- [ ] `cloudfunctions/common/__tests__/` 全绿
- [ ] `node scripts/sync-cloud-common.js` 已跑（如改了 common）
- [ ] 无 `console.log('debug ...')` 残留
- [ ] 无 `// TODO` 关键路径

### 2. 资源

- [ ] 主包 ≤ 4 MB（运行 `node scripts/patch-wechatgame-config.js` 后查 build 大小）
- [ ] 单分包 ≤ 4 MB
- [ ] 总包 ≤ 30 MB
- [ ] `UiAssets.criticalNative` 清单与启动用图一致

### 3. 性能

- [ ] 中端机冷启动 ≤ 5s
- [ ] 战斗 60 FPS
- [ ] 探索 30+ FPS
- [ ] 无 GC 抖动（profile 截图）

### 4. 美术

- [ ] 新增美术资产已走 pipeline `integrated`
- [ ] 如有 AI 美术产出，对应 `specs/<iter>/` 的评审 / 交付记录已同步
- [ ] 视觉风格与 `03_Art/Character_Art_Guide.md` 一致

### 5. 文档

- [ ] 涉及玩法的改动同步 `specs/<iter>/design.md`
- [ ] 涉及规范的改动同步 `standards/`
- [ ] `PROJECT_NAVIGATION.md` / `CALL_FLOW.md` 与代码状态一致

### 6. 真机

- [ ] 微信开发者工具 → 真机预览成功
- [ ] iPhone 12 / 中端 Android 各跑过一次远征
- [ ] 弱网模式可走完一关
- [ ] 退出微信再回，状态可恢复

### 7. 安全

- [ ] 无 secret / API key 入库
- [ ] 不包含 `.env` `cloudbaserc.private` 等敏感文件
- [ ] cloudfunctions 鉴权检查（openid 校验）

### 8. 不允许

- ❌ 任一项未通过就发版
- ❌ 跳过真机测试

## Examples

### 正确
> 发版前打开本文件 → 逐项打钩 → 全过才发

### 错误
> "都改了几行，发吧" → 不查包体 / 不查性能

## AI Notes

- AI 不能独立判断"达标"；最终决策权在人
- AI 检查能给到的就给（如包体大小可读 build 目录），不能给的标注"待人工"

## Checklist

> 本文件本身就是清单。
