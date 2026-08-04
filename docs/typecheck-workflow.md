# Typecheck Workflow

## Purpose

当前工程已经把“主游戏客户端”的类型检查入口从历史全量噪音中拆出来。日常开发请优先使用下面的命令，而不是手动猜测该跑哪个 `tsconfig`。

## Commands

```bash
npm run typecheck
npm run typecheck:game
npm run test:pve
```

## Which One To Use

- `npm run typecheck`
  - 默认主游戏类型检查入口
  - 实际执行：`tsc -p tsconfig.json --noEmit`
  - 检查范围：`assets/scripts/**/*.ts` + `shared/**/*.ts`

- `npm run typecheck:game`
  - 显式主游戏类型检查入口
  - 实际执行：`tsc -p tsconfig.game.json --noEmit`
  - 与默认入口等价，适合脚本、CI 或排查时明确指定

- `npm run test:pve`
  - PVE 客户端单测入口
  - 只覆盖 `test/pve/` 和相关 `assets/scripts/pve/core/**`

## Tsconfig Roles

- [tsconfig.json](/D:/GameSpace/CoupleGame/tsconfig.json)
  - 当前默认主游戏入口
  - 已排除 `test/`、`extensions/`、`cloudfunctions/`、`temp/`

- [tsconfig.game.json](/D:/GameSpace/CoupleGame/tsconfig.game.json)
  - 主游戏等价显式入口
  - 适合在脚本和自动化里固定使用

- [tsconfig.jest.json](/D:/GameSpace/CoupleGame/tsconfig.jest.json)
  - Jest / PVE 单测入口
  - 不用于日常主游戏提交判断

## Submit Checklist

普通客户端改动默认跑：

```bash
npm run typecheck
npm run test:pve
```

如果改了 `cloudfunctions/common/`，再额外跑：

```bash
node scripts/sync-cloud-common.js
cd cloudfunctions/common && npm test
```

## Notes

- 不要再把历史“全工程混合入口”的噪音报错当成是否可提交的判断标准。
- 如果 `typecheck` 重新出现大批微信 API 类型错误，优先检查 [assets/scripts/types/wx.d.ts](/D:/GameSpace/CoupleGame/assets/scripts/types/wx.d.ts) 是否与新接入能力同步。
- 如果出现业务协议类型错误，优先检查 [assets/scripts/types/GameTypes.ts](/D:/GameSpace/CoupleGame/assets/scripts/types/GameTypes.ts) 和 `shared/` 中的对应共享类型。
