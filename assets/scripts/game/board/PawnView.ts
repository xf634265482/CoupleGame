import { Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import { BOARD_SIZE } from '../../core/Constants';
import type { GameDoc } from '../../types/GameTypes';
import { getCachedSprite, loadUiSprite } from '../../ui/UiAssets';
import { ensureArtChild } from '../../ui/UiSprite';
import { cellLocalPos, pawnDrawSize, refreshBoardLayoutMetrics } from './boardLayout';

const SEAT_COLORS = [
  new Color(255, 100, 100, 255),
  new Color(100, 200, 255, 255),
  new Color(120, 255, 140, 255),
  new Color(255, 220, 100, 255),
];

const STEP_MS = 90;
const PAWN_LABEL_NAME = 'PawnLabel';

function stackBelowOffset(): number {
  return pawnDrawSize() + 6;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 棋子：逐格移动、同格错位（当前行动者在格内，其余在下方） */
export class PawnView {
  private _root: Node;
  private _content: Node;
  private _pawns: Node[] = [];
  private _visualPos: number[] = [];
  private _animating = false;
  private _loadingArt = new Set<string>();

  constructor(parent: Node) {
    refreshBoardLayoutMetrics();
    this._root = new Node('PawnView');
    this._root.setParent(parent);
    this._root.setPosition(0, 0, 0);
    this._root.addComponent(UITransform).setContentSize(1, 1);
    this._content = new Node('Content');
    this._content.setParent(this._root);
    this._content.setPosition(0, 0, 0);
  }

  get animating(): boolean {
    return this._animating;
  }

  private _resizePawnNode(n: Node, seat: number): void {
    const size = pawnDrawSize();
    const ut = n.getComponent(UITransform) || n.addComponent(UITransform);
    ut.setContentSize(size, size);
    n.setScale(1, 1, 1);

    const g = n.getComponent(Graphics);
    const key = `board/pawns/pawn_player_${seat + 1}`;
    const pawnSf = getCachedSprite(key);
    if (pawnSf) {
      ensureArtChild(n, 'PawnArt', pawnSf, size, size);
      if (g) g.enabled = false;
      const labelNode = n.getChildByName(PAWN_LABEL_NAME);
      if (labelNode) labelNode.active = false;
    } else if (g) {
      n.getChildByName('PawnArt')?.destroy();
      this._loadPawnArtLater(key, n, seat);
      const labelNode = n.getChildByName(PAWN_LABEL_NAME);
      if (labelNode) labelNode.active = true;
      g.enabled = true;
      g.clear();
      g.fillColor = SEAT_COLORS[seat % SEAT_COLORS.length];
      g.circle(0, 0, size / 2);
      g.fill();
    }

    const labelNode = n.getChildByName(PAWN_LABEL_NAME);
    const labelUt = labelNode?.getComponent(UITransform);
    if (labelUt) labelUt.setContentSize(size, size);
    const lbl = labelNode?.getComponent(Label);
    if (lbl) {
      lbl.fontSize = Math.max(12, Math.round(size * 0.42));
      lbl.lineHeight = Math.round(lbl.fontSize * 1.15);
    }
  }

  private _loadPawnArtLater(key: string, node: Node, seat: number): void {
    if (this._loadingArt.has(key)) return;
    this._loadingArt.add(key);
    void loadUiSprite(key).then((sf) => {
      this._loadingArt.delete(key);
      if (!sf || !node.isValid) return;
      this._resizePawnNode(node, seat);
    });
  }

  applyArt(): void {
    refreshBoardLayoutMetrics();
    for (let seat = 0; seat < this._pawns.length; seat++) {
      const n = this._pawns[seat];
      if (!n) continue;
      this._resizePawnNode(n, seat);
    }
  }

  /** 立即按对局状态摆棋子 */
  refresh(game: GameDoc | null): void {
    if (!game) return;
    this._ensurePawns(game.players.length);
    game.players.forEach((p, seat) => {
      this._visualPos[seat] = p.position;
    });
    this._syncPawnLabels(game);
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
    this._syncPawnLabels(game);
    this._layoutAll(game, focusSeat ?? seat);

    for (let i = 1; i <= steps; i++) {
      this._visualPos[seat] = (fromPos + i) % BOARD_SIZE;
      this._syncPawnLabels(game);
      this._layoutAll(game, focusSeat ?? seat);
      await delay(msPerStep);
    }

    game.players.forEach((p, s) => {
      this._visualPos[s] = p.position;
    });
    this._syncPawnLabels(game);
    this._layoutAll(game);
    this._animating = false;
  }

  private _firstChar(name: string): string {
    const s = String(name || '').trim();
    if (!s) return '';
    return Array.from(s)[0] || '';
  }

  private _pawnLabelNode(pawn: Node): Label | null {
    return pawn.getChildByName(PAWN_LABEL_NAME)?.getComponent(Label) ?? null;
  }

  private _syncPawnLabels(game: GameDoc): void {
    game.players.forEach((p, seat) => {
      const n = this._pawns[seat];
      if (!n) return;
      const lbl = this._pawnLabelNode(n);
      if (!lbl) return;
      const c = this._firstChar(p.nickname || '');
      lbl.string = c || String(seat + 1);
    });
  }

  private _ensurePawns(count: number): void {
    while (this._pawns.length < count) {
      const seat = this._pawns.length;
      const n = new Node(`Pawn_${seat}`);
      n.setParent(this._content);
      const size = pawnDrawSize();
      n.addComponent(UITransform).setContentSize(size, size);

      const g = n.addComponent(Graphics);
      g.fillColor = SEAT_COLORS[seat % SEAT_COLORS.length];
      g.circle(0, 0, size / 2);
      g.fill();

      const key = `board/pawns/pawn_player_${seat + 1}`;
      const pawnSf = getCachedSprite(key);
      if (pawnSf) {
        ensureArtChild(n, 'PawnArt', pawnSf, size, size);
        g.enabled = false;
      } else {
        this._loadPawnArtLater(key, n, seat);
      }

      const labelNode = new Node(PAWN_LABEL_NAME);
      labelNode.setParent(n);
      labelNode.setPosition(0, 0, 0);
      labelNode.addComponent(UITransform).setContentSize(size, size);
      const lbl = labelNode.addComponent(Label);
      lbl.string = String(seat + 1);
      lbl.fontSize = Math.max(12, Math.round(size * 0.42));
      lbl.lineHeight = Math.round(lbl.fontSize * 1.15);
      lbl.color = new Color(255, 255, 255, 255);
      lbl.enableOutline = true;
      lbl.outlineColor = new Color(30, 30, 30, 255);
      lbl.outlineWidth = 2;
      lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
      lbl.verticalAlign = Label.VerticalAlign.CENTER;
      labelNode.active = !pawnSf;

      this._pawns.push(n);
      this._visualPos[seat] = 0;
    }
  }

  /** 跟随视角：让 focus 靠近 viewport 中心 */
  setFocusLocalPos(focus: { x: number; y: number } | null): void {
    if (!this._content) return;
    if (!focus) {
      this._content.setPosition(0, 0, 0);
      return;
    }
    this._content.setPosition(-focus.x, -focus.y, 0);
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
          offsetY = -(idx + 1) * stackBelowOffset();
        }
      }

      n.setPosition(new Vec3(base.x, base.y + offsetY, 0));
    });
  }
}
