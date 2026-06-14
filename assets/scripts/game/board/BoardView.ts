import { Color, Graphics, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { BOARD_SIZE, INITIAL_HP } from '../../core/Constants';
import type { BoardCell, GameDoc } from '../../types/GameTypes';
import { CELL_TYPE_SPRITE, getCachedSprite, loadUiSprite } from '../../ui/UiAssets';
import { ensureArtChild } from '../../ui/UiSprite';
import {
  boardLayoutMetrics,
  cellDrawSize,
  cellLocalPos,
  positionRegionIndex,
  refreshBoardLayoutMetrics,
  regionBandRect,
  regionCenterLocal,
} from './boardLayout';

export { boardLayoutMetrics, refreshBoardLayoutMetrics } from './boardLayout';

const REGION_STROKE: Color[] = [
  new Color(90, 180, 220, 140),
  new Color(220, 180, 90, 140),
  new Color(180, 120, 230, 140),
];

const TYPE_COLORS: Record<string, Color> = {
  NORMAL: new Color(95, 105, 130, 255),
  GOLD: new Color(225, 172, 56, 255),
  DIAMOND: new Color(80, 205, 245, 255),
  SUPPLY: new Color(70, 205, 170, 255),
  WASTE: new Color(105, 105, 112, 255),
  BURNING: new Color(235, 84, 46, 255),
  EVENT: new Color(188, 80, 210, 255),
  GOLD_SHOP: new Color(118, 190, 80, 255),
  LEGENDARY_SHOP: new Color(158, 102, 228, 255),
  FINAL_SHOP: new Color(235, 66, 98, 255),
  LUCKY: new Color(245, 198, 70, 255),
};

/** 格子内贴图（缩放到 cell 尺寸内，避免 512 源图撑满） */
const USE_CELL_ART = true;

/** 格子贴图严格缩进 cell 节点，避免微信端按 128 原图撑开 */
function fitCellArt(parent: Node, childName: string, sf: SpriteFrame, sz: number): void {
  ensureArtChild(parent, childName, sf, sz, sz);
  const ch = parent.getChildByName(childName);
  if (!ch) return;
  ch.setPosition(0, 0, 0);
  ch.setScale(1, 1, 1);
  const ut = ch.getComponent(UITransform);
  if (ut) ut.setContentSize(sz, sz);
  const sp = ch.getComponent(Sprite);
  if (sp) {
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = Sprite.Type.SIMPLE;
  }
}

/** 微信端：Graphics 与 Sprite 同节点时易花屏，贴图放独立子节点 */
function ensureCellBg(node: Node, sz: number): Graphics {
  let bg = node.getChildByName('CellBg');
  if (!bg) {
    bg = new Node('CellBg');
    bg.setParent(node);
    bg.setSiblingIndex(0);
    bg.setPosition(0, 0, 0);
    bg.addComponent(UITransform).setContentSize(sz, sz);
  }
  return bg.getComponent(Graphics) || bg.addComponent(Graphics);
}

type CellRenderState = { type: string; isDiamond: boolean; marker: string };

/** 横版 75 格棋盘 → AC-1, AC-4, AC-5 */
export class BoardView {
  private _root: Node;
  private _content: Node;
  private _cells: Node[] = [];
  private _rendered: CellRenderState[] = [];
  private _neutralRoots: Node[] = [];
  private _neutralLabels: Label[] = [];
  private _loadingNeutralKeys = new Set<string>();
  private _loadingCellKeys = new Set<string>();
  private _useArt = false;

  constructor(parent: Node) {
    refreshBoardLayoutMetrics();
    const m = boardLayoutMetrics();
    this._root = new Node('BoardView');
    this._root.setParent(parent);
    this._root.setPosition(0, 0, 0);
    this._root.addComponent(UITransform).setContentSize(m.rectW + 80, m.rectH + 120);
    this._content = new Node('Content');
    this._content.setParent(this._root);
    this._content.setPosition(0, 0, 0);
    this._drawRegionGuides();
    this._buildNeutralLabels();
    this._buildCells();
  }

  applyArt(): void {
    this._useArt = USE_CELL_ART;
    let artCount = 0;
    for (let i = 0; i < this._cells.length; i++) {
      const cell = this._cells[i];
      if (!cell) continue;
      const sz = cell.getComponent(UITransform)!.contentSize.width;
      const state = this._rendered[i];
      const type = state?.type ?? 'NORMAL';
      const isDiamond = state?.isDiamond ?? false;
      if (this._useArt) {
        this._setCellArt(cell, type, isDiamond);
        artCount++;
      } else {
        cell.getChildByName('CellArt')?.destroy();
        cell.getChildByName('CellOverlay')?.destroy();
      }
      this._paintCellGraphics(cell, type, sz, isDiamond, i);
    }
    console.log('[BoardView] applyArt cells', this._cells.length, 'art', artCount, USE_CELL_ART);
    this._applyNeutralArt();
  }

  /** 格子底色/描边（微信端 Sprite 失败时仍能看见棋盘） */
  private _paintCellGraphics(
    node: Node,
    type: string,
    sz: number,
    isDiamond: boolean,
    cellIndex = 0,
  ): void {
    const g = ensureCellBg(node, sz);
    g.enabled = true;
    g.clear();
    const base = TYPE_COLORS[type] || TYPE_COLORS.NORMAL;
    const hasArt = USE_CELL_ART && this._useArt && !!getCachedSprite(CELL_TYPE_SPRITE[type] || CELL_TYPE_SPRITE.NORMAL);
    const fillAlpha = hasArt ? 80 : 255;
    g.fillColor = new Color(base.r, base.g, base.b, fillAlpha);
    g.rect(-sz / 2, -sz / 2, sz, sz);
    g.fill();
    const r = positionRegionIndex(cellIndex);
    g.strokeColor = REGION_STROKE[r] || REGION_STROKE[0];
    g.lineWidth = 2;
    g.rect(-sz / 2 + 1, -sz / 2 + 1, sz - 2, sz - 2);
    g.stroke();
    if (isDiamond) {
      g.strokeColor = new Color(255, 255, 255, 255);
      g.lineWidth = 2;
      g.rect(-sz / 2 + 2, -sz / 2 + 2, sz - 4, sz - 4);
      g.stroke();
    }
  }

  private _setCellArt(n: Node, type: string, isDiamond: boolean): void {
    const key = CELL_TYPE_SPRITE[type] || CELL_TYPE_SPRITE.NORMAL;
    const sf = getCachedSprite(key);
    const sz = n.getComponent(UITransform)!.contentSize.width;
    if (USE_CELL_ART && sf) {
      fitCellArt(n, 'CellArt', sf, sz);
      const art = n.getChildByName('CellArt');
      if (art) art.setSiblingIndex(1);
    } else {
      n.getChildByName('CellArt')?.destroy();
      if (USE_CELL_ART && this._useArt) {
        this._loadCellArtLater(key);
      }
    }
    n.getChildByName('CellOverlay')?.destroy();
  }

  private _drawRegionGuides(): void {
    const guide = new Node('RegionGuides');
    guide.setParent(this._content);
    const g = guide.addComponent(Graphics);
    g.lineWidth = 2;
    for (let r = 0; r < 3; r++) {
      const { cx, cy, w, h } = regionBandRect(r);
      g.strokeColor = REGION_STROKE[r] ?? new Color(140, 160, 200, 170);
      g.rect(cx - w / 2, cy - h / 2, w, h);
      g.stroke();

      const tag = new Node(`RegionTag_${r}`);
      tag.setParent(guide);
      tag.setPosition(cx, cy + h / 2 + 16, 0);
      tag.addComponent(UITransform).setContentSize(w, 24);
      const lbl = tag.addComponent(Label);
      lbl.fontSize = 18;
      lbl.lineHeight = 22;
      lbl.color = new Color(190, 205, 235, 220);
      lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
      lbl.string = `区域 ${r + 1}`;
    }
  }

  private _buildNeutralLabels(): void {
    for (let r = 0; r < 3; r++) {
      const n = new Node(`Neutral_${r}`);
      n.setParent(this._content);
      n.setPosition(regionCenterLocal(r));
      n.addComponent(UITransform).setContentSize(150, 112);

      const icon = new Node('NeutralIcon');
      icon.setParent(n);
      icon.setPosition(0, 14, 0);
      icon.addComponent(UITransform).setContentSize(88, 88);

      const labelN = new Node('Label');
      labelN.setParent(n);
      labelN.setPosition(0, -44, 0);
      labelN.addComponent(UITransform).setContentSize(150, 30);
      const lbl = labelN.addComponent(Label);
      lbl.fontSize = 24;
      lbl.lineHeight = 28;
      lbl.color = new Color(255, 200, 120, 255);
      lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
      lbl.string = `中立${r + 1} ${INITIAL_HP}/${INITIAL_HP}`;
      this._neutralRoots[r] = n;
      this._neutralLabels[r] = lbl;
    }
    this._applyNeutralArt();
  }

  private _applyNeutralArt(): void {
    for (let r = 0; r < this._neutralRoots.length; r++) {
      const root = this._neutralRoots[r];
      const icon = root?.getChildByName('NeutralIcon');
      if (!icon) continue;
      const key = `board/pawns/neutral_region_${r + 1}`;
      const sf = getCachedSprite(key);
      if (sf) {
        ensureArtChild(icon, 'Art', sf, 88, 88);
        const g = icon.getComponent(Graphics);
        if (g) g.enabled = false;
      } else {
        icon.getChildByName('Art')?.destroy();
        this._loadNeutralArtLater(key);
        const g = icon.getComponent(Graphics) || icon.addComponent(Graphics);
        g.enabled = true;
        g.clear();
        g.fillColor = REGION_STROKE[r] ?? new Color(255, 200, 120, 180);
        g.circle(0, 0, 30);
        g.fill();
      }
    }
  }

  private _loadCellArtLater(key: string): void {
    if (this._loadingCellKeys.has(key)) return;
    this._loadingCellKeys.add(key);
    void loadUiSprite(key).then((sf) => {
      this._loadingCellKeys.delete(key);
      if (!sf) return;
      this.applyArt();
    });
  }

  private _loadNeutralArtLater(key: string): void {
    if (this._loadingNeutralKeys.has(key)) return;
    this._loadingNeutralKeys.add(key);
    void loadUiSprite(key).then((sf) => {
      this._loadingNeutralKeys.delete(key);
      if (!sf) return;
      this._applyNeutralArt();
    });
  }

  private _buildCells(): void {
    for (let i = 0; i < BOARD_SIZE; i++) {
      const n = new Node(`Cell_${i}`);
      n.setParent(this._content);
      n.setPosition(cellLocalPos(i));
      const sz = cellDrawSize(i);
      n.addComponent(UITransform).setContentSize(sz, sz);
      ensureCellBg(n, sz);

      const tag = new Node('Tag');
      tag.setParent(n);
      tag.setSiblingIndex(2);
      tag.addComponent(UITransform).setContentSize(sz, sz);
      const tl = tag.addComponent(Label);
      tl.fontSize = 20;
      tl.lineHeight = 24;
      tl.color = new Color(255, 255, 255, 220);
      tl.horizontalAlign = Label.HorizontalAlign.CENTER;
      tl.verticalAlign = Label.VerticalAlign.CENTER;
      tl.string = '';

      this._cells[i] = n;
    }
  }

  refresh(game: GameDoc | null): void {
    if (!game) return;
    game.boardCells.forEach((cell: BoardCell) => {
      const n = this._cells[cell.index];
      if (!n) return;
      const isDiamond = cell.index === game.diamondCellIndex;
      const marker = '';
      const prev = this._rendered[cell.index];
      if (prev && prev.type === cell.type && prev.isDiamond === isDiamond && prev.marker === marker) {
        return;
      }
      this._rendered[cell.index] = { type: cell.type, isDiamond, marker };

      const sz = cellDrawSize(cell.index);
      if (this._useArt) {
        this._setCellArt(n, cell.type, isDiamond);
        this._paintCellGraphics(n, cell.type, sz, isDiamond, cell.index);
      } else {
        this._paintCellGraphics(n, cell.type, sz, isDiamond, cell.index);
      }

      const tag = n.getChildByName('Tag')?.getComponent(Label);
      if (tag) {
        tag.string = '';
      }
    });

    const creatures = game.neutralCreatures ?? [];
    creatures.forEach((c) => {
      const lbl = this._neutralLabels[c.regionIndex];
      if (!lbl) return;
      if (c.defeated || c.hp <= 0) {
        lbl.string = `中立${c.regionIndex + 1} 已击败`;
        lbl.color = new Color(140, 140, 150, 255);
      } else {
        lbl.string = `中立${c.regionIndex + 1} ${c.hp}/${c.maxHp}`;
        lbl.color = new Color(255, 200, 120, 255);
      }
    });
  }

  /** 将棋盘平移到让 focus 位置靠近 viewport 中心（跟随玩家） */
  setFocusLocalPos(focus: { x: number; y: number } | null): void {
    if (!this._content) return;
    if (!focus) {
      this._content.setPosition(0, 0, 0);
      return;
    }
    // content 由外层统一缩放（BoardContent），这里用 localPos
    this._content.setPosition(-focus.x, -focus.y, 0);
  }
}
