import { _decorator, Component, director } from 'cc';
import { applyScreenBackground } from './UiAssets';

const { ccclass } = _decorator;

/**
 * 挂在 Canvas：加载大厅背景图。
 * UI 由 Controller 代码生成，需点「播放」才看得到按钮；背景本组件在编辑模式也会尝试加载。
 */
@ccclass('SceneUiBackground')
export class SceneUiBackground extends Component {
  private _busy = false;
  private _refreshQueued = false;

  onLoad(): void {
    const tryApply = (): void => {
      if (!director.root?.batcher2D) {
        this.scheduleOnce(tryApply, 0.05);
        return;
      }
      this.refresh();
    };
    tryApply();
  }

  /**
   * 背景资源加载与真机尺寸就绪可能交错发生。把多次刷新合并到同一串行队列，
   * 保证最后一次一定按当前可见尺寸重新铺满，不让旧尺寸的异步结果露出 Canvas 黑底。
   */
  refresh(): void {
    this._refreshQueued = true;
    if (!this._busy) void this._apply();
  }

  private async _apply(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      do {
        this._refreshQueued = false;
        await applyScreenBackground(this.node, 'lobby');
      } while (this._refreshQueued && this.node.isValid);
    } catch (err) {
      console.warn('[SceneUiBackground]', err);
    } finally {
      this._busy = false;
    }
  }
}
