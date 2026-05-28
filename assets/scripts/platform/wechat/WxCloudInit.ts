import { CLOUD_ENV_ID } from '../../core/Constants';

export function initWxCloud(): boolean {
  if (typeof wx === 'undefined' || !wx.cloud) {
    console.warn('[WxCloudInit] 非微信环境，跳过 wx.cloud.init');
    return false;
  }
  wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true });
  console.log('[WxCloudInit] env =', CLOUD_ENV_ID);
  return true;
}
