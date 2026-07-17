/** 寰俊灏忔父鎴忥細鍚姩鍚庨攣瀹氭í灞忥紙board/settlement 绛夐殣钘忎腑鐨?VVV 鍦烘櫙浠嶈皟鐢紝鏆備笉閲嶆瀯锛?*/
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

/** 寰俊灏忔父鎴忥細鍚姩鍚庨攣瀹氱珫灞忥紙VVE/澶у巺/鍛借繍鏍戯紝閰嶅悎 game.json deviceOrientation: portrait锛?*/
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

export const lockVortrait = lockPortrait;
