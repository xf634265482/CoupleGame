/** 切后台时执行回调（PVP quit 逻辑已随 PVP 移除） */
export function bindWxHideQuit(onAfter?: () => void): () => void {
  if (typeof wx === 'undefined' || !wx.onHide) {
    return () => undefined;
  }
  const handler = () => onAfter?.();
  wx.onHide(handler);
  return () => {
    wx.offHide?.(handler);
  };
}
