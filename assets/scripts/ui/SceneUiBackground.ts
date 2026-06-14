import { _decorator, Component, director, Enum } from 'cc';
import {
  applyScreenBackground,
  preloadBoardUi,
  preloadLobbyUi,
  preloadSettlementUi,
  type ScreenBgKey,
} from './UiAssets';

const { ccclass, property, executeInEditMode } = _decorator;

enum SceneBgMode {
  LOBBY = 0,
  ROOM = 1,
  BOARD = 2,
  SETTLEMENT = 3,
}

Enum(SceneBgMode);

/**
 * 挂在 Canvas：编辑器与运行时加载 ScreenBg 图片。
 * 大厅/棋盘 UI 由 Controller 代码生成，需点「播放」才看得到按钮；背景本组件在编辑模式也会尝试加载。
 */
@ccclass('SceneUiBackground')
@executeInEditMode(true)
export class SceneUiBackground extends Component {
  @property({ type: Enum(SceneBgMode), tooltip: '本场景使用的全屏背景' })
  mode: SceneBgMode = SceneBgMode.LOBBY;

  private _busy = false;

  onLoad(): void {
    const tryApply = (): void => {
      if (!director.root?.batcher2D) {
        this.scheduleOnce(tryApply, 0.05);
        return;
      }
      void this._apply();
    };
    tryApply();
  }

  private _screenKey(): ScreenBgKey {
    if (this.mode === SceneBgMode.BOARD) return 'board';
    if (this.mode === SceneBgMode.ROOM) return 'room';
    if (this.mode === SceneBgMode.SETTLEMENT) return 'settlement';
    return 'lobby';
  }

  private async _apply(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      const key = this._screenKey();
      if (key === 'board') {
        await preloadBoardUi();
      } else if (key === 'settlement') {
        await preloadSettlementUi();
      } else {
        await preloadLobbyUi();
      }
      await applyScreenBackground(this.node, key);
    } catch (err) {
      console.warn('[SceneUiBackground]', err);
    } finally {
      this._busy = false;
    }
  }
}
