// 远征战报消息栏（右侧竖条，最近 12 条，按事件类型上色，回合号前缀分组显示）。
// 解决"结束回合后世界悄悄变化、玩家不知道发生了什么"的信息真空（design §2 UX 补强）。
// M1 无美术资源，纯 Graphics 半透明背景 + Label 文本。

import { Color, Graphics, Label, Node, UITransform } from 'cc';
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

const TURN_PREFIX_COLOR = new Color(120, 125, 140, 255);
const TITLE_COLOR = new Color(225, 230, 240, 255);
const BG_COLOR = new Color(20, 22, 32, 180);
const BORDER_COLOR = new Color(90, 98, 122, 160);

const MAX_ENTRIES = 6;
const LINE_H = 22;
const PAD_X = 10;
const PAD_TOP = 8;
const TITLE_H = 26;

interface Entry {
  turn: number;
  kind: LogKind;
  text: string;
}

/** 战报视图：固定大小面板，push 时滚动最旧条目。 */
export class PveMessageLog {
  private _root: Node;
  private _lines: Label[] = [];
  private _entries: Entry[] = [];

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

    // 预建 MAX_ENTRIES 个 Label（节点池化）
    const startY = h / 2 - PAD_TOP - TITLE_H - LINE_H / 2;
    for (let i = 0; i < MAX_ENTRIES; i++) {
      const lbl = makeLabel(
        this._root,
        0,
        startY - i * LINE_H,
        w - PAD_X * 2,
        LINE_H,
        14,
        COLOR_BY_KIND.SYSTEM,
        Label.HorizontalAlign.LEFT,
      );
      lbl.string = '';
      this._lines.push(lbl);
    }
  }

  /** 追加一条战报；超过 MAX_ENTRIES 时滚出最旧。 */
  push(turn: number, kind: LogKind, text: string): void {
    this._entries.push({ turn, kind, text });
    if (this._entries.length > MAX_ENTRIES) {
      this._entries.shift();
    }
    this._render();
  }

  /** 清空（楼层切换 / 死亡 / 重开远征时调用）。 */
  clear(): void {
    this._entries = [];
    this._render();
  }

  private _render(): void {
    // 像普通消息框一样从上到下追加：最旧在顶部、最新在底部
    // 条目数 < MAX_ENTRIES 时，顶部留空（lbl.string=''），让条目自然贴底
    const offset = MAX_ENTRIES - this._entries.length;
    let prevTurn = -1;
    for (let i = 0; i < MAX_ENTRIES; i++) {
      const lbl = this._lines[i];
      const entryIdx = i - offset;
      if (entryIdx < 0) {
        lbl.string = '';
        continue;
      }
      const e = this._entries[entryIdx];
      // 同回合内只在首行显示「回合N」前缀，其余空两格对齐（视觉分组）。
      // 用中文「回合N」而非「T{n}」更白话，符合普通玩家直觉。
      const showTurnPrefix = e.turn !== prevTurn;
      prevTurn = e.turn;
      lbl.string = showTurnPrefix ? `回合${e.turn}  ${e.text}` : `        ${e.text}`;
      lbl.color = COLOR_BY_KIND[e.kind];
    }
    // 回合分组前缀色调（不能 per-character 上色，整行取事件色即可；
    // 视觉分组靠 showTurnPrefix 是否带"T{n}"实现，足够分辨）
    void TURN_PREFIX_COLOR; // 预留，后续若改富文本可用
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
