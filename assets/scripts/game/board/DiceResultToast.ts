import { Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import { getCachedSprite } from '../../ui/UiAssets';
import { ensureArtSliced } from '../../ui/UiSprite';
import { makeModalButton } from './UiModalButton';

const MODAL_SLICE = { top: 36, bottom: 36, left: 36, right: 36 };

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

    const box = new Node('Box');
    box.setParent(this._root);
    box.setPosition(new Vec3(0, 80, 0));
    box.addComponent(UITransform).setContentSize(480, 340);

    const mask = new Node('Mask');
    mask.setParent(box);
    mask.setPosition(new Vec3(0, 0, 0));
    const maskW = 510;
    const maskH = 355;
    mask.addComponent(UITransform).setContentSize(maskW, maskH);
    const mg = mask.addComponent(Graphics);
    mg.fillColor = new Color(8, 12, 24, 175);
    mg.rect(-maskW / 2, -maskH / 2, maskW, maskH);
    mg.fill();

    const modalSf = getCachedSprite('board/panels/panel_board_modal_9s');
    if (modalSf) {
      ensureArtSliced(box, 'ModalArt', modalSf, 480, 340, MODAL_SLICE);
      box.getChildByName('ModalArt')?.setSiblingIndex(box.children.length - 1);
    }

    const cap = new Node('Caption');
    cap.setParent(box);
    cap.setPosition(new Vec3(0, 130, 0));
    cap.addComponent(UITransform).setContentSize(440, 44);
    const cl = cap.addComponent(Label);
    cl.string = '掷骰结果';
    cl.fontSize = 34;
    cl.color = new Color(255, 230, 150, 255);
    cl.horizontalAlign = Label.HorizontalAlign.CENTER;

    const actorN = new Node('Actor');
    actorN.setParent(box);
    actorN.setPosition(new Vec3(0, 82, 0));
    actorN.addComponent(UITransform).setContentSize(440, 48);
    this._actorLabel = actorN.addComponent(Label);
    this._actorLabel.fontSize = 32;
    this._actorLabel.lineHeight = 40;
    this._actorLabel.color = new Color(230, 235, 245, 255);
    this._actorLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    const diceN = new Node('Dice');
    diceN.setParent(box);
    diceN.setPosition(new Vec3(0, 8, 0));
    diceN.addComponent(UITransform).setContentSize(260, 120);
    this._diceLabel = diceN.addComponent(Label);
    this._diceLabel.fontSize = 100;
    this._diceLabel.lineHeight = 110;
    this._diceLabel.color = new Color(255, 255, 255, 255);
    this._diceLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._diceLabel.verticalAlign = Label.VerticalAlign.CENTER;
    this._diceLabel.overflow = Label.Overflow.CLAMP;

    makeModalButton(box, '继续', 0, -120, 240, 52, () => this.hide());
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
