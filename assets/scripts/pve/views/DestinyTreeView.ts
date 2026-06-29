// 命运之树视图：账户级局外成长树，5 列分支 × 9 层节点。

import { Color, Label, Node, UITransform } from 'cc';
import { canUnlockNode, getUnlockBlockReason } from '../core/DestinyTreeSystem';
import { DESTINY_TREE_NODES, isDestinyTreeNodeLive } from '../core/PveConstants';
import type { PveMeta } from '../core/PveTypes';
import { loadUiSprite } from '../../ui/UiAssets';
import { ensureArtCover } from '../../ui/UiSprite';
import { makeFlatButton, makeLabel } from './pveUiKit';

const TITLE_COLOR  = new Color(245, 220, 130, 255);
const TEXT_COLOR   = new Color(225, 230, 240, 255);
const DIM_COLOR    = new Color(120, 125, 140, 255);
// 全透明风格：节点底色 α≈120（比玩家状态卡更轻），文字加粗保证可读
const UNLOCKED_COLOR = new Color(150, 120, 40, 120);
const UNLOCKABLE_COLOR = new Color(52, 120, 200, 120);
const LOCKED_COLOR = new Color(60, 64, 76, 120);

const BORDER_LOCKED    = new Color(80, 80, 90, 240);
const BORDER_AVAILABLE = new Color(80, 200, 230, 240);
const BORDER_UNLOCKED  = new Color(230, 185, 80, 240);

// 顶部 UI 整体下移：避开微信小程序右上角胶囊（约 ~110px 高度）
const TOP_INFO_OFFSET = 130;

const COLUMN_LABEL: Record<string, string> = {
  A: '守护',
  B: '征伐',
  C: '富集',
  D: '灵脉',
  E: '天命',
};

const COLUMNS: ReadonlyArray<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E'];

const NODE_W = 126;
const NODE_H = 78;
const NODE_X_SPACING = 138;
const NODE_Y_SPACING = 84;
const GRID_TOP_OFFSET = 225;
const COLUMN_LABEL_OFFSET = 58;

/** 命运之树视图：render(meta) 重建 5 列 x 9 层节点布局；onUnlock 由 Controller 处理点击解锁请求。 */
export class DestinyTreeView {
  private _root: Node;
  private _gridRoot: Node;
  private _shardsLabel: Label;
  private _onBack: (() => void) | null = null;
  private _onReset: (() => void) | null = null;

  constructor(parent: Node, private _screenW: number, private _screenH: number, private _onUnlock: (nodeId: string) => void) {
    this._root = new Node('DestinyTreeView');
    this._root.setParent(parent);
    this._root.setPosition(0, 0, 0);
    this._root.addComponent(UITransform).setContentSize(this._screenW, this._screenH);
    void loadUiSprite('pve/backgrounds/bg_destiny_tree').then((frame) => {
      if (!frame || !this._root.isValid) return;
      ensureArtCover(this._root, 'Background', frame, this._screenW, this._screenH).node.setSiblingIndex(0);
    }).catch(() => null);
    const titleLbl = makeLabel(
      this._root, 0, this._screenH / 2 - TOP_INFO_OFFSET,
      600, 48, 32, TITLE_COLOR, Label.HorizontalAlign.CENTER,
    );
    titleLbl.string = '命运之树';
    titleLbl.isBold = true;

    this._shardsLabel = makeLabel(
      this._root, this._screenW / 2 - 160, this._screenH / 2 - TOP_INFO_OFFSET,
      280, 40, 24, TITLE_COLOR, Label.HorizontalAlign.RIGHT,
    );
    this._shardsLabel.isBold = true;

    // 分支标签：每个分支（A-E）一列，标签显示在该列顶部。
    COLUMNS.forEach((col, i) => {
      const x = (i - 2) * NODE_X_SPACING;
      const y = this._screenH / 2 - GRID_TOP_OFFSET + COLUMN_LABEL_OFFSET;
      const lbl = makeLabel(this._root, x, y, NODE_W, 32, 20, TEXT_COLOR, Label.HorizontalAlign.CENTER);
      lbl.string = COLUMN_LABEL[col];
      lbl.isBold = true;
    });

    this._gridRoot = new Node('Grid');
    this._gridRoot.setParent(this._root);
    this._gridRoot.setPosition(0, 0, 0);

    const resetBtn = makeFlatButton(
      this._root, '重置命运树', -120, -this._screenH / 2 + 50, 180, 56,
      () => this._onReset?.(),
      new Color(140, 60, 60, 170),
      { noArt: true, border: new Color(255, 180, 180, 240) },
    );
    const backBtn = makeFlatButton(
      this._root, '返回大厅', 120, -this._screenH / 2 + 50, 180, 56,
      () => this._onBack?.(),
      new Color(52, 73, 95, 170),
      { noArt: true, border: new Color(255, 214, 110, 240) },
    );
    const setLabelBold = (btn: Node) => {
      const l = btn.getChildByName('Label')?.getComponent(Label);
      if (l) l.isBold = true;
    };
    setLabelBold(resetBtn);
    setLabelBold(backBtn);
  }

