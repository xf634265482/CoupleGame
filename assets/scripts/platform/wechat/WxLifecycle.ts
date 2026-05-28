import { GameSession } from '../../core/GameSession';
import { quitGame } from '../../network/GameService';

/** 切后台/关闭时退出对局 → AC-13 */
export function bindWxHideQuit(onAfter?: () => void): () => void {
  if (typeof wx === 'undefined' || !wx.onHide) {
    return () => undefined;
  }

  const handler = () => {
    const gameId = GameSession.gameId;
    if (!gameId) return;
    void quitGame(gameId)
      .then(() => onAfter?.())
      .catch((err) => console.warn('[WxLifecycle] quit on hide', err));
  };

  wx.onHide(handler);
  return () => {
    wx.offHide?.(handler);
  };
}
