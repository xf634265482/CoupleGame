// 远征战报消息栏（右侧竖条，按事件类型上色，回合号前缀分组显示，可上下滑动查看本层全部回合）。
// 解决"结束回合后世界悄悄变化、玩家不知道发生了什么"的信息真空（design §2 UX 补强）。
// M1 无美术资源，纯 Graphics 半透明背景 + Label 文本；列表用 ScrollView+Mask+Layout 实现滚动。

import { Color, Graphics, Label, Layout, Mask, Node, ScrollView, UITransform } from 'cc';
import { makeLabel } from './pveUiKit';

/** 战报条目分类，对应不同颜色，让玩家一眼分辨"谁干了什么"。 */
export type LogKind =
  | 'PLAYER_ACT' // 玩家行动（移动/攻击/击杀）
  | 'PLAYER_HURT' // 玩家受击
  | 'ENEMY_ACT' // 怪物行动（移动/攻击/警觉）
  | 'LOOT' // 掉落/拾取/开箱
  | 'AP' // AP 掷骰
  | 'SYSTEM'; // 回合分隔/通关/系统提示

const COLOR_BY_KIND: Record<LogKind, Color> = {
  PLAYER_ACT: new Color(140, 220, 140, 255),
  PLAYER_HURT: new Color(235, 110, 100, 255),
  ENEMY_ACT: new Color(245, 200, 110, 255),
  LOOT: new Color(245, 210, 110, 255),
  AP: new Color(140, 200, 255, 255),
  SYSTEM: new Color(180, 185, 200, 255),
};

const TITLE_COLOR = new Color(225, 230, 240, 255);
const BG_COLOR = new Color(20, 22, 32, 180);
const BORDER_COLOR = new Color(90, 98, 122, 160);

const LINE_H = 22;
const PAD_X = 10;
const PAD_TOP = 8;
const TITLE_H = 26;
/** 判断"是否已滚到底部"的容差像素，浮点误差用。 */
const SCROLL_EPS = 4;

/** 战报视图：固定大小面板，内部为可滚动列表，append-only 显示本层全部回合记录。 */
export class PveMessageLog {
  private _root: Node;
  private _content: Node;
  private _scrollView: ScrollView;
  private _lastTurn = -1;

  constructor(parent: Node, x: number, y: number, w: number = 240, h: number = 320) {
    this._root = new Node('PveMessageLog');
    this._root.setParent(parent);
    this._root.setPosition(x, y, 0);
    this._root.addComponent(UITransform).setContentSize(w, h);

    // 半透明背景 + 边框（M1 占位，未来可换成 sprite frame）
    const bg = this._root.addComponent(Graphics);
    bg.fillColor = BG_COLOR;
    bg.rect(-w / 2, -h / 2, w, h);
    bg.fill();
    bg.strokeColor = BORDER_COLOR;
    bg.lineWidth = 1;
    bg.rect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
    bg.stroke();

    // 标题
    makeLabel(
      this._root,
      0,
      h / 2 - PAD_TOP - TITLE_H / 2,
      w - PAD_X * 2,
      TITLE_H,
      18,
      TITLE_COLOR,
      Label.HorizontalAlign.CENTER,
    ).string = '📜 战报';

    // 可视区域（Mask 裁剪），位于标题下方，左右各留 PAD_X，底部留 PAD_TOP
    const viewW = w - PAD_X * 2;
    const viewH = h - PAD_TOP * 2 - TITLE_H;
    const view = new Node('View');
    view.setParent(this._root);
    view.setPosition(0, h / 2 - PAD_TOP - TITLE_H - viewH / 2, 0);
    view.addComponent(UITransform).setContentSize(viewW, viewH);
    view.addComponent(Mask);

    // 内容容器：纵向 Layout，随条目数自动增高；顶部对齐 view 顶部，超出部分由 Mask 裁剪
    const content = new Node('Content');
    content.setParent(view);
    const contentUi = content.addComponent(UITransform);
    contentUi.setAnchorPoint(0.5, 1);
    contentUi.setContentSize(viewW, 0);
    content.setPosition(0, viewH / 2, 0);

    const layout = content.addComponent(Layout);
    layout.type = Layout.Type.VERTICAL;
    layout.resizeMode = Layout.ResizeMode.CONTAINER;
    layout.spacingY = 0;

    const sv = view.addComponent(ScrollView);
    sv.content = content;
    sv.horizontal = false;
    sv.vertical = true;

    this._content = content;
    this._scrollView = sv;
  }

  /** 追加一条战报；append-only，本层切换前全部保留，可上下滑动查看。 */
  push(turn: number, kind: LogKind, text: string): void {
    // 同回合内只在首行显示「回合N」前缀，其余空两格对齐（视觉分组）。
    // 用中文「回合N」而非「T{n}」更白话，符合普通玩家直觉。
    const showTurnPrefix = turn !== this._lastTurn;
    this._lastTurn = turn;
    const str = showTurnPrefix ? `回合${turn}  ${text}` : `        ${text}`;

    const wasAtBottom = this._isAtBottom();

    const contentW = this._content.getComponent(UITransform)!.width;
    const lbl = makeLabel(this._content, 0, 0, contentW, LINE_H, 14, COLOR_BY_KIND[kind], Label.HorizontalAlign.LEFT);
    lbl.string = str;

    // 立即重排，使 ScrollView 的滚动范围马上反映新内容（避免下一帧才生效）
    this._content.getComponent(Layout)?.updateLayout();

    if (wasAtBottom) {
      this._scrollView.scrollToBottom(0);
    }
  }

  /** 清空（楼层切换 / 死亡 / 重开远征时调用）。 */
  clear(): void {
    this._content.removeAllChildren();
    this._lastTurn = -1;
    this._content.getComponent(Layout)?.updateLayout();
    this._scrollView.scrollToBottom(0);
  }

  /** 当前滚动位置是否已在底部（容差 SCROLL_EPS），用于决定新条目是否需要自动跟随滚动。 */
  private _isAtBottom(): boolean {
    const maxOffset = this._scrollView.getMaxScrollOffset();
    if (maxOffset.y <= 0) return true;
    const offset = this._scrollView.getScrollOffset();
    return Math.abs(offset.y - maxOffset.y) < SCROLL_EPS;
  }

  get node(): Node {
    return this._root;
  }

  setVisible(visible: boolean): void {
    this._root.active = visible;
  }

  destroy(): void {
    this._root.destroy();
  }
}
