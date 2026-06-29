# Button_Guide — 按钮规范

## Purpose

定义按钮的类型、尺寸、状态、行为。

## Standards

### 1. 类型

| 类型 | 用途 | 视觉 |
|------|------|------|
| Primary | 主操作（攻击 / 确认） | 高对比青蓝或章节危险色 |
| Secondary | 次操作（互动 / 取消） | 蓝金样式 |
| Danger | 危险（撤退 / 放弃） | 危险红底 + 米白字 |
| Ghost | 弱化（详情 / 帮助） | 无底 + 描边 + 米白字 |
| Icon-only | 紧凑（关闭 X / 设置齿轮） | 仅图标 |

### 2. 尺寸（@ 设计 1334×750）

| 类型 | 宽 × 高（px） | 字号 |
|------|--------------|------|
| 大主按钮 | ≥ 240 × 96 | 36 |
| 普通按钮 | ≥ 160 × 80 | 28 |
| 小按钮 | ≥ 100 × 64 | 24 |
| Icon-only | 80 × 80 | — |

所有可点击区域不得小于约 76×76 设计像素。次级按钮只降低视觉重量，不得缩小到难点。

### 3. 状态

| 状态 | 视觉变化 |
|------|---------|
| Normal | 默认 |
| Pressed | 下沉 4 px + 暗化 10% |
| Disabled | 饱和 -40% + 字色 Text Disabled |
| Loading | 替换文字为旋转图标 + 禁用 |

### 4. 间距

- 按钮之间间距 ≥ 24 px
- 按钮与文字区间距 ≥ 32 px
- 按钮与屏幕边间距 ≥ 24 px

### 5. 行为

- 点击 ≤ 100ms 内反馈
- 异步操作：点击后立即 Loading；完成后回 Normal
- 用 `_busy` 守卫，禁止并发

### 6. 不允许

- ❌ 按钮文字 > 4 个汉字
- ❌ 按钮高 < 56 px（点不到）
- ❌ 没有 Disabled 状态
- ❌ 长按 / 双击 / 滑动作为主交互

## Examples

### 正确
```ts
@ccclass('PveAttackButton')
export class PveAttackButton extends Component {
  private _busy: boolean = false;
  async onClick() {
    if (this._busy) return;
    this._busy = true;
    this._setState('loading');
    try {
      await this._controller.attack();
    } catch (err) {
      console.error('[Attack] failed:', err instanceof Error ? err.message : String(err));
    } finally {
      this._setState('normal');
      this._busy = false;
    }
  }
}
```

### 错误
> 按钮 60×40 px，文字"立即开启传说远征" → 太小 / 文字超长

## AI Notes

- 按钮文字必须经过设计审；不允许 AI 自创无意义按钮文字
- 不要为美观去掉 Disabled 视觉（玩家会以为能点）

## Checklist

- [ ] 类型与场景匹配
- [ ] 尺寸 ≥ §2
- [ ] 三态齐全（+ Loading）
- [ ] 异步用 `_busy`
- [ ] 文字 ≤ 4 字
