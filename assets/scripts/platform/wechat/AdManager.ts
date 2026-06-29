declare const wx: unknown;

type WxAdError = {
  errCode?: number;
  errMsg?: string;
};

type WxSafeArea = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

type WxSystemInfo = {
  screenWidth: number;
  screenHeight: number;
  safeArea?: WxSafeArea;
};

type RewardedVideoAdInstance = {
  show: () => Promise<void>;
  load: () => Promise<void>;
  destroy?: () => void;
  offLoad?: (fn?: () => void) => void;
  offError?: (fn?: (err: WxAdError) => void) => void;
  offClose?: (fn?: (res?: { isEnded?: boolean }) => void) => void;
  onLoad: (fn: () => void) => void;
  onError: (fn: (err: WxAdError) => void) => void;
  onClose: (fn: (res?: { isEnded?: boolean }) => void) => void;
};

type BannerAdStyle = {
  left: number;
  top: number;
  width: number;
  height?: number;
  realWidth?: number;
  realHeight?: number;
};

type BannerAdInstance = {
  style: BannerAdStyle;
  show: () => Promise<void>;
  hide: () => void;
  destroy: () => void;
  offLoad?: (fn?: () => void) => void;
  offError?: (fn?: (err: WxAdError) => void) => void;
  offResize?: (fn?: (size: { width: number; height: number }) => void) => void;
  onLoad: (fn: () => void) => void;
  onError: (fn: (err: WxAdError) => void) => void;
  onResize?: (fn: (size: { width: number; height: number }) => void) => void;
};

type InterstitialAdInstance = {
  show: () => Promise<void>;
  load?: () => Promise<void>;
  destroy?: () => void;
  offLoad?: (fn?: () => void) => void;
  offError?: (fn?: (err: WxAdError) => void) => void;
  offClose?: (fn?: () => void) => void;
  onLoad?: (fn: () => void) => void;
  onError: (fn: (err: WxAdError) => void) => void;
  onClose?: (fn: () => void) => void;
};

type WxLike = {
  createRewardedVideoAd?: (options: { adUnitId: string }) => RewardedVideoAdInstance;
  createBannerAd?: (options: { adUnitId: string; style: BannerAdStyle }) => BannerAdInstance;
  createInterstitialAd?: (options: { adUnitId: string }) => InterstitialAdInstance;
  getSystemInfoSync?: () => WxSystemInfo;
};

export type RewardAdType =
  | 'restore_stamina'
  | 'destiny_tree_reset'
  | 'reroll_strengthen_once'
  | 'revive_half_hp_once';

export interface RewardAdOptions {
  rewardCallback?: () => void | Promise<void>;
  cancelCallback?: () => void;
  failCallback?: (message: string) => void;
  beforeShowCheck?: () => boolean | string;
  rewardName?: string;
}

export interface RewardAdResult {
  ok: boolean;
  rewarded: boolean;
  cancelled: boolean;
  reason: string;
}

export interface AdConfig {
  debug?: boolean;
  rewardAdUnitId: string;
  bannerAdUnitId: string;
  interstitialAdUnitId?: string;
  bannerBottomMargin?: number;
  bannerWidth?: number;
  interstitialCooldownMs?: number;
}

type ActiveRewardRequest = {
  type: RewardAdType;
  options: RewardAdOptions;
  resolve: (result: RewardAdResult) => void;
  finished: boolean;
};

export const REWARD_DESCRIPTIONS: Record<RewardAdType, string> = {
  restore_stamina: '观看完整广告后恢复一定体力',
  destiny_tree_reset: '每日可通过广告免费重置命运树 1 次',
  reroll_strengthen_once: '本局远征内可通过广告重抽强化词条 1 次',
  revive_half_hp_once: '本局死亡后可通过广告原地复活 1 次，并恢复 50% 最大生命',
};

const DEFAULT_CONFIG = {
  debug: true,
  bannerBottomMargin: 16,
  bannerWidth: 320,
  interstitialCooldownMs: 60_000,
} as const;

function getWx(): WxLike | null {
  if (typeof wx === 'undefined') return null;
  return wx as unknown as WxLike;
}

function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const maybe = err as WxAdError & { message?: string };
    return maybe.errMsg || maybe.message || JSON.stringify(err);
  }
  return String(err);
}

