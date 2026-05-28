/** 微信分享房间号 → AC-2 */
export function shareRoom(roomCode: string): void {
  if (typeof wx === 'undefined' || !wx.shareAppMessage) {
    console.warn('[WxShare] wx.shareAppMessage 不可用');
    return;
  }

  wx.shareAppMessage({
    title: `来一起玩！房间号 ${roomCode}`,
    query: `roomCode=${roomCode}`,
  });
}

/** 从启动参数解析分享带入的房间号 */
export function parseLaunchRoomCode(options?: {
  query?: Record<string, string>;
}): string | null {
  const code = options?.query?.roomCode;
  return code ? String(code) : null;
}
