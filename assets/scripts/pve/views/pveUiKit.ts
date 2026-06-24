// PVE 视图共用的代码 UI 构建工具。Graphics 同时承担异步图片加载失败时的兜底。

import { Button, Color, Graphics, HorizontalTextAlignment, Label, Node, UITransform } from 'cc';
import { loadUiSprite } from '../../ui/UiAssets';
import { ensureArtSliced } from '../../ui/UiSprite';

const COMMON_BUTTON_INSETS = { top: 22, bottom: 22, left: 28, right: 28 };

/** 纯色矩形按钮；调用方可在其底层追加 SpriteFrame，纯色保留为加载失败兜底。 */
export function makeFlatButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  onClick: () => void,
  color = new Color(52, 120, 200, 255),
  options?: { noArt?: boolean; border?: Color },
): Node {
  const n = new Node(`Btn_${text}`);
  n.setParent(parent);
  n.setPosition(x, y, 0);
  n.addComponent(UITransform).setContentSize(w, h);

  const g = n.addComponent(Graphics);
  g.fillColor = color;
  if (options?.noArt) {
    g.roundRect(-w / 2, -h / 2, w, h, 12);
    g.fill();
    if (options.border) {
      g.strokeColor = options.border;
      g.lineWidth = 2;
      g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 11);
      g.stroke();
    }
  } else {
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
  }

  const labelNode = new Node('Label');
  labelNode.setParent(n);
  labelNode.addComponent(UITransform).setContentSize(w, h);
  const lbl = labelNode.addComponent(Label);
  lbl.string = text;
  lbl.fontSize = Math.max(18, Math.min(28, Math.round(h * 0.42)));
  lbl.lineHeight = lbl.fontSize + 4;
  lbl.color = new Color(255, 255, 255, 255);
  lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
  lbl.verticalAlign = Label.VerticalAlign.CENTER;
  lbl.overflow = Label.Overflow.SHRINK;

  const btn = n.addComponent(Button);
  btn.transition = Button.Transition.SCALE;
  btn.zoomScale = 0.94;
  btn.target = n;
  n.on(Button.EventType.CLICK, onClick, n);

  // 通用按钮默认使用无文字的青蓝石质底图；专属按钮可在调用方覆盖同名 Art 节点。
  // noArt 模式下保留纯 Graphics 半透明风格（与玩家状态卡同款），不加石质底图叠层。
  if (!options?.noArt) {
    void loadUiSprite('pve/hud/btn_pve_interact').then((frame) => {
      if (!frame || !n.isValid) return;
      ensureArtSliced(n, 'Art', frame, w, h, COMMON_BUTTON_INSETS).node.setSiblingIndex(0);
    });
  }

  return n;
}

/** 纯文字标签节点。默认 string='' 避免 Cocos 内置占位 "label" 短暂闪现（首屏穿帮）。 */
export function makeLabel(
  parent: Node,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
  color: Color,
  align: HorizontalTextAlignment = Label.HorizontalAlign.LEFT,
): Label {
  const n = new Node('Label');
  n.setParent(parent);
  n.setPosition(x, y, 0);
  n.addComponent(UITransform).setContentSize(w, h);
  const lbl = n.addComponent(Label);
  lbl.string = ''; // 创建即清空，prevent "label" placeholder leak during async bootstrap
  lbl.fontSize = fontSize;
  lbl.lineHeight = fontSize + 4;
  lbl.color = color;
  lbl.horizontalAlign = align;
  lbl.verticalAlign = Label.VerticalAlign.CENTER;
  return lbl;
}
