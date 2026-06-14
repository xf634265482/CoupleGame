import { Color, Graphics, Label, Node, UITransform } from 'cc';
import { getCachedSprite } from './UiAssets';
import { ensureArtSliced } from './UiSprite';

const ROW_SLICE = { top: 12, bottom: 12, left: 12, right: 12 };

export type OptionRowStyle = {
  w: number;
  h: number;
  fontSize?: number;
  normalFill?: Color;
  highlightStroke?: Color;
};

const DEFAULT_STYLE: Required<Omit<OptionRowStyle, 'w' | 'h'>> = {
  fontSize: 20,
  normalFill: new Color(36, 44, 62, 220),
  highlightStroke: new Color(255, 220, 110, 255),
};

/** 简约选项行：幸运格 / 未来同类弹窗复用 */
export function buildOptionRow(
  parent: Node,
  text: string,
  y: number,
  style: OptionRowStyle,
  highlighted = false,
): Node {
  const { w, h } = style;
  const fontSize = style.fontSize ?? DEFAULT_STYLE.fontSize;
  const normalFill = style.normalFill ?? DEFAULT_STYLE.normalFill;
  const highlightStroke = style.highlightStroke ?? DEFAULT_STYLE.highlightStroke;

  const row = new Node(`Opt_${text.slice(0, 12)}`);
  row.setParent(parent);
  row.setPosition(0, y, 0);
  row.addComponent(UITransform).setContentSize(w, h);

  const rowSf = getCachedSprite('board/panels/row_board_option_9s');
  if (rowSf) {
    ensureArtSliced(row, 'RowArt', rowSf, w, h, ROW_SLICE);
  } else {
    const g = row.addComponent(Graphics);
    g.fillColor = normalFill;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    g.strokeColor = new Color(72, 88, 118, 180);
    g.lineWidth = 1.5;
    g.rect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    g.stroke();
  }

  if (highlighted) {
    const hg = row.addComponent(Graphics);
    hg.strokeColor = highlightStroke;
    hg.lineWidth = 3;
    hg.rect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
    hg.stroke();
  }

  const labelN = new Node('L');
  labelN.setParent(row);
  labelN.addComponent(UITransform).setContentSize(w - 20, h - 8);
  const lbl = labelN.addComponent(Label);
  lbl.string = text;
  lbl.fontSize = fontSize;
  lbl.lineHeight = Math.round(fontSize * 1.25);
  lbl.color = highlighted
    ? new Color(255, 248, 220, 255)
    : new Color(228, 232, 242, 255);
  lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
  lbl.verticalAlign = Label.VerticalAlign.CENTER;
  lbl.overflow = Label.Overflow.SHRINK;

  return row;
}

export function paintOptionRowHighlight(row: Node, highlighted: boolean, style: OptionRowStyle): void {
  const w = row.getComponent(UITransform)?.contentSize.width ?? style.w;
  const h = row.getComponent(UITransform)?.contentSize.height ?? style.h;
  const comps = row.getComponents(Graphics);
  const baseG = comps[0];
  const strokeG = comps.length > 1 ? comps[1] : null;
  const normalFill = style.normalFill ?? DEFAULT_STYLE.normalFill;
  const highlightStroke = style.highlightStroke ?? DEFAULT_STYLE.highlightStroke;

  if (baseG && !row.getChildByName('RowArt')) {
    baseG.clear();
    baseG.fillColor = normalFill;
    baseG.rect(-w / 2, -h / 2, w, h);
    baseG.fill();
    baseG.strokeColor = new Color(72, 88, 118, 180);
    baseG.lineWidth = 1.5;
    baseG.rect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    baseG.stroke();
  }

  if (strokeG) {
    strokeG.clear();
    if (highlighted) {
      strokeG.strokeColor = highlightStroke;
      strokeG.lineWidth = 3;
      strokeG.rect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
      strokeG.stroke();
    }
  } else if (highlighted) {
    const hg = row.addComponent(Graphics);
    hg.strokeColor = highlightStroke;
    hg.lineWidth = 3;
    hg.rect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
    hg.stroke();
  }

  const lbl = row.getChildByName('L')?.getComponent(Label);
  if (lbl) {
    lbl.color = highlighted
      ? new Color(255, 248, 220, 255)
      : new Color(228, 232, 242, 255);
  }
}
