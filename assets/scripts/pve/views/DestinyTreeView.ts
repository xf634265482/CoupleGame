// 命运之树视图（specs/260610-destiny-tree-ui）：账户级局外成长树，5 行（A-E 分支）× 3 节点（order 1-3，自左向右）。
// M1 无美术资源：纯 Graphics + Label 占位，配色与 PveCharacterPanel 一致。

import { Color, Label, Node } from 'cc';
import { canUnlockNode } from '../core/DestinyTreeSystem';
import { DESTINY_TREE_NODES } from '../core/PveConstants';
import type { PveMeta } from '../core/PveTypes';
import { makeFlatButton, makeLabel } from './pveUiKit';

const TITLE_COLOR  = new Color(245, 220, 130, 255);
const TEXT_COLOR   = new Color(225, 230, 240, 255);
const DIM_COLOR    = new Color(120, 125, 140, 255);
const UNLOCKED_COLOR = new Color(150, 120, 40, 255);
const UNLOCKABLE_COLOR = new Color(52, 120, 200, 255);
const LOCKED_COLOR = new Color(60, 64, 76, 255);

const COLUMN_LABEL: Record<string, string> = {
  A: '生存',
  B: '战斗',
  C: '财富',
  D: '强化',
  E: '天命',
};

const COLUMNS: ReadonlyArray<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E'];

const NODE_W = 180;
const NODE_H = 130;
const NODE_X_SPACING = 210;
const ROW_SPACING = 200;
const ROW0_TOP_OFFSET = 195;
const ROW_LABEL_OFFSET = 95;

/** 命运之树视图：render(meta) 重建 5 行 x 3 列节点布局（每行一个分支）；onUnlock 由 Controller 处理点击解锁请求。 */
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

    makeLabel(
      this._root, 0, this._screenH / 2 - 50,
      600, 48, 32, TITLE_COLOR, Label.HorizontalAlign.CENTER,
    ).string = '命运之树';

    this._shardsLabel = makeLabel(
      this._root, this._screenW / 2 - 160, this._screenH / 2 - 50,
      280, 40, 24, TITLE_COLOR, Label.HorizontalAlign.RIGHT,
    );

    // 行标签：每个分支（A-E）一行，标签居中显示在该行节点上方
    COLUMNS.forEach((col, i) => {
      const rowY = this._screenH / 2 - ROW0_TOP_OFFSET - i * ROW_SPACING;
      makeLabel(this._root, 0, rowY + ROW_LABEL_OFFSET, 300, 32, 22, TEXT_COLOR, Label.HorizontalAlign.CENTER).string =
        `${col} · ${COLUMN_LABEL[col]}`;
    });

    this._gridRoot = new Node('Grid');
    this._gridRoot.setParent(this._root);
    this._gridRoot.setPosition(0, 0, 0);

    makeFlatButton(
      this._root, '重置命运树', -120, -this._screenH / 2 + 50, 180, 56,
      () => this._onReset?.(),
      new Color(140, 60, 60, 255),
    );
    makeFlatButton(
      this._root, '返回大厅', 120, -this._screenH / 2 + 50, 180, 56,
      () => this._onBack?.(),
      new Color(120, 130, 145, 255),
    );
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
      const rowIndex = COLUMNS.indexOf(def.column);
      const x = (def.order - 2) * NODE_X_SPACING;
      const y = this._screenH / 2 - ROW0_TOP_OFFSET - rowIndex * ROW_SPACING;

      const isUnlocked = unlocked.has(def.id);
      const canUnlock = !isUnlocked && canUnlockNode(meta, def.id);
      const color = isUnlocked ? UNLOCKED_COLOR : canUnlock ? UNLOCKABLE_COLOR : LOCKED_COLOR;
      const text = isUnlocked
        ? `✅ ${def.name}\n${def.desc}`
        : `${def.name}\n${def.desc}\n${def.cost} 碎片`;

      const btn = makeFlatButton(
        this._gridRoot, text, x, y, NODE_W, NODE_H,
        () => {
          if (canUnlock) this._onUnlock(def.id);
        },
        color,
      );
      if (isUnlocked || !canUnlock) {
        const label = btn.getChildByName('Label')?.getComponent(Label);
        if (label) label.color = isUnlocked ? TITLE_COLOR : DIM_COLOR;
      }
    }
  }

  destroy(): void {
    this._root.destroy();
  }
}
