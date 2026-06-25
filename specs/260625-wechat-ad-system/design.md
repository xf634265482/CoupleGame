# 微信小游戏广告系统（合规版）设计

- 日期：2026-06-25
- 范围：PVE
- 目标环境：Cocos Creator + TypeScript + 微信小游戏原生 `wx` 广告 API

## 1. 背景与目标

《塔塔远征团》需要一套可用于微信小游戏审核通过后正式上线的广告系统，满足以下目标：

- 提供统一广告管理入口，避免大厅、命运树、远征内各自重复封装 `wx` API
- 支持激励视频、Banner、插屏广告三类能力
- 把微信审核关注的合规约束落成真实代码逻辑，而不是停留在文案或人工约定
- 广告失败、用户取消、平台无填充等场景都不能阻塞主流程
- 先服务 PVE 场景，后续如有需要可扩展到大厅其他入口或 PVP

本次只设计广告管理层，不直接修改 PVE 核心状态，不把奖励发放逻辑硬编码到平台适配层。

## 2. 首发奖励范围

本次只落地 PVE 所需的 4 个激励视频奖励点：

1. `restore_stamina`
   - 场景：大厅
   - 效果：玩家观看完整广告后恢复一定体力
   - 合规定位：可选加速，不是进入远征的唯一途径

2. `destiny_tree_reset`
   - 场景：命运树
   - 效果：玩家每日可通过广告免费重置命运树 1 次
   - 合规定位：免费机会，非强制，不影响命运树基础使用

3. `reroll_strengthen_once`
   - 场景：远征强化词条选择
   - 效果：玩家每局远征可通过广告重抽强化词条 1 次
   - 合规定位：增强策略空间，但不影响继续游玩

4. `revive_half_hp_once`
   - 场景：远征死亡结算前
   - 效果：玩家每局死亡后可通过广告原地复活 1 次，并恢复 `50% maxHp`
   - 合规定位：失败后的可选补救，不是继续游戏的强制门槛

## 3. 方案选择

本次采用“轻量单管理器方案”：

- `AdManager.ts` 只负责广告平台能力、合规限制、日志、回调编排
- 业务模块自己决定何时展示入口、何时允许点击、完整观看后如何发奖
- `AdManager` 提供标准奖励说明接口，保证 UI 文案和审核测试路径一致

不采用的方案：

- 不在 `AdManager` 内直接写入体力、命运树、远征状态，避免平台层与 PVE 逻辑强耦合
- 不额外拆 `PveAdService`，避免为本次单文件交付目标引入过多结构

## 4. 模块职责

新增文件：`assets/scripts/platform/wechat/AdManager.ts`

职责边界如下：

- 统一创建和维护 `wx.createRewardedVideoAd`
- 统一创建和维护 `wx.createBannerAd`
- 统一创建和维护 `wx.createInterstitialAd`
- 提供预加载、展示、隐藏、销毁、重建能力
- 提供统一错误处理和调试日志
- 提供奖励说明查询和广告展示前资格钩子
- 提供插屏冷却机制

明确不负责：

- 不负责保存“每日 1 次”“每局 1 次”等业务状态
- 不负责修改玩家体力、命运树节点、强化词条、复活数值
- 不负责构建广告按钮 UI

## 5. 核心接口设计

### 5.1 单例

```ts
export class AdManager {
  public static get instance(): AdManager;
}
```

采用懒加载单例，方便大厅与远征共用同一广告管理器，避免重复创建广告实例。

### 5.2 初始化

```ts
init(config: AdConfig): void
preloadAll(): void
destroy(): void
```

`init` 用于注入广告位 ID、默认 Banner 布局参数、Debug 开关等。  
`preloadAll` 在大厅或启动后可主动调用，提前拉起激励视频与插屏加载。  
`destroy` 在极少数需要彻底释放广告对象时调用，一般生命周期内不会频繁使用。

### 5.3 激励视频

```ts
showRewardAd(type: RewardAdType, options?: RewardAdOptions): Promise<RewardAdResult>
isRewardAdReady(): boolean
getRewardDescription(type: RewardAdType): string
```

其中：

```ts
type RewardAdType =
  | 'restore_stamina'
  | 'destiny_tree_reset'
  | 'reroll_strengthen_once'
  | 'revive_half_hp_once';
```

`RewardAdOptions` 包含：

- `rewardCallback?: () => void | Promise<void>`
- `cancelCallback?: () => void`
- `failCallback?: (message: string) => void`
- `beforeShowCheck?: () => boolean | string`
- `rewardName?: string`

