/** 微信小游戏：启动后锁定横屏（board/settlement 等隐藏中的 PVP 场景仍调用，暂不重构） */
export function lockLandscape(): void {
  if (typeof wx === 'undefined') return;
  const api = wx as typeof wx & {
    setDeviceOrientation?: (opt: { value: string }) => void;
  };
  try {
    api.setDeviceOrientation?.({ value: 'landscape' });
  } catch (err) {
    console.warn('[WxLandscape] setDeviceOrientation', err);
  }
}

/** 微信小游戏：启动后锁定竖屏（PVE/大厅/命运树，配合 game.json deviceOrientation: portrait） */
export function lockPortrait(): void {
  if (typeof wx === 'undefined') return;
  const api = wx as typeof wx & {
    setDeviceOrientation?: (opt: { value: string }) => void;
  };
  try {
    api.setDeviceOrientation?.({ value: 'portrait' });
  } catch (err) {
    console.warn('[WxLandscape] setDeviceOrientation', err);
  }
}