function isRewardFinished(res?: { isEnded?: boolean }): boolean {
  if (res == null) return true;
  return res.isEnded === true;
}

export class AdManager {
  private static _instance: AdManager | null = null;

  public static get instance(): AdManager {
    if (!this._instance) {
      this._instance = new AdManager();
    }
    return this._instance;
  }

  private _config: AdConfig | null = null;
  private _rewardAd: RewardedVideoAdInstance | null = null;
  private _bannerAd: BannerAdInstance | null = null;
  private _interstitialAd: InterstitialAdInstance | null = null;
  private _activeRewardRequest: ActiveRewardRequest | null = null;
  private _rewardReady = false;
  private _rewardLoading = false;
  private _rewardBusy = false;
  private _bannerVisible = false;
  private _interstitialReady = false;
  private _interstitialLoading = false;
  private _interstitialBusy = false;
  private _lastInterstitialAt = 0;

  private constructor() {}

  public init(config: AdConfig): void {
    this.destroy();
    this._config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this._log('init', {
      rewardAdUnitId: this._maskAdUnitId(this._config.rewardAdUnitId),
      bannerAdUnitId: this._maskAdUnitId(this._config.bannerAdUnitId),
      interstitialAdUnitId: this._maskAdUnitId(this._config.interstitialAdUnitId),
    });

    this._ensureRewardAd();
    this._ensureBannerAd();
    this._ensureInterstitialAd();
  }

  public preloadAll(): void {
    this._preloadRewardAd();
    this._preloadInterstitialAd();
  }

  public isRewardAdReady(): boolean {
    return this._rewardReady;
  }

  public getRewardDescription(type: RewardAdType): string {
    return REWARD_DESCRIPTIONS[type] || '';
  }

  public async showRewardAd(type: RewardAdType, options: RewardAdOptions = {}): Promise<RewardAdResult> {
    if (!REWARD_DESCRIPTIONS[type]) {
      return this._failRewardRequest(options, 'invalid_reward_type', `未注册的激励广告类型: ${type}`);
    }

    const wxApi = getWx();
    if (!wxApi?.createRewardedVideoAd) {
      return this._failRewardRequest(options, 'wx_unavailable', '当前环境不支持激励视频广告');
    }

    if (!this._config?.rewardAdUnitId) {
      return this._failRewardRequest(options, 'missing_reward_ad_unit_id', '未配置激励视频广告位 ID');
    }

    if (this._rewardBusy || this._activeRewardRequest) {
      return this._failRewardRequest(options, 'reward_busy', '激励视频广告正在展示中');
    }

    const beforeCheck = options.beforeShowCheck?.();
    if (beforeCheck !== undefined && beforeCheck !== true) {
      const reason = typeof beforeCheck === 'string' && beforeCheck.trim()
        ? beforeCheck.trim()
        : '当前条件不满足，无法观看该奖励广告';
      return this._failRewardRequest(options, 'before_check_failed', reason);
    }

    this._ensureRewardAd();
    if (!this._rewardAd) {
      return this._failRewardRequest(options, 'create_failed', '激励视频广告实例创建失败');
    }

    this._rewardBusy = true;
    this._log('showRewardAd.request', {
      type,
      rewardName: options.rewardName || this.getRewardDescription(type),
      ready: this._rewardReady,
    });

    return new Promise<RewardAdResult>(async (resolve) => {
      this._activeRewardRequest = {
        type,
        options,
        resolve,
        finished: false,
      };

      try {
        if (!this._rewardReady) {
          await this._preloadRewardAd();
        }
        await this._rewardAd!.show();
        this._log('showRewardAd.opened', { type });
      } catch (err) {
        this._logError('showRewardAd.showFailed', err);
        try {
          await this._preloadRewardAd(true);
          await this._rewardAd!.show();
          this._log('showRewardAd.openedAfterReload', { type });
        } catch (reloadErr) {
          await this._resolveActiveReward(false, false, 'show_failed', normalizeError(reloadErr));
        }
      }
    });
  }

