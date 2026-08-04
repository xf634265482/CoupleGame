# Coding_Standards — 代码风格

## Purpose

让 TypeScript / JavaScript 风格在客户端 / 云端 / 测试代码中统一。

## Standards

### 1. 语言基线

- **TypeScript** 客户端；**JavaScript (CommonJS)** 云函数
- 启用 `strict`；不允许 `any` 除非加注释解释
- 不使用 `enum`；用 `as const` 对象或字面量联合：
  ```ts
  export const CellType = { Empty: 0, Monster: 1, Chest: 2 } as const;
  export type CellType = typeof CellType[keyof typeof CellType];
  ```

### 2. 类与字段

- 私有字段 `_` 前缀：`private _hp: number = 0;`
- 类装饰：客户端业务类 `@ccclass('ClassName')`；纯逻辑类无装饰
- 类名 PascalCase；文件名与主类名一致

### 3. 类型导入

- 仅类型：`import type { Foo } from './foo';`
- 混合：`import { fn, type Bar } from './bar';`
- 不混用 default + named import

### 4. 异步

- 优先 `async/await`；不裸 `.then`
- Promise 错误必须 catch；不允许 `.catch(()=>{})` 静默吞掉

### 5. 错误处理

- 统一形式：
  ```ts
  try { ... } catch (err) {
    console.error('[Module] action failed:', err instanceof Error ? err.message : String(err));
  }
  ```
- 不抛裸字符串
- 用户可见错误必须经过 i18n / 友好包装

### 6. 并发输入守卫

- 视图层用 `_busy: boolean` 防止同操作并发
  ```ts
  if (this._busy) return;
  this._busy = true;
  try { ... } finally { this._busy = false; }
  ```

### 7. 字符串与日志

- 不裸 `console.log`；用 `console.log('[Module]', ...)`
- 调试日志在发布前必须清理或开关化

### 8. 注释

- 默认**不写注释**；只在 WHY 非显然时写一行
- 不写"这段代码的作用是 XX"（重复信息）
- 不写"TODO 给 @xxx"，用 Issue 跟踪
- 不写 emoji / 装饰横线

### 9. 测试

- 单测放 `test/` 或 `cloudfunctions/common/__tests__/`
- 不写"测试覆盖率充数"的无意义测试
- 关键纯函数（CellResolver / RNG 等）必须有测试

### 10. 不允许

- ❌ `Math.random()` 在 `pve/core/`（用 `core/rng.ts`）
- ❌ `import 'cc'` 在 `pve/core/`
- ❌ 直接修改 cloudfunctions 副本
- ❌ `enum`
- ❌ `// eslint-disable-next-line` 不加原因
- ❌ commit 含 `console.log('debug ...')`

## Examples

### 正确
```ts
@ccclass('PveHudView')
export class PveHudView extends Component {
  private _busy: boolean = false;
  async onEndTurn(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      await this._service.endTurn();
    } catch (err) {
      console.error('[PveHud] endTurn failed:', err instanceof Error ? err.message : String(err));
    } finally {
      this._busy = false;
    }
  }
}
```

### 错误
```ts
enum Foo { A, B }
class bar { Hp = 10; doIt(){ try{...} catch(e){} } }
```

## AI Notes

- 不要为代码自动加文档化注释 / JSDoc
- 不要"顺手统一风格"重构无关代码

## Checklist

- [ ] 没有 enum
- [ ] 私有字段 `_` 前缀
- [ ] 错误处理统一形式
- [ ] 没有 `Math.random()` / `import 'cc'` 越界
- [ ] 没有调试 console.log
