import { Button, Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

/** 掷骰结果弹窗（先显示点数，再移动棋子） */
export class DiceResultToast {
  private _root: Node;
  private _actorLabel: Label | null = null;
  private _diceLabel: Label | null = null;
  private _resolve: (() => void) | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: Node) {
    this._root = new Node('DiceResultToast');
    this._root.setParent(parent);
    this._root.active = false;

    const mask = new Node('Mask');
    mask.setParent(this._root);
    mask.addComponent(UITransform).setContentSize(900, 1400);
    const mg = mask.addComponent(Graphics);
    mg.fillColor = new Color(0, 0, 0, 140);
    mg.rect(-450, -700, 900, 1400);
    mg.fill();

    const box = new Node('Box');
    box.setParent(this._root);
    box.setPosition(new Vec3(0, 100, 0));
    box.addComponent(UITransform).setContentSize(520, 380);
    const bg = box.addComponent(Graphics);
    bg.fillColor = new Color(40, 44, 60, 250);
    bg.rect(-260, -190, 520, 380);
    bg.fill();

    const cap = new Node('Caption');
    cap.setParent(box);
    cap.setPosition(new Vec3(0, 145, 0));
    cap.addComponent(UITransform).setContentSize(480, 44);
    const cl = cap.addComponent(Label);
    cl.string = '掷骰结果';
    cl.fontSize = 34;
    cl.color = new Color(255, 230, 150, 255);
    cl.horizontalAlign = Label.HorizontalAlign.CENTER;

    const actorN = new Node('Actor');
    actorN.setParent(box);
    actorN.setPosition(new Vec3(0, 95, 0));
    actorN.addComponent(UITransform).setContentSize(480, 48);
    this._actorLabel = actorN.addComponent(Label);
    this._actorLabel.fontSize = 36;
    this._actorLabel.lineHeight = 44;
    this._actorLabel.color = new Color(230, 235, 245, 255);
    this._actorLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    const diceN = new Node('Dice');
    diceN.setParent(box);
    diceN.setPosition(new Vec3(0, 10, 0));
    diceN.addComponent(UITransform).setContentSize(280, 140);
    this._diceLabel = diceN.addComponent(Label);
    this._diceLabel.fontSize = 110;
    this._diceLabel.lineHeight = 120;
    this._diceLabel.color = new Color(255, 255, 255, 255);
    this._diceLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._diceLabel.verticalAlign = Label.VerticalAlign.CENTER;
    this._diceLabel.overflow = Label.Overflow.CLAMP;

    const ok = new Node('Ok');
    ok.setParent(box);
    ok.setPosition(new Vec3(0, -130, 0));
    ok.addComponent(UITransform).setContentSize(260, 56);
    const og = ok.addComponent(Graphics);
    og.fillColor = new Color(200, 130, 45, 255);
    og.rect(-130, -28, 260, 56);
    og.fill();
    const ol = new Node('L');
    ol.setParent(ok);
    ol.addComponent(UITransform).setContentSize(260, 56);
    const olbl = ol.addComponent(Label);
    olbl.string = '继续';
    olbl.fontSize = 32;
    olbl.color = new Color(255, 255, 255, 255);
    olbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    olbl.verticalAlign = Label.VerticalAlign.CENTER;
    ok.addComponent(Button);
    ok.on(Button.EventType.CLICK, () => this.hide(), this);
  }

  /** @param actorLine 如「你掷出了」或「玩家2 掷出了」 */
  show(dice: number, actorLine = '你掷出了'): Promise<void> {
    return new Promise((resolve) => {
      this._resolve = resolve;
      if (this._actorLabel) this._actorLabel.string = actorLine;
      if (this._diceLabel) this._diceLabel.string = String(dice);
      this._root.active = true;
      this._root.setSiblingIndex(9998);
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => this.hide(), 2400);
    });
  }

  hide(): void {
    this._root.active = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    const done = this._resolve;
    this._resolve = null;
    done?.();
  }
}