  public showBanner(): void {
    const wxApi = getWx();
    if (!wxApi?.createBannerAd) {
      this._log('showBanner.skipped', '当前环境不支持 Banner 广告');
      return;
    }
    if (!this._config?.bannerAdUnitId) {
      this._log('showBanner.skipped', '未配置 Banner 广告位 ID');
      return;
    }

    this._ensureBannerAd();
    if (!this._bannerAd) {
      this._log('showBanner.failed', 'Banner 广告实例创建失败');
      return;
    }

    this._repositionBanner(this._bannerAd);
    void this._bannerAd.show()
      .then(() => {
        this._bannerVisible = true;
        this._log('showBanner.success');
      })
      .catch((err) => {
        this._bannerVisible = false;
        this._logError('showBanner.failed', err);
      });
  }

  public hideBanner(): void {
    if (!this._bannerAd) return;
    try {
      this._bannerAd.hide();
      this._bannerVisible = false;
      this._log('hideBanner.success');
    } catch (err) {
      this._logError('hideBanner.failed', err);
    }
  }

  public async showInterstitial(scene = 'unknown'): Promise<boolean> {
    const wxApi = getWx();
    if (!wxApi?.createInterstitialAd) {
      this._log('showInterstitial.skipped', '当前环境不支持插屏广告');
      return false;
    }
    if (!this._config?.interstitialAdUnitId) {
      this._log('showInterstitial.skipped', '未配置插屏广告位 ID');
      return false;
    }
    if (this._interstitialBusy) {
      this._log('showInterstitial.skipped', { scene, reason: 'interstitial_busy' });
      return false;
    }

    const cooldownMs = this._config.interstitialCooldownMs ?? DEFAULT_CONFIG.interstitialCooldownMs;
    const now = Date.now();
    if (now - this._lastInterstitialAt < cooldownMs) {
      this._log('showInterstitial.cooldown', {
        scene,
        remainingMs: cooldownMs - (now - this._lastInterstitialAt),
      });
      return false;
    }

    this._ensureInterstitialAd();
    if (!this._interstitialAd) {
      this._log('showInterstitial.failed', '插屏广告实例创建失败');
      return false;
    }

    this._interstitialBusy = true;
    try {
      if (!this._interstitialReady) {
        await this._preloadInterstitialAd();
      }
      await this._interstitialAd.show();
      this._lastInterstitialAt = Date.now();
      this._interstitialReady = false;
      this._log('showInterstitial.success', { scene });
      void this._preloadInterstitialAd(true);
      return true;
    } catch (err) {
      this._logError('showInterstitial.failed', err);
      return false;
    } finally {
      this._interstitialBusy = false;
    }
  }

  public destroy(): void {
    if (this._activeRewardRequest && !this._activeRewardRequest.finished) {
      this._activeRewardRequest.finished = true;
      this._activeRewardRequest.resolve({
        ok: false,
        rewarded: false,
        cancelled: false,
        reason: 'destroyed',
      });
    }

    this._rewardReady = false;
    this._rewardLoading = false;
    this._rewardBusy = false;
    this._interstitialReady = false;
    this._interstitialLoading = false;
    this._interstitialBusy = false;
    this._bannerVisible = false;
    this._activeRewardRequest = null;

    this._destroyRewardAd();
    this._destroyBannerAd();
    this._destroyInterstitialAd();
  }

  private _ensureRewardAd(): void {
    if (this._rewardAd || !this._config?.rewardAdUnitId) return;
    const wxApi = getWx();
    if (!wxApi?.createRewardedVideoAd) return;

    try {
      this._rewardAd = wxApi.createRewardedVideoAd({ adUnitId: this._config.rewardAdUnitId });
      this._rewardAd.onLoad(() => {
        this._rewardReady = true;
        this._rewardLoading = false;
        this._log('rewardAd.loaded');
      });
      this._rewardAd.onError((err) => {
        this._rewardReady = false;
        this._rewardLoading = false;
        this._logError('rewardAd.error', err);
      });
      this._rewardAd.onClose((res) => {
        void this._handleRewardClosed(res);
      });
      this._log('rewardAd.created');
    } catch (err) {
      this._rewardAd = null;
      this._rewardReady = false;
      this._logError('rewardAd.createFailed', err);
    }
  }

