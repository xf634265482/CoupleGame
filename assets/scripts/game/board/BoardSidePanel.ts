import { Button, Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import { getCachedSprite, loadUiSprite } from '../../ui/UiAssets';
import { ensureArtStretch } from '../../ui/UiSprite';

export type SidePanelLayout = {
  panelW: number;
  buttonCenter: Vec3;
  buttonZoneH: number;
  logCenter: Vec3;
  logZoneH: number;
};

export type SidePanelCallbacks = {
  onRoll: () => void;
  onBackpack: () => void;
  onAttack: () => void;
  onHelp: () => void;
  onEndTurn: () => void;
  onQuickChat: () => void;
};

type BtnSpec = { key: string; text: string; color: Color; cb: () => void };

const BUTTON_SPRITE_KEY: Record<string, string> = {
  roll: 'board/buttons/btn_board_roll_9s',
  bag: 'board/buttons/btn_board_bag_9s',
  atk: 'board/buttons/btn_board_attack_9s',
  help: 'board/buttons/btn_board_help_9s',
  end: 'board/buttons/btn_board_end_9s',
  quickChat: 'board/buttons/btn_board_quick_chat',
};

const SIDE_BTN_H = 44;
const SIDE_BTN_GAP = 3;
const BOARD_BTN_ART_INSET_X = 0.16;
const BOARD_BTN_ART_INSET_Y = 0.12;
const LOG_QUICK_H = 44;
const LOG_FONT_SIZE = 24;
const LOG_LINE_HEIGHT = 30;
const LOG_TEXT_PAD_X = 18;
const LOG_TEXT_PAD_TOP = 26;
const LOG_TEXT_PAD_BOTTOM = 12;

export class BoardSidePanel {
  private _btnRoot: Node;
  private _btnCol: Node;
  private _logRoot: Node;
  private _quickChatBtn: Node;
  private _logLabel: Label | null = null;
  private _logLines: string[] = [];
  private _btns: Record<string, Node> = {};

  constructor(
    canvas: Node,
    layout: SidePanelLayout,
    callbacks: SidePanelCallbacks,
  ) {
    const btnW = Math.round(layout.panelW - 12);
    const btnH = SIDE_BTN_H;
    const gap = SIDE_BTN_GAP;
    const specs: BtnSpec[] = [
      { key: 'roll', text: '投骰', color: new Color(210, 130, 40, 255), cb: callbacks.onRoll },
      { key: 'bag', text: '背包', color: new Color(70, 140, 200, 255), cb: callbacks.onBackpack },
      { key: 'atk', text: '攻击', color: new Color(190, 70, 70, 255), cb: callbacks.onAttack },
      { key: 'help', text: '说明', color: new Color(55, 150, 145, 255), cb: callbacks.onHelp },
      { key: 'end', text: '结束', color: new Color(90, 120, 90, 255), cb: callbacks.onEndTurn },
    ];
    const btnBlockH = specs.length * btnH + (specs.length - 1) * gap;

    this._btnRoot = new Node('SideButtons');
    this._btnRoot.setParent(canvas);
    this._btnRoot.setSiblingIndex(900);
    this._btnRoot.setPosition(layout.buttonCenter);
    this._btnRoot.addComponent(UITransform).setContentSize(btnW, layout.buttonZoneH);

    this._btnCol = new Node('BtnCol');
    this._btnCol.setParent(this._btnRoot);
    this._btnCol.setPosition(new Vec3(0, btnBlockH / 2, 0));

    let y = 0;
    specs.forEach((s) => {
      const btn = this._makeBtn(this._btnCol, s.text, 0, -y - btnH / 2, btnW, btnH, s.color, s.cb);
      this._btns[s.key] = btn;
      y += btnH + gap;
    });

    const logH = layout.logZoneH;
    const logW = btnW;
    this._logRoot = new Node('SideMessages');
    this._logRoot.setParent(canvas);
    this._logRoot.setSiblingIndex(800);
    this._logRoot.setPosition(layout.logCenter);
    this._logRoot.addComponent(UITransform).setContentSize(logW, logH);

    const lg = this._logRoot.addComponent(Graphics);
    lg.fillColor = new Color(8, 10, 18, 200);
    lg.rect(-logW / 2, -logH / 2, logW, logH);
    lg.fill();
    lg.strokeColor = new Color(90, 110, 150, 180);
    lg.lineWidth = 2;
    lg.rect(-logW / 2 + 1, -logH / 2 + 1, logW - 2, logH - 2);
    lg.stroke();

    const quickH = LOG_QUICK_H;
    const textTopY = logH / 2 - LOG_TEXT_PAD_TOP;
    const textBottomY = -logH / 2 + quickH + LOG_TEXT_PAD_BOTTOM;
    const textH = Math.max(40, textTopY - textBottomY);
    const ln = new Node('L');
    ln.setParent(this._logRoot);
    const labelUt = ln.addComponent(UITransform);
    labelUt.setAnchorPoint(0, 1);
    labelUt.setContentSize(logW - LOG_TEXT_PAD_X * 2, textH);
    ln.setPosition(new Vec3(-logW / 2 + LOG_TEXT_PAD_X, textTopY, 0));
    this._logLabel = ln.addComponent(Label);
    this._logLabel.fontSize = LOG_FONT_SIZE;
    this._logLabel.lineHeight = LOG_LINE_HEIGHT;
    this._logLabel.color = new Color(235, 240, 250, 255);
    this._logLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this._logLabel.verticalAlign = Label.VerticalAlign.TOP;
    this._logLabel.overflow = Label.Overflow.SHRINK;
    this._logLabel.string = '';

    this._quickChatBtn = this._makeBtn(
      this._logRoot,
      '...',
      logW / 2 - 30,
      -logH / 2 + quickH / 2 + 2,
      56,
      quickH,
      new Color(80, 130, 200, 255),
      callbacks.onQuickChat,
    );
    this._btns.quickChat = this._quickChatBtn;
  }

  get root(): Node {
    return this._btnRoot;
  }

  setVisible(visible: boolean): void {
    if (this._btnRoot?.isValid) this._btnRoot.active = visible;
    if (this._logRoot?.isValid) this._logRoot.active = visible;
  }

  relayout(layout: SidePanelLayout): void {
    const btnW = Math.round(layout.panelW - 16);
    this._btnRoot.setPosition(layout.buttonCenter);
    this._btnRoot.setSiblingIndex(900);
    this._btnRoot.getComponent(UITransform)?.setContentSize(btnW, layout.buttonZoneH);
    const btnBlockH = 5 * SIDE_BTN_H + 4 * SIDE_BTN_GAP;
    this._btnCol.setPosition(new Vec3(0, btnBlockH / 2, 0));
    for (const node of Object.values(this._btns)) {
      if (node === this._quickChatBtn) continue;
      node.getComponent(UITransform)?.setContentSize(btnW, SIDE_BTN_H);
    }
    this._logRoot.setPosition(layout.logCenter);
    this._logRoot.setSiblingIndex(800);
    this._logRoot.getComponent(UITransform)?.setContentSize(btnW, layout.logZoneH);
    const logW = btnW;
    const logH = layout.logZoneH;
    const textTopY = logH / 2 - LOG_TEXT_PAD_TOP;
    const textBottomY = -logH / 2 + LOG_QUICK_H + LOG_TEXT_PAD_BOTTOM;
    const textH = Math.max(40, textTopY - textBottomY);
    const labelNode = this._logLabel?.node;
    const labelUt = labelNode?.getComponent(UITransform);
    labelUt?.setAnchorPoint(0, 1);
    labelUt?.setContentSize(logW - LOG_TEXT_PAD_X * 2, textH);
    labelNode?.setPosition(new Vec3(-logW / 2 + LOG_TEXT_PAD_X, textTopY, 0));
    this._quickChatBtn.setPosition(new Vec3(logW / 2 - 30, -logH / 2 + LOG_QUICK_H / 2 + 2, 0));
    if (this._logLabel) {
      this._logLabel.fontSize = LOG_FONT_SIZE;
      this._logLabel.lineHeight = LOG_LINE_HEIGHT;
    }
    this.applyArt();
  }

  setButtonEnabled(key: 'roll' | 'bag' | 'atk' | 'end', enabled: boolean): void {
    const btn = this._btns[key];
    if (!btn) return;
    const b = btn.getComponent(Button);
    if (b) b.interactable = enabled;
    const lbl = btn.getChildByName('L')?.getComponent(Label);
    if (lbl) {
      lbl.color = enabled ? new Color(255, 255, 255, 255) : new Color(160, 165, 180, 255);
    }
    this._applyButtonArt(key, btn);
  }

  appendMessage(line: string): void {
    if (!line) return;
    this._logLines.push(line);
    if (this._logLines.length > 8) this._logLines.shift();
    if (this._logLabel) {
      this._logLabel.string = this._logLines.join('\n');
    }
  }

  clearMessages(): void {
    this._logLines = [];
    if (this._logLabel) this._logLabel.string = '';
  }

  applyArt(): void {
    for (const [key, node] of Object.entries(this._btns)) {
      this._applyButtonArt(key, node);
    }
    const ut = this._logRoot?.getComponent(UITransform);
    const sf = getCachedSprite('board/panels/panel_board_message_9s');
    const lg = this._logRoot?.getComponent(Graphics);
    if (ut && sf) {
      ensureArtStretch(
        this._logRoot,
        'LogArt',
        sf,
        ut.contentSize.width,
        ut.contentSize.height,
      );
      if (lg) lg.enabled = false;
    } else if (lg) {
      lg.enabled = true;
    }
  }

  private _applyButtonArt(key: string, node: Node): void {
    if (!node?.isValid) return;
    const btn = node.getComponent(Button);
    const disabled = !!btn && !btn.interactable && key !== 'quickChat';
    const spriteKey = disabled
      ? 'board/buttons/btn_board_disabled_9s'
      : BUTTON_SPRITE_KEY[key];
    const sf = spriteKey ? getCachedSprite(spriteKey) : null;
    const ut = node.getComponent(UITransform);
    const g = node.getComponent(Graphics);
    if (sf && ut) {
      const artW = Math.round(ut.contentSize.width * (1 - BOARD_BTN_ART_INSET_X * 2));
      const artH = Math.round(ut.contentSize.height * (1 - BOARD_BTN_ART_INSET_Y * 2));
      ensureArtStretch(node, 'BtnArt', sf, artW, artH);
      node.getChildByName('BtnArt')?.setPosition(0, 0, 0);
      if (g) g.enabled = false;
    } else {
      node.getChildByName('BtnArt')?.destroy();
      if (g) g.enabled = true;
      if (spriteKey) {
        void loadUiSprite(spriteKey).then((loaded) => {
          if (!loaded || !node.isValid) return;
          this._applyButtonArt(key, node);
        });
      }
    }
  }

  private _makeBtn(
    parent: Node,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    color: Color,
    cb: () => void,
  ): Node {
    const n = new Node(`Btn_${text}`);
    n.setParent(parent);
    n.setPosition(new Vec3(x, y, 0));
    n.addComponent(UITransform).setContentSize(w, h);
    const g = n.addComponent(Graphics);
    g.fillColor = color;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    if (w <= 48 && h <= 36) {
      g.strokeColor = new Color(255, 255, 255, 220);
      g.lineWidth = 2;
      g.rect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
      g.stroke();
    }
    const ln = new Node('L');
    ln.setParent(n);
    ln.addComponent(UITransform).setContentSize(w, h);
    const lbl = ln.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = Math.max(18, Math.min(25, Math.round(h * 0.68)));
    lbl.color = new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;
    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    btn.zoomScale = 0.96;
    btn.target = n;
    n.on(Button.EventType.CLICK, cb, this);
    return n;
  }
}
