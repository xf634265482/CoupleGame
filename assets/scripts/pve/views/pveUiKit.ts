// PVE 视图共用的极简 UI 构建工具（M1 无美术资源，纯 Graphics + Label 占位）。

import { Button, Color, Graphics, HorizontalTextAlignment, Label, Node, UITransform } from 'cc';

/** 纯色矩形按钮（无美术素材时的占位实现，供 PveHudView/PveToastView 复用）。 */
export function makeFlatButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  onClick: () => void,
  color = new Color(52, 120, 200, 255),
): Node {
  const n = new Node(`Btn_${text}`);
  n.setParent(parent);
  n.setPosition(x, y, 0);
  n.addComponent(UITransform).setContentSize(w, h);

  const g = n.addComponent(Graphics);
  g.fillColor = color;
  g.rect(-w / 2, -h / 2, w, h);
  g.fill();

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
