import { _decorator, Component, Label } from 'cc';
import { SceneLoader } from './SceneLoader';
import { PERF_TRACE_ENABLED } from './Constants';
import { PerfMarks } from './PerfMarks';
import { initWxCloud } from '../platform/wechat/WxCloudInit';
import { login } from '../platform/wechat/WxAuth';
import { lockPortrait } from '../platform/wechat/WxLandscape';
import { refreshScreenAdapt } from '../platform/wechat/ViewAdapt';
import {
  ensureResourcesBundle,
  getCachedSprite,
  preloadLobbyBackgroundAssets,
  preloadLobbyUi,
} from '../ui/UiAssets';

const { ccclass, property } = _decorator;

/**
 * 启动入口：挂载在 bootstrap 场景 Canvas 上
 * P0：云开发初始化 + 登录 → AC-1
 */
@ccclass('GameApp')
export class GameApp extends Component {
  @property(Label)
  statusLabel: Label | null = null;

  async onLoad() {
    if (PERF_TRACE_ENABLED) PerfMarks.mark('app_start');
    lockPortrait();
    this.scheduleOnce(() => refreshScreenAdapt(this.node), 0);
    this.scheduleOnce(() => refreshScreenAdapt(this.node), 0.15);
    this._setStatus('初始化…');
    if (typeof wx === 'undefined' || !wx.cloud) {
      this._setStatus('编辑器预览：加载资源…');
      await ensureResourcesBundle();
      this._setStatus('编辑器预览：2 秒后进入大厅（无 wx 登录）');
      this.scheduleOnce(() => SceneLoader.loadLobby(), 2);
      return;
    }
    await initWxCloud();
    if (PERF_TRACE_ENABLED) PerfMarks.mark('wx_cloud_init_done');

    try {
      // 登录（网络）和资源分包加载（IO）原本串行，互相不依赖 → 并行执行缩短主路径。
      // bundle 失败会被分包逻辑直接 reject，整个 try 块会进入 catch；登录失败同理。
      this._setStatus('登录与资源加载中…');
      const [user, bundle] = await Promise.all([login(), ensureResourcesBundle()]);
      if (PERF_TRACE_ENABLED) {
        PerfMarks.mark('login_done');
        PerfMarks.mark('resources_bundle_done');
      }
      if (!bundle) {
        this._setStatus('资源包加载失败，请清缓存后重试');
        return;
      }
      this._setStatus(`已登录：${user.nickname}`);
      console.log('[GameApp] login ok', user);

      // 大厅首屏 UI 加载：原本 await 全部 7 张图加载完再切场景，最坏 5~7s 黑屏。
      // 改为 Promise.race 软上限 1500ms —— 到点先进大厅（背景/按钮支持异步回填，
      // 缺图时显示 Graphics 占位与文本按钮，不影响点击），剩余资源后台补齐。
      // 关键的 bg_lobby 仍尽量在切场景前到位（≤1.5s）；超时后由 LobbyController 内部
      // applyScreenBackground / loadUiSprite 链路自然补刷。
      const lobbyUiSoftTimeoutMs = 1500;
      const lobbyUiReady = preloadLobbyUi();
      await Promise.race([
        lobbyUiReady,
        new Promise<void>((resolve) => setTimeout(resolve, lobbyUiSoftTimeoutMs)),
      ]);
      if (PERF_TRACE_ENABLED) PerfMarks.mark('preload_lobby_ui_done');
      console.log(
        '[GameApp] lobby bg',
        getCachedSprite('backgrounds/bg_lobby') ? 'ready' : 'pending (will hydrate)',
      );
      SceneLoader.loadLobby();
      if (PERF_TRACE_ENABLED) PerfMarks.mark('lobby_scene_loaded');
      void lobbyUiReady; // 后台继续 preload，缺图回填由 LobbyController 处理
      void preloadLobbyBackgroundAssets().then(() => {
        if (PERF_TRACE_ENABLED) PerfMarks.mark('lobby_bg_preload_done');
      });
      if (PERF_TRACE_ENABLED) setTimeout(() => PerfMarks.dump(), 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this._setStatus(`登录失败：${msg}`);
      console.error('[GameApp] login failed', err);
    }
  }

  private _setStatus(text: string) {
    if (this.statusLabel) {
      this.statusLabel.string = text;
    }
    console.log('[GameApp]', text);
  }
}
