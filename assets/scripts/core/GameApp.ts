import { _decorator, Component, dynamicAtlasManager, Label } from 'cc';
import { SceneLoader } from './SceneLoader';
import { PERF_TRACE_ENABLED } from './Constants';
import { PerfMarks } from './PerfMarks';
import { initWxCloud } from '../platform/wechat/WxCloudInit';
import { login } from '../platform/wechat/WxAuth';
import { lockPortrait } from '../platform/wechat/WxLandscape';
import { applyPortraitResolution, refreshScreenAdapt } from '../platform/wechat/ViewAdapt';
import { ensurePrivacyAuthorized } from '../platform/wechat/WxPrivacy';
import { AgreementScreen } from '../ui/AgreementScreen';
import {
  ensureResourcesBundle,
  getCachedSprite,
  preloadPveLobbyUi,
} from '../ui/UiAssets';
import { AudioManager } from '../audio/AudioManager';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import { PveDebug } from '../pve/debug/PveDebug';

const { ccclass, property } = _decorator;

const STARTUP_OVERLAY_TIMEOUT_MS = 30000;
const OVERLAY_COMPLETE_DELAY_MS = 260;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWechatDevtoolsLike(): boolean {
  if (typeof wx === 'undefined') {
    return false;
  }
  try {
    return wx.getSystemInfoSync?.().platform === 'devtools';
  } catch {
    return false;
  }
}

@ccclass('GameApp')
export class GameApp extends Component {
  @property(Label)
  statusLabel: Label | null = null;

  private _startupOverlayVisible = false;

  async onLoad() {
    PveDebug.install();
    if (PERF_TRACE_ENABLED) PerfMarks.mark('app_start');
    try { dynamicAtlasManager.enabled = false; } catch {}
    lockPortrait();
    applyPortraitResolution();
    this.scheduleOnce(() => { refreshScreenAdapt(this.node); LoadingOverlay.recompute(); }, 0);
    this.scheduleOnce(() => { refreshScreenAdapt(this.node); LoadingOverlay.recompute(); }, 0.15);

    this._showStartupOverlay();
    this._setStartupStage('正在启动…', 0.05, '迷雾中的高塔正在苏醒');

    if (typeof wx === 'undefined' || !wx.cloud) {
      this._setStartupStage('编辑器预览：正在加载资源…', 0.55);
      await ensureResourcesBundle();
      AudioManager.preload();
      await this._completeStartupOverlay('编辑器预览：正在进入大厅…');
      SceneLoader.loadLobby();
      return;
    }

    this._setStartupStage('正在初始化微信能力…', 0.15);
    await initWxCloud();
    if (PERF_TRACE_ENABLED) PerfMarks.mark('wx_cloud_init_done');

    this._setStartupStage('正在确认隐私授权…', 0.3);
    await ensurePrivacyAuthorized();
    if (PERF_TRACE_ENABLED) PerfMarks.mark('privacy_authorized_done');

    this._hideStartupOverlay();
    await AgreementScreen.show(this.node);
    this._showStartupOverlay();

    try {
      this._setStartupStage('正在登录…', 0.55, '远征之路正在缓缓展开');
      const lobbyBundleReady = ensureResourcesBundle();
      const user = await login();
      if (PERF_TRACE_ENABLED) {
        PerfMarks.mark('login_done');
      }
      AudioManager.preload();

      this._setStartupStage(`欢迎回来，${user.nickname}`, 0.72, '你的命运轨迹已经重新接续');
      console.log('[GameApp] login ok', user);

      if (isWechatDevtoolsLike()) {
        const bundle = await lobbyBundleReady;
        if (!bundle) {
          this._setStartupStage('资源加载失败，请清缓存后重试', 0.55, '远征暂时未能展开');
          return;
        }
        if (PERF_TRACE_ENABLED) {
          PerfMarks.mark('resources_bundle_done');
        }
        await preloadPveLobbyUi();
        if (PERF_TRACE_ENABLED) PerfMarks.mark('preload_lobby_ui_done');
      }

      await this._completeStartupOverlay('正在进入大厅…');
      SceneLoader.loadLobby();
      if (PERF_TRACE_ENABLED) PerfMarks.mark('lobby_scene_loaded');

      if (!isWechatDevtoolsLike()) {
        void lobbyBundleReady.then((bundle) => {
          if (!bundle) {
            console.warn('[GameApp] resources bundle hydrate failed after lobby entry');
            return;
          }
          if (PERF_TRACE_ENABLED) {
            PerfMarks.mark('resources_bundle_done');
          }
          return preloadPveLobbyUi().then(() => {
            if (PERF_TRACE_ENABLED) PerfMarks.mark('preload_lobby_ui_done');
            console.log(
              '[GameApp] lobby bg',
              getCachedSprite('backgrounds/bg_lobby') ? 'ready' : 'pending (will hydrate)',
            );
          });
        });
      }

      if (PERF_TRACE_ENABLED) setTimeout(() => PerfMarks.dump(), 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this._setStartupStage(`登录失败：${msg}`, 0.55, '远征暂时未能展开');
      console.error('[GameApp] login failed', err);
    }
  }

  private _showStartupOverlay(): void {
    this._startupOverlayVisible = true;
    LoadingOverlay.show(this.node, '正在启动…', {
      mode: 'startup',
      title: '命运远征',
      subtitle: '迷雾中的高塔正在苏醒',
      hint: '正在展开你的远征世界',
      progress: 0.05,
      timeoutMs: STARTUP_OVERLAY_TIMEOUT_MS,
      hideOnTimeout: false,
      onTimeout: () => {
        this._setStartupStage('启动较慢，仍在继续加载…', 0.88, '远征仍在准备中…');
      },
    });
  }

  private async _completeStartupOverlay(text: string): Promise<void> {
    // 场景切换会销毁本 Canvas 上的 overlay；停在高水位，交给大厅续跑
    this._setStartupStage(text, 0.92, '通往大厅的路已经显现');
    await delay(OVERLAY_COMPLETE_DELAY_MS);
    this._hideStartupOverlay();
  }

  private _hideStartupOverlay(): void {
    if (!this._startupOverlayVisible) return;
    this._startupOverlayVisible = false;
    LoadingOverlay.hide();
  }

  private _setStartupStage(text: string, progress: number, subtitle?: string): void {
    if (this.statusLabel) {
      this.statusLabel.string = text;
    }
    if (this._startupOverlayVisible) {
      LoadingOverlay.update({
        text,
        progress,
        subtitle,
      });
    }
    console.log('[GameApp]', text);
  }
}
