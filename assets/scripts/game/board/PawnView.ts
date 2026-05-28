import { Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import { BOARD_SIZE } from '../../core/Constants';
import type { GameDoc } from '../../types/GameTypes';
import { BOARD_PLAY_CENTER_Y, cellLocalPos } from './boardLayout';

const SEAT_COLORS = [
  new Color(255, 100, 100, 255),
  new Color(100, 200, 255, 255),
  new Color(120, 255, 140, 255),
  new Color(255, 220, 100, 255),
];

const STEP_MS = 130;
const STACK_BELOW_Y = 34;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 棋子：逐格移动、同格错位（当前行动者在格内，其余在下方） */
export class PawnView {
  private _root: Node;
  private _pawns: Node[] = [];
  private _visualPos: number[] = [];
  private _animating = false;

  constructor(parent: Node) {
    this._root = new Node('PawnView');
    this._root.setParent(parent);
    this._root.setPosition(0, BOARD_PLAY_CENTER_Y, 0);
    this._root.addComponent(UITransform).setContentSize(1, 1);
  }

  get animating(): boolean {
    return this._animating;
  }

  /** 立即按对局状态摆棋子 */
  refresh(game: GameDoc | null): void {
    if (!game) return;
    this._ensurePawns(game.players.length);
    game.players.forEach((p, seat) => {
      this._visualPos[seat] = p.position;
    });
    this._layoutAll(game);
  }

  /**
   * 沿棋盘逐格移动 steps 步（不含起点）
   * @param focusSeat 同格时置于格内的座位（通常为掷骰者）
   */
  async animateAlongPath(
    game: GameDoc,
    seat: number,
    fromPos: number,
    steps: number,
    focusSeat?: number,
    msPerStep = STEP_MS,
  ): Promise<void> {
    if (steps <= 0) {
      this.refresh(game);
      return;
    }

    this._ensurePawns(game.players.length);
    this._animating = true;

    game.players.forEach((p, s) => {
      if (s !== seat) {
        this._visualPos[s] = p.position;
      }
    });
    this._visualPos[seat] = fromPos;
    this._layoutAll(game, focusSeat ?? seat);

    for (let i = 1; i <= steps; i++) {
      this._visualPos[seat] = (fromPos + i) % BOARD_SIZE;
      this._layoutAll(game, focusSeat ?? seat);
      await delay(msPerStep);
    }

    game.players.forEach((p, s) => {
      this._visualPos[s] = p.position;
    });
    this._layoutAll(game);
    this._animating = false;
  }

  private _ensurePawns(count: number): void {
    while (this._pawns.length < count) {
      const seat = this._pawns.length;
      const n = new Node(`Pawn_${seat}`);
      n.setParent(this._root);
      n.addComponent(UITransform).setContentSize(26, 26);
      const g = n.addComponent(Graphics);
      g.fillColor = SEAT_COLORS[seat % SEAT_COLORS.length];
      g.circle(0, 0, 13);
      g.fill();
      const lbl = n.addComponent(Label);
      lbl.string = String(seat + 1);
      lbl.fontSize = 16;
      lbl.color = new Color(20, 20, 20, 255);
      lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
      lbl.verticalAlign = Label.VerticalAlign.CENTER;
      this._pawns.push(n);
      this._visualPos[seat] = 0;
    }
  }

  private _layoutAll(game: GameDoc, anchorSeat?: number): void {
    const anchor =
      anchorSeat !== undefined && !game.players[anchorSeat]?.isDefeated
        ? anchorSeat
        : game.currentSeat;

    const byCell = new Map<number, number[]>();
    game.players.forEach((p, seat) => {
      if (p.isDefeated) return;
      const pos = this._visualPos[seat] ?? p.position;
      if (!byCell.has(pos)) byCell.set(pos, []);
      byCell.get(pos)!.push(seat);
    });

    game.players.forEach((p, seat) => {
      const n = this._pawns[seat];
      if (!n) return;
      if (p.isDefeated) {
        n.active = false;
        return;
      }
      n.active = true;

      const pos = this._visualPos[seat] ?? p.position;
      const peers = byCell.get(pos) || [seat];
      const base = cellLocalPos(pos);

      let offsetY = 0;
      if (peers.length > 1 && peers.includes(anchor)) {
        if (seat === anchor) {
          offsetY = 0;
        } else {
          const below = peers.filter((s) => s !== anchor);
          const idx = below.indexOf(seat);
          offsetY = -(idx + 1) * STACK_BELOW_Y;
        }
      }

      n.setPosition(new Vec3(base.x, base.y + offsetY, 0));
    });
  }
}