约定：

- `beforeShowCheck` 返回 `true` 表示允许展示
- 返回 `false` 或错误字符串时，不展示广告，直接走失败或取消式兜底
- `rewardCallback` 只有在“确认完整观看”后才触发
- `cancelCallback` 只在用户主动提前关闭时触发

`RewardAdResult`：

```ts
interface RewardAdResult {
  ok: boolean;
  rewarded: boolean;
  cancelled: boolean;
  reason: string;
}
```

### 5.4 Banner

```ts
showBanner(): void
hideBanner(): void
```

Banner 默认用于大厅底部展示：

- 默认停靠屏幕底部
- 计算安全区域与设计分辨率映射
- 预留底部按钮区，不得遮挡核心入口按钮
- Banner 加载失败时静默降级，不影响大厅操作

### 5.5 插屏

```ts
showInterstitial(scene?: string): Promise<boolean>
```

插屏本次虽未指定具体首发场景，但广告管理器需实现合规基础能力，供后续在结算、回大厅等低风险节点按需启用。

## 6. 数据结构设计

### 6.1 配置

```ts
interface AdConfig {
  debug?: boolean;
  rewardAdUnitId: string;
  bannerAdUnitId: string;
  interstitialAdUnitId?: string;
  bannerBottomMargin?: number;
  interstitialCooldownMs?: number;
}
```

默认值：

- `debug = true` 开发阶段默认打开，正式发版可关闭
- `bannerBottomMargin = 16`
- `interstitialCooldownMs = 60000`

### 6.2 奖励说明注册表

广告管理器内部维护：

```ts
const REWARD_DESCRIPTIONS: Record<RewardAdType, string> = {
  restore_stamina: '观看完整广告后恢复一定体力',
  destiny_tree_reset: '每日可通过广告免费重置命运树 1 次',
  reroll_strengthen_once: '本局远征内可通过广告重抽强化词条 1 次',
  revive_half_hp_once: '本局死亡后可通过广告原地复活 1 次，并恢复 50% 最大生命',
};
```

任何未注册类型一律禁止展示奖励广告。

## 7. 合规逻辑落地

### 7.1 不强制观看广告才能继续游戏

代码约束：

- `AdManager` 不提供“自动强弹激励视频”的接口
- 所有激励视频都由业务层显式调用 `showRewardAd`
- `showRewardAd` 不负责切断原流程，只返回结果，由业务层决定继续、关闭、返回大厅等正常分支

业务约束：

- 进入远征、普通死亡结算、命运树基础浏览、强化词条基础选择都必须在“不看广告”时可继续

### 7.2 所有广告必须可跳过

代码约束：

- 不在广告期间覆盖返回键或关闭能力
- 用户提前关闭广告时，视为 `cancelled=true`
- 用户提前关闭时不给奖励，但流程继续

### 7.3 广告失败不能影响游戏流程

代码约束：

- `showRewardAd` / `showBanner` / `showInterstitial` 全部统一 `try/catch`
- 广告加载失败、无填充、平台不支持、实例为空时只返回失败结果，不抛未捕获异常
- Banner 和插屏失败时只记日志
- 激励视频失败时通过 `failCallback` 把控制权交还业务层

### 7.4 插屏冷却机制

代码约束：

- `AdManager` 维护 `_lastInterstitialAt`
- 当前时间与上次成功展示时间差小于 `60000ms` 时，直接拒绝展示
- 被冷却拦截也要打印 debug log，便于审核复测

### 7.5 激励广告必须提供明确奖励说明

代码约束：

- `showRewardAd` 展示前先校验 `type` 是否存在于 `REWARD_DESCRIPTIONS`
- 外部界面必须能通过 `getRewardDescription(type)` 读出明确奖励说明
- `rewardName` 只用于补充显示，不允许完全替代默认说明

## 8. 运行时行为

### 8.1 激励视频流程

1. 业务层调用 `showRewardAd(type, options)`
2. `AdManager` 校验：
   - 环境是否为微信小游戏
   - 奖励类型是否已注册
   - 当前是否已有激励广告在展示中
   - `beforeShowCheck` 是否通过
3. 校验通过后尝试 `show()`
4. 若 `show()` 失败，则先尝试 `load()` 再 `show()`
5. 监听 `onClose`
6. 根据微信返回：
   - 完整观看：执行 `rewardCallback`
   - 提前关闭：执行 `cancelCallback`
7. 收尾并重新预加载下一个广告

### 8.2 Banner 流程

