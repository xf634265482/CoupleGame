# 大厅背景恢复记录

- 正式资源：`assets/resources/art/ui/backgrounds/bg_lobby.png`
- 黄金母版：`art_pipeline/approved/visual-upgrade-v1/bg_lobby-destiny-tower-gold-20260621.png`
- 恢复源：`bg_lobby-recovered-20260621.png`
- SHA-256：`902343A73DEB75DA847320CAD5B74E7489E489D7A8A11A44A183DFBD76BB0533`
- 画布：`750 × 1334`，竖版

## 保护规则

`bg_lobby.png` 是已批准的黄金标准大厅背景。禁止压缩脚本对正式源图执行原位缩放、量化或覆盖备份；如需控制微信包体积，只能在构建产物中生成派生版本，不能反写 `assets/` 下的源图。

`scripts/compress-ui-large-assets.py` 已将该文件列为 `PROTECTED_SOURCE_ASSETS`，并恢复 `.pngbak` 仅首次创建的行为。

`bg_lobby-overwritten-horizontal-20260622.png` 只用于事故追溯，不是可用美术资源。
