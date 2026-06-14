import { CLOUD_ENV_ID } from '../../core/Constants';
import { lockPortrait } from './WxLandscape';

/**
 * 微信云开发初始化。曾用 80ms setTimeout 规避旧版模拟器/iOS 首屏 Failed to fetch 红字；
 * 当前基础库（≥3.7）已稳定，移除硬延迟以缩短启动主路径；若新版又出现红字再恢复。
 */
export async function initWxCloud(): Promise<boolean> {
  lockPortrait();
  if (typeof wx === 'undefined' || !wx.cloud) {
    console.warn('[WxCloudInit] 非微信环境，跳过 wx.cloud.init');
    return false;
  }
  try {
    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true });
    console.log('[WxCloudInit] env =', CLOUD_ENV_ID);
    return true;
  } catch (err) {
    console.warn(
      '[WxCloudInit] init 异常（若后续 login 成功可忽略，多为开发者工具网络抖动）',
      err,
    );
    return false;
  }
}
