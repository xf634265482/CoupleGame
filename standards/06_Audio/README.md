# 06_Audio — 音频规范

## Purpose

定义 BGM / SFX / Voice 的风格、格式、加载与播放规则。

## Standards

### 6.0 模块清单

| 文件 | 范围 |
|------|------|
| [`Music_Guide.md`](Music_Guide.md) | BGM |
| [`SFX_Guide.md`](SFX_Guide.md) | 音效 |
| [`Voice_Guide.md`](Voice_Guide.md) | 配音 / 旁白（暂不启用） |

### 6.1 元规则

- 格式：m4a / mp3；BGM ≤ 200 KB；SFX ≤ 30 KB
- 走 `AudioManager`（封装在 `audio/`）
- 不在 view 里裸调 `audioEngine`
- 默认音量：BGM 0.5；SFX 0.7；玩家可调

## Checklist

- [ ] 体积达标
- [ ] 走 AudioManager
- [ ] 音量在默认范围
