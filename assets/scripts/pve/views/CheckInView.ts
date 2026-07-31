import { Color, EventTouch, Graphics, Label, Node, UITransform } from 'cc';
import type { CheckInReward, CheckInState } from '../../network/PveService';
import { makeFlatButton, makeLabel } from './pveUiKit';

export interface CheckInViewCallbacks {
  onClose(): void;
  onSign(): void;
  onMakeup(day: number): void;
  onClaimMilestone(days: number): void;
}

const TEXT = new Color(225, 238, 255);
const DIM = new Color(170, 205, 235);
const PANEL = new Color(7, 31, 70, 230);
const BORDER = new Color(255, 214, 110, 210);
const PANEL_W = 660;
const PANEL_H = 980;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function rewardText(reward: CheckInReward): string {
  const parts: string[] = [];
  if (reward.gold) parts.push(`星尘${reward.gold}`);
  if (reward.quenchSand) parts.push(`砂${reward.quenchSand}`);
  if (reward.fusionCore) parts.push(`核${reward.fusionCore}`);
  if (reward.voidHide) parts.push(`革${reward.voidHide}`);
  if (reward.makeupCards) parts.push(`补签${reward.makeupCards}`);
  return parts.join('+') || '—';
}

export class CheckInView {
  private readonly _overlay: Node;
  private readonly _panel: Node;
  private readonly _body: Node;
  private readonly _titleLabel: Label;
  private readonly _cardsLabel: Label;
  private readonly _actionBtnHost: Node;
  private _state: CheckInState | null = null;
  private _selectedDay: number | null = null;

