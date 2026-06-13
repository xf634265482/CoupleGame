// 命运之树场景主控（specs/260610-destiny-tree-ui）：账户级局外成长树入口。
// 拉取 PveMeta → 渲染 5x3 节点网格；点击可解锁节点时调用云端 unlockTreeNode（服务端权威重新校验）。

import { _decorator, Component } from 'cc';
import { SceneLoader } from '../../core/SceneLoader';
import { lockPortrait } from '../../platform/wechat/WxLandscape';
import { applyUiLayerTree, refreshScreenAdapt, visibleDesignSize } from '../../platform/wechat/ViewAdapt';
import { loadPveMeta, unlockTreeNode } from '../../network/PveService';
import type { PveMeta } from '../core/PveTypes';
import { DestinyTreeView } from '../views/DestinyTreeView';
import { PveToastView } from '../views/PveToastView';

const { ccclass } = _decorator;

@ccclass('DestinyTreeController')
export class DestinyTreeController extends Component {
  private _view: DestinyTreeView | null = null;
  private _toast: PveToastView | null = null;
  private _meta: PveMeta | null = null;
  private _busy = false;

  onLoad(): void {
    lockPortrait();
    refreshScreenAdapt(this.node);
    this.scheduleOnce(() => refreshScreenAdapt(this.node), 0);
    applyUiLayerTree(this.node, this.node.layer);

    const { w: screenW, h: screenH } = visibleDesignSize();

    this._view = new DestinyTreeView(this.node, screenW, screenH, (nodeId) => this._onUnlock(nodeId));
    this._view.setOnBack(() => SceneLoader.loadLobby());

    this._toast = new PveToastView(this.node, screenW, screenH);

    void this._bootstrap();
  }

  onDestroy(): void {
    this._view?.destroy();
    this._toast?.destroy();
  }

  private async _bootstrap(): Promise<void> {
    try {
      const { meta } = await loadPveMeta();
      this._meta = meta;
      this._view?.render(meta);
    } catch (err) {
      this._toast?.toast(`加载命运树失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async _onUnlock(nodeId: string): Promise<void> {
    if (this._busy || !this._meta) return;
    this._busy = true;
    try {
      const { meta } = await unlockTreeNode(nodeId);
      this._meta = meta;
      this._view?.render(meta);
    } catch (err) {
      this._toast?.toast(`解锁失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._busy = false;
    }
  }
}
