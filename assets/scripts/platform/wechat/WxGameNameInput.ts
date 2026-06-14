import {
  _decorator,
  Color,
  Component,
  EditBox,
  Graphics,
  Label,
  Node,
  UITransform,
  Vec3,
} from 'cc';
import { getCachedSprite } from '../../ui/UiAssets';
import { ensureArtStretch } from '../../ui/UiSprite';

const { ccclass } = _decorator;

const INPUT_W = 480;
const INPUT_H = 60;
export const GAME_NAME_MAX_LEN = 16;

/**
 * 玩家昵称输入：未聚焦时不启用 EditBox，避免 iOS 真机挡住下方按钮点击
 */
@ccclass('WxGameNameInput')
export class WxGameNameInput extends Component {
  private _displayLabel: Label | null = null;
  private _editBox: EditBox | null = null;
  private _inputBox: Node | null = null;
  private _value = '';

  get string(): string {
    return this._readValue();
  }

  set string(v: string) {
    this._value = this._sanitize(v);
    if (this._editBox) {
      this._editBox.string = this._value;
    }
    this._syncLabel();
  }

  onLoad(): void {
    this._buildDisplay();
    this._setupEditBox();
    this._syncLabel();
  }

  /** 创建房间前读取当前输入 */
  async commitValue(): Promise<string> {
    if (this._editBox) {
      this._editBox.blur();
      await new Promise<void>((r) => setTimeout(r, 32));
    }
    this._value = this._readValue();
    this._syncLabel();
    return this._value;
  }

  dismiss(): void {
    this._deactivateEditBox();
    if (typeof wx !== 'undefined') {
      wx.hideKeyboard?.({});
    }
    this.node.active = false;
    this.node.emit('keyboard-height', 0);
  }

  /** 加入房间前调用：收起键盘并释放触摸拦截 */
  blurForAction(): void {
    this._deactivateEditBox();
    if (typeof wx !== 'undefined') {
      wx.hideKeyboard?.({});
    }
    this.node.emit('keyboard-height', 0);
  }

  show(): void {
    this.node.active = true;
  }

  applyArt(): void {
    const sf = getCachedSprite('lobby/input_lobby_name_9s');
    if (sf && this._inputBox?.isValid) {
      ensureArtStretch(this._inputBox, 'InputArt', sf, INPUT_W, INPUT_H);
      this._inputBox.getChildByName('InputArt')?.setSiblingIndex(0);
    }
  }

  private _readValue(): string {
    const raw = this._editBox?.string ?? this._value;
    return this._sanitize(raw);
  }

  private _sanitize(raw: string): string {
    return String(raw || '')
      .trim()
      .slice(0, GAME_NAME_MAX_LEN);
  }

  private _buildDisplay(): void {
    const root = this.node;
    root.addComponent(UITransform).setContentSize(INPUT_W, INPUT_H);

    const box = new Node('InputBox');
    box.setParent(root);
    this._inputBox = box;
    box.addComponent(UITransform).setContentSize(INPUT_W, INPUT_H);
    const g = box.addComponent(Graphics);
    g.fillColor = new Color(40, 44, 58, 255);
    g.rect(-INPUT_W / 2, -INPUT_H / 2, INPUT_W, INPUT_H);
    g.fill();
    const sf = getCachedSprite('lobby/input_lobby_name_9s');
    if (sf) {
      this.applyArt();
    }

    const labelNode = new Node('Display');
    labelNode.setParent(box);
    labelNode.setPosition(0, -2, 0);
    labelNode.addComponent(UITransform).setContentSize(INPUT_W - 28, INPUT_H - 16);
    this._displayLabel = labelNode.addComponent(Label);
    this._displayLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._displayLabel.verticalAlign = Label.VerticalAlign.CENTER;
    this._displayLabel.overflow = Label.Overflow.SHRINK;
    this._displayLabel.fontSize = 28;
    this._displayLabel.lineHeight = INPUT_H;
    this._displayLabel.color = new Color(160, 165, 180, 255);
    this._displayLabel.string = '输入你的昵称';
  }

  private _setupEditBox(): void {
    const box = this._inputBox;
    if (!box || !this._displayLabel) return;

    const eb = box.addComponent(EditBox);
    eb.maxLength = GAME_NAME_MAX_LEN;
    eb.placeholder = '输入昵称，如：林';
    eb.string = this._value;
    eb.textLabel = this._displayLabel;
    eb.inputMode = EditBox.InputMode.SINGLE_LINE;
    eb.inputFlag = EditBox.InputFlag.DEFAULT;
    eb.returnType = EditBox.KeyboardReturnType.DONE;
    eb.tabIndex = 0;
    eb.node.setPosition(0, -2, 0);

    const sync = () => {
      this._value = this._sanitize(eb.string);
      this._syncLabel();
    };
    eb.node.on('text-changed', sync, this);
    eb.node.on('editing-did-ended', () => {
      sync();
      this._deactivateEditBox();
    }, this);
    eb.node.on('editing-return', () => {
      sync();
      this._deactivateEditBox();
    }, this);

    this._editBox = eb;
    this._deactivateEditBox();

    box.on(Node.EventType.TOUCH_END, () => this._activateEditBox(), this);
  }

  private _activateEditBox(): void {
    if (!this._editBox) return;
    this._editBox.enabled = true;
    this._editBox.node.setPosition(Vec3.ZERO);
    this.scheduleOnce(() => {
      this._editBox?.focus();
    }, 0);
  }

  private _deactivateEditBox(): void {
    if (!this._editBox) return;
    this._editBox.blur();
    this._editBox.enabled = false;
  }

  private _syncLabel(): void {
    if (!this._displayLabel) return;
    if (this._value.length > 0) {
      this._displayLabel.string = this._value;
      this._displayLabel.fontSize = 28;
      this._displayLabel.lineHeight = INPUT_H - 16;
      this._displayLabel.color = new Color(255, 220, 100, 255);
    } else {
      this._displayLabel.string = '输入你的昵称';
      this._displayLabel.fontSize = 26;
      this._displayLabel.lineHeight = INPUT_H - 16;
      this._displayLabel.color = new Color(160, 165, 180, 255);
    }
  }

  onDestroy(): void {
    if (typeof wx !== 'undefined') {
      wx.hideKeyboard?.({});
    }
  }
}
