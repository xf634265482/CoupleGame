/** 微信云开发环境 ID（与 config/wechat.local.json 一致） */
export const CLOUD_ENV_ID = 'cloud1-d9gsn7mh609335539';

/** 启动耗时埋点开关（→ PerfMarks，AC-502）：dev 调试用，正式发布前关闭。 */
export const PERF_TRACE_ENABLED = true;

/** Cocos 场景名（需在构建前于编辑器中创建对应 scene） */
export const SCENE = {
  BOOTSTRAP: 'bootstrap',
  LOBBY: 'lobby',
  PVE_EXPEDITION: 'pve_expedition',
  DESTINY_TREE: 'destiny_tree',
} as const;
