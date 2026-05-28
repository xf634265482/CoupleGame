import {
  _decorator,
  Color,
  Component,
  Graphics,
  Label,
  Node,
  NodeEventType,
  UITransform,
  Vec3,
} from 'cc';

const { ccclass } = _decorator;

const INPUT_W = 480;
const INPUT_H = 60;
const PAD_BTN = 96;
const PAD_GAP = 8;
const PAD_ROWS = 4;
/** 展开数字键盘后的总高度 */
export const ROOM_CODE_INPUT_EXPANDED_H =
  INPUT_H + PAD_ROWS * (PAD_BTN + PAD_GAP) + 12;

type WxKeyboardRes = { value: string };

/**
 * 房间号输入：真机用 wx.showKeyboard；模拟器点输入框展开下方数字键
 */
@ccclass('WxRoomCodeInput')
export class WxRoomCodeInput extends Component {
  private _displayLabel: Label | null = null;
  private _value = '';
  private _onInput?: (res: WxKeyboardRes) => void;
  private _onConfirm?: (res: WxKeyboardRes) => void;
  private _onKeyboardHeight?: (res: { height: number }) => void;
  private _padRoot: Node | null = null;
  private _nativeKeyboardOk = false;
  private _padVisible = false;

  get string(): string {
    return this._value;
  }

  set string(v: string) {
    this._value = v.replace(/\D/g, '').slice(0, 6);
    this._refresh();
  }

  /** 当前占用高度（收起时仅输入框） */
  get blockHeight(): number {
    return this._padVisible ? ROOM_CODE_INPUT_EXPANDED_H : INPUT_H;
  }

  get isPadVisible(): boolean {
    return this._padVisible;
  }

  onLoad(): void {
    this._buildDisplay();
    this._buildNumpad();
    this._bindWxKeyboard();
    this._setPadVisible(false);
    this._refresh();
  }

  /** 收起数字键盘（不影响系统键盘） */
  collapsePad(): void {
    this._setPadVisible(false);
  }

  private _buildDisplay(): void {
    const root = this.node;
    root.addComponent(UITransform).setContentSize(INPUT_W, INPUT_H);

    const box = new Node('InputBox');
    box.setParent(root);
    box.setPosition(new Vec3(0, 0, 0));
    box.addComponent(UITransform).setContentSize(INPUT_W, INPUT_H);
    const g = box.addComponent(Graphics);
    g.fillColor = new Color(40, 44, 58, 255);
    g.rect(-INPUT_W / 2, -INPUT_H / 2, INPUT_W, INPUT_H);
    g.fill();

    const labelNode = new Node('Display');
    labelNode.setParent(box);
    labelNode.setPosition(0, 0, 0);
    labelNode.addComponent(UITransform).setContentSize(INPUT_W - 12, INPUT_H);
    this._displayLabel = labelNode.addComponent(Label);
    this._displayLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._displayLabel.verticalAlign = Label.VerticalAlign.CENTER;
    this._displayLabel.overflow = Label.Overflow.SHRINK;

    box.on(NodeEventType.TOUCH_END, this._onTapBox, this);
  }

  private _buildNumpad(): void {
    const root = this.node;
    this._padRoot = new Node('Numpad');
    this._padRoot.setParent(root);
    const padTopY = -INPUT_H / 2 - PAD_GAP - PAD_BTN / 2;

    const keys = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['←', '0', 'OK'],
    ];

