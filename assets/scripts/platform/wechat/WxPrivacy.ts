/**
 * 微信隐私协议授权（2023年新规）
 * 在调用任何涉及用户数据的 API（login）之前调用。
 * 用户拒绝时调用 wx.exitMiniProgram() 并 throw 中断启动流程。
 */
export async function ensurePrivacyAuthorized(): Promise<void> {
  if (typeof wx === 'undefined' || !wx.getPrivacySetting) return;

  const setting = await new Promise<WechatMiniprogram.GetPrivacySettingSuccessCallbackResult>(
    (resolve, reject) =>
      wx.getPrivacySetting({ success: resolve, fail: reject }),
  );

  if (!setting.needAuthorization) return;

  await new Promise<void>((resolve, reject) => {
    wx.requirePrivacyAuthorize({
      success: () => resolve(),
      fail: () => {
        wx.exitMiniProgram({ fail: () => {} });
        reject(new Error('PRIVACY_DECLINED'));
      },
    });
  });
}
