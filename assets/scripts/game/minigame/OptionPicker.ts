import { Button, Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

/** 模拟下拉：左右箭头切换数值 */
export class OptionPicker {
  private _values: number[];
  private _idx = 0;
  private _root: Node;
  private _valueLabel: Label;

  constructor(
    parent: Node,
    x: number,
    y: number,
    title: string,
    values: number[],
    initial?: number,
    width = 300,
  ) {
    this._values = values;
    const panelW = Math.max(200, width);
    const halfW = panelW / 2;
    this._root = new Node(`Picker_${title}`);
    this._root.setParent(parent);
    this._root.setPosition(new Vec3(x, y, 0));
    this._root.addComponent(UITransform).setContentSize(panelW, 88);

    const bg = this._root.addComponent(Graphics);
    bg.fillColor = new Color(45, 50, 68, 255);
    bg.rect(-halfW, -44, panelW, 88);
    bg.fill();

    const titleN = new Node('T');
    titleN.setParent(this._root);
    titleN.setPosition(new Vec3(0, 28, 0));
    titleN.addComponent(UITransform).setContentSize(panelW - 20, 32);
    const tl = titleN.addComponent(Label);
    tl.string = title;
    tl.fontSize = 24;
    tl.color = new Color(180, 185, 200, 255);
    tl.horizontalAlign = Label.HorizontalAlign.CENTER;

    const arrowX = Math.round(halfW - 45);
    this._makeArrow(-arrowX, -8, '◀', -1);
    this._makeArrow(arrowX, -8, '▶', 1);

    const valN = new Node('Val');
    valN.setParent(this._root);
    valN.setPosition(new Vec3(0, -8, 0));
    valN.addComponent(UITransform).setContentSize(140, 48);
    this._valueLabel = valN.addComponent(Label);
    this._valueLabel.fontSize = 36;
    this._valueLabel.color = new Color(255, 220, 100, 255);
    this._valueLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._valueLabel.verticalAlign = Label.VerticalAlign.CENTER;

    if (initial !== undefined) {
      const i = values.indexOf(initial);
      this._idx = i >= 0 ? i : 0;
    }
    this._syncLabel();
  }

  private _makeArrow(x: number, y: number, text: string, delta: number): void {
    const n = new Node(`Arrow_${text}`);
    n.setParent(this._root);
    n.setPosition(new Vec3(x, y, 0));
    n.addComponent(UITransform).setContentSize(56, 48);
    const g = n.addComponent(Graphics);
    g.fillColor = new Color(70, 78, 100, 255);
    g.rect(-28, -24, 56, 48);
    g.fill();
    const ln = new Node('L');
    ln.setParent(n);
    ln.addComponent(UITransform).setContentSize(56, 48);
    const lbl = ln.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = 28;
    lbl.color = new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    n.addComponent(Button);
    n.on(Button.EventType.CLICK, () => this._step(delta), this);
  }

  private _step(delta: number): void {
    this._idx = (this._idx + delta + this._values.length) % this._values.length;
    this._syncLabel();
  }

  private _syncLabel(): void {
    const v = this._values[this._idx];
    this._valueLabel.string = String(v);
  }

  getValue(): number {
    return this._values[this._idx];
  }

  setValue(v: number): void {
    const i = this._values.indexOf(v);
    if (i >= 0) {
      this._idx = i;
      this._syncLabel();
    }
  }

  get node(): Node {
    return this._root;
  }
}
