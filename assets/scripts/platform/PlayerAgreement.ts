export const AGREEMENT_VERSION = '2026-06-26-v1';

const KEY_ACCEPTED = 'ttzt_agmnt_accepted';
const KEY_VERSION = 'ttzt_agmnt_version';

export function isAgreementNeeded(): boolean {
  if (typeof wx === 'undefined') return false;
  try {
    return !(
      wx.getStorageSync(KEY_ACCEPTED) === true &&
      wx.getStorageSync(KEY_VERSION) === AGREEMENT_VERSION
    );
  } catch {
    return true;
  }
}

export function saveAgreement(): void {
  if (typeof wx === 'undefined') return;
  try {
    wx.setStorageSync(KEY_ACCEPTED, true);
    wx.setStorageSync(KEY_VERSION, AGREEMENT_VERSION);
  } catch {
    // 忽略存储失败，下次启动重新确认
  }
}
