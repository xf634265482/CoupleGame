import { Color, EventTouch, Graphics, Label, Node, UITransform } from 'cc';
import type { PveProfile } from '../core/PveProgressionTypes';
import { listPartnerDefinitions, getStageSkillConfig } from '../core/partner/PartnerCatalog';
import type { PartnerId } from '../core/partner/PartnerTypes';
import { PARTNER_EVOLVE_LEVEL, PARTNER_EVOLVE_STARDUST } from '../core/partner/PartnerTypes';
import { canEvolve } from '../core/partner/PartnerProgression';
import { makeFlatButton, makeLabel } from './pveUiKit';

export type PartnerViewCallbacks = {
  onClose: () => void;
  onEquip: (partnerId: PartnerId) => void;
  onEvolve: (partnerId: PartnerId) => void;
};

const PANEL = new Color(7, 31, 70, 230);
const BORDER = new Color(255, 214, 110, 210);
const PANEL_W = 660;
const PANEL_H = 1000;

export class PartnerView {
  private readonly _overlay: Node;
  private readonly _panel: Node;
  private readonly _body: Node;
  private readonly _notice: Label;
  private _profile: PveProfile | null = null;
  private _selected: PartnerId = 'MOBILITY';
  private readonly _callbacks: PartnerViewCallbacks;

  constructor(parent: Node, callbacks: PartnerViewCallbacks) {
    this._callbacks = callbacks;
    this._overlay = new Node('PartnerModal');
    this._overlay.setParent(parent);
    this._overlay.addComponent(UITransform).setContentSize(720, 1280);
    this._overlay.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      if (event.target === this._overlay) this._callbacks.onClose();
      event.propagationStopped = true;
    });

    this._panel = new Node('PartnerPanel');
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

    const title = makeLabel(this._panel, 0, PANEL_H / 2 - 48, 560, 48, 34, new Color(255, 220, 100), Label.HorizontalAlign.CENTER);
    title.string = '伙伴';
    title.isBold = true;

    this._body = new Node('PartnerBody');
    this._body.setParent(this._panel);
    this._body.setPosition(0, 20);
    this._body.addComponent(UITransform).setContentSize(600, 820);

    this._notice = makeLabel(this._panel, 0, -PANEL_H / 2 + 110, 560, 36, 18, new Color(200, 220, 240), Label.HorizontalAlign.CENTER);

    makeFlatButton(
      this._panel,
      '关闭',
      0,
      -PANEL_H / 2 + 48,
      220,
      56,
      () => this._callbacks.onClose(),
      new Color(105, 65, 45, 190),
      { noArt: true, border: new Color(255, 190, 120) },
    );
  }

  get node(): Node {
    return this._overlay;
  }

  destroy(): void {
    if (this._overlay.isValid) this._overlay.destroy();
  }

  showNotice(text: string): void {
    this._notice.string = text;
  }

  setProfile(profile: PveProfile): void {
    this._profile = profile;
    if (!profile.partners[this._selected]) {
      this._selected = profile.equippedPartnerId ?? 'MOBILITY';
    }
    this._render();
  }

  private _render(): void {
    this._body.removeAllChildren();
    if (!this._profile?.partners) return;
    const partners = this._profile.partners;
    const defs = listPartnerDefinitions();
    defs.forEach((def, index) => {
      const prog = partners[def.id];
      const equipped = this._profile!.equippedPartnerId === def.id;
      const selected = this._selected === def.id;
      const label = `${def.displayName} Lv${prog.level} 阶${prog.evolutionStage}${equipped ? ' ✓' : ''}`;
      makeFlatButton(
        this._body,
        label,
        -150,
        340 - index * 68,
        280,
        56,
        () => {
          this._selected = def.id;
          this._render();
        },
        selected ? new Color(80, 110, 40, 220) : new Color(24, 72, 118, 210),
        { noArt: true, border: BORDER },
      );
    });

    const sel = partners[this._selected];
    const def = defs.find((d) => d.id === this._selected)!;
    const skill = getStageSkillConfig(this._selected, sel.evolutionStage);
    const detail = makeLabel(this._body, 160, 120, 300, 480, 18, new Color(230, 240, 255), Label.HorizontalAlign.LEFT);
    detail.overflow = Label.Overflow.RESIZE_HEIGHT;
    detail.verticalAlign = Label.VerticalAlign.TOP;
    const nextStage = Math.min(4, (sel.evolutionStage + 1)) as 2 | 3 | 4;
    const needLv = PARTNER_EVOLVE_LEVEL[nextStage];
    const cost = PARTNER_EVOLVE_STARDUST[nextStage];
    detail.string = [
      def.displayName,
      `等级 ${sel.level}  经验 ${sel.exp}`,
      `阶段 ${sel.evolutionStage}/4`,
      '',
      skill.description,
      skill.nextStageHint ? `下一阶段：${skill.nextStageHint}` : '已达觉醒',
      '',
      sel.evolutionStage < 4 ? `进化：Lv≥${needLv} · 星尘 ${cost}` : '已达最高阶段',
      `当前星尘：${this._profile.gold}`,
    ].join('\n');

    makeFlatButton(
      this._body,
      '装备',
      160,
      -300,
      140,
      56,
      () => this._callbacks.onEquip(this._selected),
      new Color(40, 100, 60, 220),
      { noArt: true, border: BORDER },
    );
    const evolveOk = canEvolve(sel, this._profile.gold, this._selected).ok;
    makeFlatButton(
      this._body,
      '进化',
      160,
      -370,
      140,
      56,
      () => this._callbacks.onEvolve(this._selected),
      evolveOk ? new Color(140, 90, 30, 220) : new Color(60, 60, 70, 180),
      { noArt: true, border: BORDER },
    );
  }
}