  constructor(parent: Node, private readonly _callbacks: CheckInViewCallbacks) {
    this._overlay = new Node('CheckInModal');
    this._overlay.setParent(parent);
    this._overlay.addComponent(UITransform).setContentSize(720, 1280);
    this._overlay.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      if (event.target === this._overlay) this._callbacks.onClose();
      event.propagationStopped = true;
    });

    this._panel = new Node('CheckInPanel');
    this._panel.setParent(this._overlay);
    this._panel.setPosition(0, 10);
    this._panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
    this._panel.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
    });
    const bg = this._panel.addComponent(Graphics);
    bg.fillColor = PANEL;
    bg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 24);
    bg.fill();
    bg.strokeColor = BORDER;
    bg.lineWidth = 2;
    bg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 24);
    bg.stroke();

    this._titleLabel = makeLabel(
      this._panel, 0, PANEL_H / 2 - 42, 400, 40, 30, new Color(255, 220, 100), Label.HorizontalAlign.CENTER,
    );
    this._titleLabel.string = '本月签到';
    this._titleLabel.isBold = true;

    this._cardsLabel = makeLabel(
      this._panel, 0, PANEL_H / 2 - 78, 400, 28, 20, DIM, Label.HorizontalAlign.CENTER,
    );
    this._cardsLabel.string = '补签卡 ×0';

    this._body = new Node('CheckInBody');
    this._body.setParent(this._panel);
    this._body.setPosition(0, 20);
    this._body.addComponent(UITransform).setContentSize(600, 760);

    this._actionBtnHost = new Node('ActionHost');
    this._actionBtnHost.setParent(this._panel);
    this._actionBtnHost.setPosition(0, -PANEL_H / 2 + 110);
    this._actionBtnHost.addComponent(UITransform).setContentSize(520, 60);

    // 广告激励入口占位（首版隐藏）
    const adPlaceholder = new Node('AdMakeupPlaceholder');
    adPlaceholder.setParent(this._panel);
    adPlaceholder.active = false;

    makeFlatButton(
      this._panel,
      '关闭',
      0,
      -PANEL_H / 2 + 48,
      200,
      52,
      () => this._callbacks.onClose(),
      new Color(105, 65, 45, 190),
      { noArt: true, border: new Color(255, 190, 120) },
    );
  }

  get node(): Node {
    return this._overlay;
  }

  setState(state: CheckInState): void {
    this._state = state;
    if (this._selectedDay != null) {
      const cell = state.calendar.find((c) => c.day === this._selectedDay);
      if (!cell || cell.signed || !cell.canMakeup) this._selectedDay = null;
    }
    this._render();
  }

  destroy(): void {
    this._overlay.destroy();
  }

  private _clear(root: Node): void {
    for (const child of [...root.children]) child.destroy();
  }

  private _render(): void {
    const state = this._state;
    this._clear(this._body);
    this._clear(this._actionBtnHost);
    if (!state) {
      const loading = makeLabel(this._body, 0, 0, 400, 40, 24, DIM, Label.HorizontalAlign.CENTER);
      loading.string = '加载中…';
      return;
    }

    this._titleLabel.string = `本月签到 ${state.monthKey}`;
    this._cardsLabel.string = `补签卡 ×${state.makeupCards}`;

    const weekY = 340;
    WEEKDAYS.forEach((name, i) => {
      const lbl = makeLabel(this._body, -255 + i * 85, weekY, 70, 24, 18, DIM, Label.HorizontalAlign.CENTER);
      lbl.string = name;
    });

    // 用 monthKey 推算 1 号星期（东八区正午，避免日界偏移）
    const first = new Date(`${state.monthKey}-01T12:00:00+08:00`);
    const startWeekday = first.getDay(); // 0=Sun

    const cellW = 82;
    const cellH = 72;
    const originX = -255;
    const originY = weekY - 48;

    state.calendar.forEach((cell) => {
      const index = startWeekday + cell.day - 1;
      const col = index % 7;
      const row = Math.floor(index / 7);
      const x = originX + col * 85;
      const y = originY - row * 76;
      const node = new Node(`Day_${cell.day}`);
      node.setParent(this._body);
      node.setPosition(x, y);
      node.addComponent(UITransform).setContentSize(cellW, cellH);

      const g = node.addComponent(Graphics);
      const isToday = cell.day === state.today;
      const selected = this._selectedDay === cell.day;
      if (cell.signed) g.fillColor = new Color(40, 110, 90, 210);
      else if (selected) g.fillColor = new Color(90, 70, 30, 230);
      else if (isToday) g.fillColor = new Color(50, 90, 140, 230);
      else if (cell.canMakeup) g.fillColor = new Color(24, 50, 90, 180);
      else g.fillColor = new Color(14, 36, 70, 140);
      g.roundRect(-cellW / 2, -cellH / 2, cellW, cellH, 10);
      g.fill();
      if (isToday || selected) {
        g.strokeColor = BORDER;
        g.lineWidth = 2;
        g.roundRect(-cellW / 2 + 1, -cellH / 2 + 1, cellW - 2, cellH - 2, 9);
        g.stroke();
      }

      const dayLbl = makeLabel(node, 0, 16, 70, 22, 18, TEXT, Label.HorizontalAlign.CENTER);
      dayLbl.string = String(cell.day);
      dayLbl.isBold = isToday;
      const status = makeLabel(node, 0, -4, 76, 18, 14, DIM, Label.HorizontalAlign.CENTER);
      status.string = cell.signed ? '已签' : (isToday && state.canSignToday ? '今日' : rewardText(cell.reward));
      if (cell.day > state.today) {
        status.string = rewardText(cell.reward);
        node.getComponent(Graphics)!.fillColor = new Color(10, 28, 55, 120);
      }

      if (cell.canMakeup || (isToday && state.canSignToday)) {
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
          event.propagationStopped = true;
          if (isToday && state.canSignToday) {
            this._selectedDay = null;
          } else if (cell.canMakeup) {
            this._selectedDay = cell.day;
          }
          this._render();
        });
      }
    });

    const milY = -210;
    const milTitle = makeLabel(this._body, 0, milY + 70, 520, 28, 22, new Color(255, 220, 100), Label.HorizontalAlign.CENTER);
    milTitle.string = `累计 ${state.signedDays.length} 天`;
    milTitle.isBold = true;

    const span = 110;
    const startX = -((state.milestones.length - 1) * span) / 2;
    state.milestones.forEach((m, i) => {
      const x = startX + i * span;
      const node = new Node(`Ms_${m.days}`);
      node.setParent(this._body);
      node.setPosition(x, milY);
      node.addComponent(UITransform).setContentSize(100, 110);
      const g = node.addComponent(Graphics);
      if (m.claimed) g.fillColor = new Color(40, 110, 90, 210);
      else if (m.reached) g.fillColor = new Color(120, 80, 30, 230);
      else g.fillColor = new Color(20, 45, 80, 180);
      g.roundRect(-48, -50, 96, 100, 12);
      g.fill();
      const d = makeLabel(node, 0, 28, 90, 24, 20, TEXT, Label.HorizontalAlign.CENTER);
      d.string = `${m.days}天`;
      d.isBold = true;
      const r = makeLabel(node, 0, 2, 90, 36, 13, DIM, Label.HorizontalAlign.CENTER);
      r.overflow = Label.Overflow.SHRINK;
      r.string = rewardText(m.reward);
      if (m.claimed) {
        const done = makeLabel(node, 0, -32, 90, 22, 16, new Color(160, 255, 190), Label.HorizontalAlign.CENTER);
        done.string = '已领';
      } else if (m.reached) {
        makeFlatButton(
          node,
          '领取',
          0,
          -32,
          80,
          36,
          () => this._callbacks.onClaimMilestone(m.days),
          new Color(40, 110, 90, 220),
          { noArt: true, border: new Color(120, 220, 170) },
        );
      } else {
        const lock = makeLabel(node, 0, -32, 90, 22, 14, DIM, Label.HorizontalAlign.CENTER);
        lock.string = '未达标';
      }
    });

    if (state.canSignToday) {
      makeFlatButton(
        this._actionBtnHost,
        '签到',
        0,
        0,
        220,
        56,
        () => this._callbacks.onSign(),
        new Color(40, 110, 90, 220),
        { noArt: true, border: new Color(120, 220, 170) },
      );
    } else if (this._selectedDay != null && state.makeupCards > 0) {
      const day = this._selectedDay;
      makeFlatButton(
        this._actionBtnHost,
        `补签 ${day} 日`,
        0,
        0,
        240,
        56,
        () => this._callbacks.onMakeup(day),
        new Color(120, 80, 30, 220),
        { noArt: true, border: new Color(255, 200, 120) },
      );
    } else if (this._selectedDay != null && state.makeupCards <= 0) {
      const tip = makeLabel(this._actionBtnHost, 0, 0, 400, 40, 20, DIM, Label.HorizontalAlign.CENTER);
      tip.string = '补签卡不足';
    } else {
      const tip = makeLabel(this._actionBtnHost, 0, 0, 400, 40, 20, DIM, Label.HorizontalAlign.CENTER);
      tip.string = state.canSignToday ? '' : '今日已签 · 点灰色日期可补签';
    }
  }
}
