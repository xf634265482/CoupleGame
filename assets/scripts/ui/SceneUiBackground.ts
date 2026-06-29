import { _decorator, Component, director } from 'cc';
import { applyScreenBackground, preloadPveLobbyUi } from './UiAssets';

const { ccclass } = _decorator;

/**
 * 挂在 Canvas：加载大厅背景图。
 * UI 由 Controller 代码生成，需点「播放」才看得到按钮；背景本组件在编辑模式也会尝试加载。
 */
@ccclass('SceneUiBackground')
export class SceneUiBackground extends Component {
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

  private async _apply(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      await preloadPveLobbyUi();
      await applyScreenBackground(this.node, 'lobby');
    } catch (err) {
      console.warn('[SceneUiBackground]', err);
    } finally {
      this._busy = false;
    }
  }
}
