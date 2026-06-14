import { Button, Color, Graphics, Label, Node, UITransform } from 'cc';
import { getCachedSprite, loadUiSprite } from '../../ui/UiAssets';
import { ensureArtStretch } from '../../ui/UiSprite';

const BTN_INSET_X = 0.14;
const BTN_INSET_Y = 0.12;

/** 弹窗/Toast 通用按钮（复用大厅绿色按钮素材） */
export function applyModalButtonArt(node: Node, w: number, h: number, disabled = false): void {
  const key = disabled ? 'board/buttons/btn_board_disabled_9s' : 'lobby/btn_lobby_create_9s';
  const sf = getCachedSprite(key);
  const g = node.getComponent(Graphics);
  if (!sf) {
    if (g) g.enabled = true;
    void loadUiSprite(key).then((loaded) => {
      if (loaded && node.isValid) applyModalButtonArt(node, w, h, disabled);
    });
    return;
  }
  const artW = Math.round(w * (1 - BTN_INSET_X * 2));
  const artH = Math.round(h * (1 - BTN_INSET_Y * 2));
  ensureArtStretch(node, 'BtnArt', sf, artW, artH);
  node.getChildByName('BtnArt')?.setSiblingIndex(0);
  if (g) g.enabled = false;
}

export function makeModalButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  onClick: () => void,
  disabled = false,
): Node {
  const n = new Node(`Btn_${text}`);
  n.setParent(parent);
  n.setPosition(x, y, 0);
  n.addComponent(UITransform).setContentSize(w, h);
  const g = n.addComponent(Graphics);
  g.fillColor = disabled ? new Color(70, 75, 85, 255) : new Color(52, 120, 200, 255);
  g.rect(-w / 2, -h / 2, w, h);
  g.fill();
  applyModalButtonArt(n, w, h, disabled);

  const ln = new Node('L');
  ln.setParent(n);
  ln.addComponent(UITransform).setContentSize(w, h);
  const lbl = ln.addComponent(Label);
  lbl.string = text;
  lbl.fontSize = Math.max(20, Math.min(28, Math.round(h * 0.46)));
  lbl.color = disabled ? new Color(160, 165, 180, 255) : new Color(255, 255, 255, 255);
  lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
  lbl.verticalAlign = Label.VerticalAlign.CENTER;
  lbl.overflow = Label.Overflow.SHRINK;

  if (!disabled) {
    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    btn.zoomScale = 0.96;
    btn.target = n;
    n.on(Button.EventType.CLICK, onClick, n);
  }
  return n;
}
