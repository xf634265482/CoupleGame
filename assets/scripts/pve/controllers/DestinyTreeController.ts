// 命运之树场景主控（specs/260610-destiny-tree-ui）：账户级局外成长树入口。
// 拉取 PveMeta → 渲染 5x3 节点网格；点击可解锁节点时调用云端 unlockTreeNode（服务端权威重新校验）。

import { _decorator, Component } from 'cc';
import { SceneLoader } from '../../core/SceneLoader';
import { lockPortrait } from '../../platform/wechat/WxLandscape';
import { applyUiLayerTree, refreshScreenAdapt, visibleDesignSize } from '../../platform/wechat/ViewAdapt';
import { loadPveMeta, unlockTreeNode, resetTree } from '../../network/PveService';
import { preloadPveUi } from '../../ui/UiAssets';
import { TREE_RESET_DIAMOND_COST } from '../core/PveConstants';
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
    void preloadPveUi();

    const { w: screenW, h: screenH } = visibleDesignSize();

    this._view = new DestinyTreeView(this.node, screenW, screenH, (nodeId) => this._onUnlock(nodeId));
    this._view.setOnBack(() => SceneLoader.loadLobby());
    this._view.setOnReset(() => void this._onReset());

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

  private async _onReset(): Promise<void> {
    if (this._busy || !this._meta) return;
    const diamond = this._meta.diamond;
    const unlockedCount = this._meta.unlockedTreeNodes?.length ?? 0;
    if (unlockedCount === 0) {
      this._toast?.toast('命运树尚未解锁任何节点');
      return;
    }
    const confirmed = await this._toast?.showConfirm(
      `重置命运树\n消耗 ${TREE_RESET_DIAMOND_COST} 💎（当前 ${diamond}），退还全部命运碎片`,
      [
        { label: '确认重置', value: 'yes' },
        { label: '取消', value: 'no' },
      ],
    );
    if (confirmed !== 'yes') return;
    this._busy = true;
    try {
      const { meta } = await resetTree();
      this._meta = meta;
      this._view?.render(meta);
      this._toast?.toast('命运树已重置，碎片已全额退还');
    } catch (err) {
      this._toast?.toast(`重置失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this._busy = false;
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