  private _ensureBannerAd(): void {
    if (this._bannerAd || !this._config?.bannerAdUnitId) return;
    const wxApi = getWx();
    if (!wxApi?.createBannerAd) return;

    const systemInfo = this._getSystemInfo();
    const width = this._getBannerWidth(systemInfo);
    const style: BannerAdStyle = {
      left: 0,
      top: 0,
      width,
    };

    try {
      this._bannerAd = wxApi.createBannerAd({
        adUnitId: this._config.bannerAdUnitId,
        style,
      });
      this._bannerAd.onLoad(() => {
        this._log('bannerAd.loaded');
      });
      this._bannerAd.onError((err) => {
        this._logError('bannerAd.error', err);
      });
      this._bannerAd.onResize?.((size) => {
        if (!this._bannerAd) return;
        this._bannerAd.style.width = size.width;
        this._bannerAd.style.height = size.height;
        this._repositionBanner(this._bannerAd);
        this._log('bannerAd.resized', size);
      });
      this._repositionBanner(this._bannerAd);
      this._log('bannerAd.created');
    } catch (err) {
      this._bannerAd = null;
      this._logError('bannerAd.createFailed', err);
    }
  }

  private _ensureInterstitialAd(): void {
    if (this._interstitialAd || !this._config?.interstitialAdUnitId) return;
    const wxApi = getWx();
    if (!wxApi?.createInterstitialAd) return;

    try {
      this._interstitialAd = wxApi.createInterstitialAd({ adUnitId: this._config.interstitialAdUnitId });
      this._interstitialAd.onLoad?.(() => {
        this._interstitialReady = true;
        this._interstitialLoading = false;
        this._log('interstitialAd.loaded');
      });
      this._interstitialAd.onError((err) => {
        this._interstitialReady = false;
        this._interstitialLoading = false;
        this._logError('interstitialAd.error', err);
      });
      this._interstitialAd.onClose?.(() => {
        this._log('interstitialAd.closed');
      });
      this._log('interstitialAd.created');
    } catch (err) {
      this._interstitialAd = null;
      this._interstitialReady = false;
      this._logError('interstitialAd.createFailed', err);
    }
  }

  private async _preloadRewardAd(force = false): Promise<void> {
    if (!force && (this._rewardReady || this._rewardLoading)) return;
    this._ensureRewardAd();
    if (!this._rewardAd) return;

    this._rewardLoading = true;
    this._rewardReady = false;
    this._log('rewardAd.preload.start');
    try {
      await this._rewardAd.load();
      this._rewardReady = true;
      this._log('rewardAd.preload.success');
    } catch (err) {
      this._rewardReady = false;
      this._logError('rewardAd.preload.failed', err);
      throw err;
    } finally {
      this._rewardLoading = false;
    }
  }

  private async _preloadInterstitialAd(force = false): Promise<void> {
    if (!force && (this._interstitialReady || this._interstitialLoading)) return;
    this._ensureInterstitialAd();
    if (!this._interstitialAd?.load) return;

    this._interstitialLoading = true;
    this._interstitialReady = false;
    this._log('interstitialAd.preload.start');
    try {
      await this._interstitialAd.load();
      this._interstitialReady = true;
      this._log('interstitialAd.preload.success');
    } catch (err) {
      this._interstitialReady = false;
      this._logError('interstitialAd.preload.failed', err);
    } finally {
      this._interstitialLoading = false;
    }
  }

  private async _handleRewardClosed(res?: { isEnded?: boolean }): Promise<void> {
    const rewarded = isRewardFinished(res);
    const reason = rewarded ? 'rewarded' : 'cancelled';
    await this._resolveActiveReward(rewarded, !rewarded, reason);
  }

  private async _resolveActiveReward(
    rewarded: boolean,
    cancelled: boolean,
    reason: string,
    errorMessage?: string,
  ): Promise<void> {
    const request = this._activeRewardRequest;
    if (!request || request.finished) return;

    request.finished = true;
    this._activeRewardRequest = null;
    this._rewardBusy = false;
    this._rewardReady = false;

    try {
      if (rewarded) {
        this._log('showRewardAd.rewarded', {
          type: request.type,
          rewardName: request.options.rewardName || this.getRewardDescription(request.type),
        });
        await request.options.rewardCallback?.();
      } else if (cancelled) {
        this._log('showRewardAd.cancelled', { type: request.type });
        request.options.cancelCallback?.();
      } else if (errorMessage) {
        this._log('showRewardAd.failed', { type: request.type, errorMessage });
        request.options.failCallback?.(errorMessage);
      }
    } catch (callbackErr) {
      this._logError('showRewardAd.callbackFailed', callbackErr);
      errorMessage = normalizeError(callbackErr);
      rewarded = false;
      cancelled = false;
      reason = 'reward_callback_failed';
      request.options.failCallback?.(errorMessage);
    } finally {
      request.resolve({
        ok: rewarded,
        rewarded,
        cancelled,
        reason,
      });
      void this._preloadRewardAd(true);
    }
  }

