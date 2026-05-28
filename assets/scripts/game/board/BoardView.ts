import { Color, Graphics, Node, UITransform } from 'cc';
import { BOARD_SIZE } from '../../core/Constants';
import type { BoardCell, GameDoc } from '../../types/GameTypes';
import {
  BOARD_PLAY_CENTER_Y,
  cellLocalPos,
} from './boardLayout';

export { BOARD_PLAY_CENTER_Y } from './boardLayout';
const CELL = 32;

const TYPE_COLORS: Record<string, Color> = {
  NORMAL: new Color(70, 75, 90, 255),
  GOLD: new Color(180, 140, 40, 255),
  DIAMOND: new Color(80, 180, 220, 255),
  EVENT: new Color(160, 60, 160, 255),
  MINIGAME: new Color(180, 80, 60, 255),
};

/** 环形棋盘渲染 → AC-6 */
type CellRenderState = { type: string; isDiamond: boolean };

export class BoardView {
  private _root: Node;
  private _cells: Node[] = [];
  private _rendered: CellRenderState[] = [];

  constructor(parent: Node) {
    this._root = new Node('BoardView');
    this._root.setParent(parent);
    this._root.setPosition(0, BOARD_PLAY_CENTER_Y, 0);
    this._root.addComponent(UITransform).setContentSize(720, 430);
    this._buildCells();
  }

  private _buildCells(): void {
    for (let i = 0; i < BOARD_SIZE; i++) {
      const n = new Node(`Cell_${i}`);
      n.setParent(this._root);
      n.setPosition(cellLocalPos(i));
      n.addComponent(UITransform).setContentSize(CELL, CELL);

      const g = n.addComponent(Graphics);
      g.fillColor = TYPE_COLORS.NORMAL;
      g.rect(-CELL / 2, -CELL / 2, CELL, CELL);
      g.fill();

      this._cells[i] = n;
    }
  }

  refresh(game: GameDoc | null): void {
    if (!game) return;
    game.boardCells.forEach((cell: BoardCell) => {
      const n = this._cells[cell.index];
      if (!n) return;
      const isDiamond = cell.index === game.diamondCellIndex;
      const prev = this._rendered[cell.index];
      if (prev && prev.type === cell.type && prev.isDiamond === isDiamond) {
        return;
      }
      this._rendered[cell.index] = { type: cell.type, isDiamond };

      const g = n.getComponent(Graphics);
      if (g) {
        g.clear();
        const base = TYPE_COLORS[cell.type] || TYPE_COLORS.NORMAL;
        g.fillColor = base;
        g.rect(-CELL / 2, -CELL / 2, CELL, CELL);
        g.fill();
        if (isDiamond) {
          g.strokeColor = new Color(255, 255, 255, 255);
          g.lineWidth = 2;
          g.rect(-CELL / 2 + 2, -CELL / 2 + 2, CELL - 4, CELL - 4);
          g.stroke();
        }
      }
    });
  }
}