    keys.forEach((row, ri) => {
      row.forEach((key, ci) => {
        const x = (ci - 1) * (PAD_BTN + PAD_GAP);
        const y = padTopY - ri * (PAD_BTN + PAD_GAP);
        this._makePadKey(key, x, y);
      });
    });
  }

  private _makePadKey(key: string, x: number, y: number): void {
    const n = new Node(`Key_${key}`);
    n.setParent(this._padRoot!);
    n.setPosition(new Vec3(x, y, 0));
    n.addComponent(UITransform).setContentSize(PAD_BTN, PAD_BTN);

    const g = n.addComponent(Graphics);
    g.fillColor = new Color(55, 60, 75, 255);
    g.rect(-PAD_BTN / 2, -PAD_BTN / 2, PAD_BTN, PAD_BTN);
    g.fill();

    const lblNode = new Node('L');
    lblNode.setParent(n);
    lblNode.addComponent(UITransform).setContentSize(PAD_BTN, PAD_BTN);
    const lbl = lblNode.addComponent(Label);
    lbl.string = key;
    lbl.fontSize = key === 'OK' ? 28 : 34;
    lbl.color = key === 'OK' ? new Color(120, 220, 140, 255) : new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;

    n.on(NodeEventType.TOUCH_END, () => this._onPadKey(key), this);
  }

  private _setPadVisible(visible: boolean): void {
    this._padVisible = visible;
    if (this._padRoot) this._padRoot.active = visible;
    const ui = this.node.getComponent(UITransform);
    if (ui) {
      ui.setContentSize(INPUT_W, this.blockHeight);
    }
    this.node.emit('layout-change');
  }

  private _onPadKey(key: string): void {
    if (key === '←') {
      this._value = this._value.slice(0, -1);
    } else if (key === 'OK') {
      this._setPadVisible(false);
      if (typeof wx !== 'undefined') wx.hideKeyboard?.({});
    } else if (this._value.length < 6) {
      this._value += key;
    }
    this._refresh();
  }

  private _onTapBox(): void {
    if (this._isDevtools()) {
      this._setPadVisible(!this._padVisible);
      this._setStatusHint(this._padVisible ? '输入 6 位房间号' : '点输入框展开数字键');
      return;
    }

    if (typeof wx === 'undefined' || !wx.showKeyboard) {
      this._setPadVisible(true);
      this._setStatusHint('请用下方数字键输入');
      return;
    }

    this._setPadVisible(false);
    this._nativeKeyboardOk = false;
    wx.showKeyboard({
      defaultValue: this._value,
      maxLength: 6,
      multiple: false,
      confirmType: 'done',
      success: () => {
        setTimeout(() => {
          if (!this._nativeKeyboardOk) {
            this._setPadVisible(true);
            this._setStatusHint('请用下方数字键输入');
          }
        }, 400);
      },
      fail: () => {
        this._setPadVisible(true);
        this._setStatusHint('键盘不可用，请用下方数字键');
      },
    });
  }

  private _isDevtools(): boolean {
    try {
      const sys = wx.getSystemInfoSync?.();
      return sys?.platform === 'devtools';
    } catch {
      return false;
    }
  }

  private _setStatusHint(msg: string): void {
    if (this._displayLabel && this._value.length === 0) {
      this._displayLabel.string = msg;
    }
  }

  private _bindWxKeyboard(): void {
    if (typeof wx === 'undefined') return;

    this._onInput = (res) => {
      this._value = (res.value || '').replace(/\D/g, '').slice(0, 6);
      this._refresh();
    };
    this._onConfirm = (res) => {
      this._value = (res.value || '').replace(/\D/g, '').slice(0, 6);
      this._refresh();
      wx.hideKeyboard?.({});
    };

    wx.onKeyboardInput?.(this._onInput);
    wx.onKeyboardConfirm?.(this._onConfirm);

    this._onKeyboardHeight = (res) => {
      if (res.height > 0) {
        this._nativeKeyboardOk = true;
        this._setPadVisible(false);
      }
      this.node.emit('keyboard-height', res.height);
    };
    wx.onKeyboardHeightChange?.(this._onKeyboardHeight);
  }

  private _refresh(): void {
    if (!this._displayLabel) return;
    if (this._value.length > 0) {
      this._displayLabel.string = this._value;
      this._displayLabel.fontSize = 38;
      this._displayLabel.color = new Color(255, 220, 100, 255);
    } else if (this._padVisible) {
      this._displayLabel.string = '输入 6 位房间号';
      this._displayLabel.fontSize = 28;
      this._displayLabel.color = new Color(160, 165, 180, 255);
    } else {
      this._displayLabel.string = '点此处输入房间号';
      this._displayLabel.fontSize = 28;
      this._displayLabel.color = new Color(160, 165, 180, 255);
    }
  }

  onDestroy(): void {
    if (typeof wx === 'undefined') return;
    if (this._onInput) wx.offKeyboardInput?.(this._onInput);
    if (this._onConfirm) wx.offKeyboardConfirm?.(this._onConfirm);
    if (this._onKeyboardHeight) wx.offKeyboardHeightChange?.(this._onKeyboardHeight);
    wx.hideKeyboard?.({});
  }
}