  private _failRewardRequest(
    options: RewardAdOptions,
    reason: string,
    message: string,
  ): RewardAdResult {
    this._log('showRewardAd.rejected', { reason, message });
    options.failCallback?.(message);
    return {
      ok: false,
      rewarded: false,
      cancelled: false,
      reason,
    };
  }

  private _repositionBanner(bannerAd: BannerAdInstance): void {
    const systemInfo = this._getSystemInfo();
    if (!systemInfo) return;

    const margin = this._config?.bannerBottomMargin ?? DEFAULT_CONFIG.bannerBottomMargin;
    const safeBottom = systemInfo.safeArea ? systemInfo.screenHeight - systemInfo.safeArea.bottom : 0;
    const width = bannerAd.style.realWidth || bannerAd.style.width || this._getBannerWidth(systemInfo);
    const height = bannerAd.style.realHeight || bannerAd.style.height || 96;

    bannerAd.style.left = Math.max(0, (systemInfo.screenWidth - width) / 2);
    bannerAd.style.top = Math.max(0, systemInfo.screenHeight - height - safeBottom - margin);

    this._log('bannerAd.positioned', {
      left: bannerAd.style.left,
      top: bannerAd.style.top,
      width,
      height,
    });
  }

  private _getSystemInfo(): WxSystemInfo | null {
    const wxApi = getWx();
    if (!wxApi?.getSystemInfoSync) return null;
    try {
      return wxApi.getSystemInfoSync();
    } catch (err) {
      this._logError('getSystemInfoSync.failed', err);
      return null;
    }
  }

  private _getBannerWidth(systemInfo: WxSystemInfo | null): number {
    if (!systemInfo) {
      return this._config?.bannerWidth ?? DEFAULT_CONFIG.bannerWidth;
    }
    const configuredWidth = this._config?.bannerWidth ?? DEFAULT_CONFIG.bannerWidth;
    return Math.min(systemInfo.screenWidth, configuredWidth);
  }

  private _destroyRewardAd(): void {
    if (!this._rewardAd) return;
    try {
      this._rewardAd.offLoad?.();
      this._rewardAd.offError?.();
      this._rewardAd.offClose?.();
      this._rewardAd.destroy?.();
    } catch (err) {
      this._logError('rewardAd.destroyFailed', err);
    } finally {
      this._rewardAd = null;
    }
  }

  private _destroyBannerAd(): void {
    if (!this._bannerAd) return;
    try {
      this._bannerAd.offLoad?.();
      this._bannerAd.offError?.();
      this._bannerAd.offResize?.();
      this._bannerAd.destroy();
    } catch (err) {
      this._logError('bannerAd.destroyFailed', err);
    } finally {
      this._bannerAd = null;
    }
  }

  private _destroyInterstitialAd(): void {
    if (!this._interstitialAd) return;
    try {
      this._interstitialAd.offLoad?.();
      this._interstitialAd.offError?.();
      this._interstitialAd.offClose?.();
      this._interstitialAd.destroy?.();
    } catch (err) {
      this._logError('interstitialAd.destroyFailed', err);
    } finally {
      this._interstitialAd = null;
    }
  }

  private _maskAdUnitId(adUnitId?: string): string {
    if (!adUnitId) return '';
    if (adUnitId.length <= 8) return adUnitId;
    return `${adUnitId.slice(0, 4)}***${adUnitId.slice(-4)}`;
  }

  private _log(action: string, payload?: unknown): void {
    if (!this._config?.debug) return;
    if (payload === undefined) {
      console.log(`[AdManager] ${action}`);
      return;
    }
    console.log(`[AdManager] ${action}`, payload);
  }

  private _logError(action: string, err: unknown): void {
    console.warn(`[AdManager] ${action}`, normalizeError(err), err);
  }
}