1. 初始化时按配置创建 Banner
2. `showBanner()` 时校正底部位置
3. 若可读取广告真实尺寸，则二次调整，避免遮挡大厅核心按钮
4. `hideBanner()` 只隐藏，不立即销毁，方便重复进入大厅时复用

### 8.3 插屏流程

1. 调用 `showInterstitial(scene)`
2. 先检查冷却
3. 不满足冷却则直接返回 `false`
4. 满足条件则尝试展示
5. 成功后记录 `_lastInterstitialAt = Date.now()`
6. 无论成功与否都预加载下一次展示

## 9. Debug 日志策略

所有日志统一前缀：

```txt
[AdManager]
```

关键日志点：

- 初始化成功/失败
- 广告对象创建成功/失败
- 预加载开始/成功/失败
- 激励视频展示请求、展示成功、用户取消、完整观看、奖励发放
- Banner 展示/隐藏/尺寸调整
- 插屏展示成功/冷却拦截/失败

要求：

- `debug=false` 时关闭普通日志
- 错误日志仍保留，方便审核测试与线上问题排查

## 10. 接入点约定

### 10.1 大厅体力恢复

接入位置：`PveLobbyController`

约定：

- 按钮文案明确写“看广告恢复体力”
- 如果体力已满，业务层直接不允许点击或给出提示
- 广告失败或用户取消时，停留大厅，不影响其他大厅功能

### 10.2 命运树每日广告重置

接入位置：命运树弹窗逻辑，当前在 `PveLobbyController` 内

约定：

- 业务层自己判断“今日广告重置次数是否已用”
- 通过后调用 `showRewardAd('destiny_tree_reset')`
- 完整观看后才调用已有重置逻辑
- 如果广告失败，仍保留普通钻石重置或关闭弹窗路径

### 10.3 强化词条重抽一次

接入位置：远征内强化三选一弹窗

约定：

- 每局仅可广告重抽 1 次，该次数由 PVE 运行状态维护
- 广告成功后重新生成 3 个强化候选
- 广告失败或取消时，保留当前词条，不影响玩家继续选择

### 10.4 死亡后半血复活一次

接入位置：死亡结算前的复活弹窗

约定：

- 每局仅可广告复活 1 次，该次数由 PVE 运行状态维护
- 完整观看后恢复 `Math.floor(maxHp * 0.5)`，并至少恢复 1 点生命
- 若广告失败或取消，继续走原有死亡结算流程

## 11. 错误处理策略

统一错误出口：

- 平台不可用：返回失败结果，`reason='wx_unavailable'`
- 广告对象创建失败：`reason='create_failed'`
- 广告加载失败：`reason='load_failed'`
- 广告展示失败：`reason='show_failed'`
- 用户取消：`reason='cancelled'`
- 奖励类型未注册：`reason='invalid_reward_type'`
- 忙碌中重复点击：`reason='reward_busy'`
- 插屏冷却中：`reason='interstitial_cooldown'`
- 展示前业务校验未通过：`reason='before_check_failed'`

错误信息对外以短消息返回，对内保留完整日志。

## 12. 测试与验收

最小验收清单：

1. 微信环境存在且广告位 ID 合法时，激励视频可正常展示
2. 用户完整观看后只发放一次奖励
3. 用户中途关闭时不发奖励，且流程可继续
4. 广告加载失败时不崩溃、不阻塞界面
5. Banner 在大厅底部展示，不遮挡主操作区
6. 插屏在 60 秒内重复请求时被冷却拦截
7. `getRewardDescription(type)` 能返回 4 个奖励点的明确说明
8. Debug 日志可清晰区分成功、取消、失败、冷却拦截

建议后续在实现后补充：

- 微信开发者工具真机调试验证
- 无广告填充场景验证
- 审核走查文案检查

## 13. 非目标

本次不包含：

- 第三方广告 SDK 集成
- 激励广告外的运营弹窗策略
- 广告收益统计上报
- 服务端广告奖励校验
- PVP 奖励广告接入

## 14. 风险与后续扩展

风险：

- 微信不同基础库版本对 `onClose` 返回结构兼容性不同，需要在实现时做兼容判断
- Banner 实际高度与屏幕适配存在机型差异，实现时需保留二次重排能力
- “每日 1 次”“每局 1 次”属于业务状态，不应误放进 `AdManager`

扩展方向：

- 后续可把奖励说明注册表升级为完整奖励注册表
- 后续可新增 `getAvailability(type)` 之类的状态接口，减少 UI 侧重复判断
- 后续若 PVP 接入，可直接复用同一 `AdManager`
