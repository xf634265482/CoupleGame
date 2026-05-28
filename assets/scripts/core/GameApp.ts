import { _decorator, Component, Label } from 'cc';
import { SceneLoader } from './SceneLoader';
import { initWxCloud } from '../platform/wechat/WxCloudInit';
import { login } from '../platform/wechat/WxAuth';

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
    this._setStatus('初始化…');
    const cloudOk = initWxCloud();
    if (!cloudOk) {
      this._setStatus('等待微信环境（编辑器预览无 wx）');
      return;
    }

    try {
      this._setStatus('登录中…');
      const user = await login();
      this._setStatus(`已登录：${user.nickname} · 钻石 ${user.diamond}`);
      console.log('[GameApp] login ok', user);
      SceneLoader.loadLobby();
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
