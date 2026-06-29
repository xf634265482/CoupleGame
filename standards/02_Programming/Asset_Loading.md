# Asset_Loading — 资源加载

## Purpose

让所有资源加载走统一入口、可分包、可控制主包大小，避免微信小游戏主包超 4 MB 红线。

## Standards

### 1. 加载入口

- 所有 SpriteFrame / Audio / Prefab 走 `UiAssets`（或同类封装）
- 不在 view 里散写 `resources.load(...)`

### 2. 主包 / 分包

- **主包 ≤ 4 MB**（微信硬限制）
- PVE 大资源（章节背景、Boss 立绘）必须放分包
- 分包定义参见 `.cursor/rules/cocos-wechatgame-subpackage.mdc`
- 主包只保留：启动必需 UI / 公用图标 / 配置 / 入口场景

### 3. critical native 清单

- `UiAssets` 维护 `criticalNative` 清单，列出必须 native 化的资源
- 任何新增"启动即用"的图必须显式加入清单
- 详见 `.cursor/rules/cocos-wechatgame-subpackage.mdc` "2026-06 真机 UI/BGM 事故复盘"

### 4. 异步加载

```ts
const sf = await UiAssets.loadSpriteFrame('art/ui/pve/map/icon_chest');
sprite.spriteFrame = sf;
```

- 加载失败必须 catch 并显示占位
- 不允许"裸 await 不 catch"
- 同一资源避免重复加载（UiAssets 内部缓存）

### 5. DynamicAtlas

- **GameApp.onLoad 顶部必须 `dynamicAtlasManager.enabled = false;`**
- 微信小游戏 DynamicAtlas 在新项目会导致 Sprite 不显示（见 `memory/feedback-wechat-dynamic-atlas.md`）
- 这是 Sprite 不显示问题的 #1 嫌疑，先查这里再查其他

### 6. 释放

- 切换场景前显式 release 大资源
- 玩法结束后清理临时 sprite / spine / 粒子

### 7. 不允许

- ❌ 散在 view 里 `resources.load`
- ❌ 启动即加载所有章节资源
- ❌ 删除 `assets/resources/art/` 下的 PVP PNG（破坏 UUID 索引；见 `memory/feedback-no-delete-pvp-native.md`）
- ❌ 直接覆盖已批准资产（用 `_v2` 新名）

## Examples

### 正确
```ts
@ccclass('PveHudView')
export class PveHudView extends Component {
  async onLoad() {
    const sf = await UiAssets.loadSpriteFrame('art/ui/pve/hud/btn_pve_attack');
    this.attackBtn.getComponent(Sprite)!.spriteFrame = sf;
  }
}
```

### 错误
```ts
resources.load('art/ui/pve/hud/btn_pve_attack', SpriteFrame, (err, sf) => {
  if (sf) this.attackBtn.getComponent(Sprite)!.spriteFrame = sf;
});
```
为什么错：没走 UiAssets / 没 catch / 异步嵌套。

## AI Notes

- 资源加载相关 bug：先 grep `dynamicAtlasManager` 与 `criticalNative` 看配置；不要直接改加载代码
- 报"Sprite 不显示"先用 `memory/feedback-wechat-dynamic-atlas.md` 流程

## Checklist

- [ ] 走 UiAssets
- [ ] 启动顶部禁了 DynamicAtlas
- [ ] 新资源不让主包超 4 MB
- [ ] 没动 PVP PNG
- [ ] catch 失败 + 占位