  setOnBack(cb: () => void): void {
    this._onBack = cb;
  }

  setOnReset(cb: () => void): void {
    this._onReset = cb;
  }

  /** 用最新 PveMeta 重建节点网格（已解锁/可解锁/锁定三态着色）。 */
  render(meta: PveMeta): void {
    this._shardsLabel.string = `命运碎片：${meta.destinyShards}`;
    this._gridRoot.removeAllChildren();

    const unlocked = new Set(meta.unlockedTreeNodes ?? []);

    for (const def of DESTINY_TREE_NODES) {
      const columnIndex = COLUMNS.indexOf(def.column);
      const x = (columnIndex - 2) * NODE_X_SPACING;
      const y = this._screenH / 2 - GRID_TOP_OFFSET - (def.order - 1) * NODE_Y_SPACING;

      const isUnlocked = unlocked.has(def.id);
      const isLive = isDestinyTreeNodeLive(def);
      const canUnlock = isLive && !isUnlocked && canUnlockNode(meta, def.id);
      const color = isUnlocked ? UNLOCKED_COLOR : canUnlock ? UNLOCKABLE_COLOR : LOCKED_COLOR;
      const text = isUnlocked
        ? `✅ ${def.name}\n${def.desc}`
        : `${def.name}\n${def.desc}\n${isLive ? `${def.cost} 碎片` : '规划中'}`;

      const border = isUnlocked ? BORDER_UNLOCKED : canUnlock ? BORDER_AVAILABLE : BORDER_LOCKED;
      const btn = makeFlatButton(
        this._gridRoot, text, x, y, NODE_W, NODE_H,
        () => {
          if (isUnlocked) return;
          if (canUnlock) {
            this._onUnlock(def.id);
            return;
          }
          const reason = getUnlockBlockReason(meta, def.id);
          if (reason?.code === 'MISSING_PREREQUISITE') {
            this._showUnlockNotice(`请先解锁「${reason.prerequisite.name}」`);
          } else if (reason?.code === 'INSUFFICIENT_SHARDS') {
            this._showUnlockNotice(`命运碎片不足，需要 ${reason.required} 片`);
          } else if (reason?.code === 'NOT_LIVE') {
            this._showUnlockNotice('该节点尚未开放');
          }
        },
        color,
        { noArt: true, border },
      );
      const label = btn.getChildByName('Label')?.getComponent(Label);
      if (label) {
        label.isBold = true;
        if (isUnlocked || !canUnlock) {
          label.color = isUnlocked ? TITLE_COLOR : DIM_COLOR;
        }
      }
    }
  }

  private _showUnlockNotice(message: string): void {
    let notice = this._root.getChildByName('UnlockNotice')?.getComponent(Label) ?? null;
    if (!notice) {
      notice = makeLabel(
        this._root, 0, -this._screenH / 2 + 92,
        600, 36, 20, TITLE_COLOR, Label.HorizontalAlign.CENTER,
      );
      notice.node.name = 'UnlockNotice';
    }
    notice.string = message;
  }

  destroy(): void {
    this._root.destroy();
  }
}
