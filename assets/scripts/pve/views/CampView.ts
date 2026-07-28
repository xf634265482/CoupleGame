import { Button, Color, EventTouch, Graphics, Label, Mask, Node, ScrollView, UITransform } from 'cc';
import type { PveEquipmentInstance, PveProfile, PveProfessionId } from '../core/PveProgressionTypes';
import { getFixedEquipmentDefinition } from '../core/equipment/EquipmentDefinition';
import {
  ENHANCE_COST,
  SYNTH_STARDUST,
  countSynthesizeEligible,
  effectiveEquipPrimaryRange,
  nextEquipQuality,
  toFixedEquipItem,
} from '../core/equipment/EquipmentProgression';
import { formatMinghenCampDetail, formatMinghenLevelMark } from '../core/minghen/MinghenDisplay';
import { getMinghenDefinition } from '../core/minghen/MinghenCatalog';
import { spareCopiesForExchange } from '../core/minghen/MinghenAcquire';
import { canSynthesizeMinghenToII } from '../core/minghen/MinghenLoadout';
import { masteryProgressForXp } from '../core/professions/ProfessionMastery';
import { PROFESSION_DISPLAY_NAMES } from '../core/professions/ProfessionDisplayNames';
import { previewCampCombatStats } from '../core/CampCombatPreview';
import { ensureEquipmentAssetsForFloor } from '../EquipmentResourceLoader';
import { loadPveEquipSprite } from '../SpecialItemResourceLoader';
import { ensureArtChild } from '../../ui/UiSprite';
import { CAMP_MINGHEN_LAYOUT, minghenContentMetrics } from './CampMinghenLayout';
import { MINGHEN_LOADOUT_SLOTS } from '../core/PveConstants';
import { makeFlatButton, makeLabel } from './pveUiKit';

export type CampSection = 'MINGHEN' | 'EQUIPMENT' | 'INTEL' | 'PROFESSION';
export interface CampViewCallbacks {
  onClose(): void;
  onSelectProfession(id: PveProfessionId): void;
  onToggleMinghen(id: string): void;
  onTrackMinghen(id: string): void;
  onSavePreset(): void;
  onSynthesizeMinghen(id: string): void;
  onToggleEquipment(instanceId: string): void;
  onManageEquipment(action: 'TOGGLE_LOCK' | 'ENHANCE' | 'SELL', instanceId: string): void;
  onSynthesizeEquipment(primaryInstanceId: string): void;
  onSectionChanged?(section: CampSection): void;
}

const SECTION_LABELS: Record<CampSection, string> = { MINGHEN: '命痕台', EQUIPMENT: '装备台', INTEL: '远征情报', PROFESSION: '角色区' };

const PROFESSION_NAMES = PROFESSION_DISPLAY_NAMES;
const TECHNIQUE_NAMES: Record<string, string> = {
  ARMOR_BREAK: '破甲', KNOCKBACK: '击退', SWEEP: '横扫',
  PIERCING: '穿透', WEAK_POINT: '弱点', SUPPRESSING: '压制',
  SHADOW_END: '影终', WHIRLWIND: '旋风', VANISH_STEP: '隐步',
};
const QUALITY_NAMES: Record<PveEquipmentInstance['quality'], string> = { COMMON: '普通', FINE: '精良', RARE: '稀有', EPIC: '史诗', LEGENDARY: '传说' };
const SLOT_NAMES: Record<keyof PveProfile['equipmentLoadout'], string> = { WEAPON: '武器', HELMET: '头盔', ARMOR: '护甲', SHOES: '鞋子', TRINKET: '饰品' };
const SLOT_ORDER = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'] as const;
const TEXT = new Color(225, 238, 255);
const DIM = new Color(170, 205, 235);
const PANEL = new Color(7, 31, 70, 210);
const BORDER = new Color(255, 214, 110, 210);

export class CampView {
  private readonly _overlay: Node;
  private readonly _panel: Node;
  private readonly _title: Label;
  private readonly _body: Node;
  private _profile: PveProfile | null = null;
  private _section: CampSection = 'MINGHEN';
  private _detail: Node | null = null;
  private _equipmentIconRevision = 0;
  private _synthSlots: [string | null, string | null] = [null, null];

  constructor(parent: Node, private readonly _callbacks: CampViewCallbacks) {
    this._overlay = new Node('PersistentCampModal');
    this._overlay.setParent(parent);
    this._overlay.addComponent(UITransform).setContentSize(720, 1280);
    // 主面板已有边框，不再额外绘制整屏暗色蒙版；仅拦截触摸，避免点击穿透到大厅。
    this._overlay.on(Node.EventType.TOUCH_END, (event: EventTouch) => event.propagationStopped = true);

    this._panel = new Node('CampPanel');
    this._panel.setParent(this._overlay);
    this._panel.setPosition(0, 10);
    this._panel.addComponent(UITransform).setContentSize(660, 1040);
    const bg = this._panel.addComponent(Graphics);
    bg.fillColor = PANEL;
    bg.roundRect(-330, -520, 660, 1040, 22);
    bg.fill();
    bg.strokeColor = BORDER;
    bg.lineWidth = 2;
    bg.roundRect(-330, -520, 660, 1040, 22);
    bg.stroke();

    this._title = makeLabel(this._panel, 0, 450, 560, 60, 34, new Color(255, 220, 100), Label.HorizontalAlign.CENTER);
    this._title.isBold = true;
    (Object.keys(SECTION_LABELS) as CampSection[]).forEach((section, index) => {
      makeFlatButton(this._panel, SECTION_LABELS[section], -247.5 + index * 165, 370, 165, 58, () => this.showSection(section), new Color(24, 72, 118, 210), { noArt: true, border: BORDER });
    });
    this._body = new Node('CampBody');
    this._body.setParent(this._panel);
    this._body.setPosition(0, 18);
    this._body.addComponent(UITransform).setContentSize(570, 620);
    makeFlatButton(this._panel, '返回大厅', 0, -450, 240, 60, () => this._callbacks.onClose(), new Color(105, 65, 45, 190), { noArt: true, border: new Color(255, 190, 120) });
  }

  setProfile(profile: PveProfile): void { this._profile = profile; this.showSection(this._section); }
  showLoading(): void { this._renderMessage('正在整理营地档案…'); }
  showError(message: string): void { this._renderMessage(`营地加载失败\n\n${message}`); }
  /** 操作失败提示：不拆掉当前页，避免装配报错后整页变「加载失败」。 */
  showNotice(message: string): void {
    this.showResultPopup('操作失败', message);
  }

  /** 强化/出售等结果弹窗：居中告知成败，避免只靠列表数字变化。 */
  showResultPopup(title: string, message: string): void {
    this._detail?.destroy();
    const detail = new Node('CampResultModal');
    detail.setParent(this._overlay);
    detail.setSiblingIndex(9999);
    detail.addComponent(UITransform).setContentSize(720, 1280);
    detail.on(Node.EventType.TOUCH_END, () => detail.destroy());
    const panel = new Node('ResultPanel');
    panel.setParent(detail);
    panel.addComponent(UITransform).setContentSize(520, 360);
    panel.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; });
    const bg = panel.addComponent(Graphics);
    bg.fillColor = PANEL;
    bg.roundRect(-260, -180, 520, 360, 18);
    bg.fill();
    bg.strokeColor = BORDER;
    bg.lineWidth = 2;
    bg.roundRect(-259, -179, 518, 358, 17);
    bg.stroke();
    const titleLabel = makeLabel(panel, 0, 110, 460, 44, 28, new Color(255, 220, 100), Label.HorizontalAlign.CENTER);
    titleLabel.string = title;
    titleLabel.isBold = true;
    const bodyLabel = makeLabel(panel, 0, 10, 460, 160, 22, TEXT, Label.HorizontalAlign.CENTER);
    bodyLabel.verticalAlign = Label.VerticalAlign.CENTER;
    bodyLabel.overflow = Label.Overflow.SHRINK;
    bodyLabel.enableWrapText = true;
    bodyLabel.lineHeight = 34;
    bodyLabel.string = message;
    makeFlatButton(panel, '知道了', 0, -120, 200, 52, () => detail.destroy(), new Color(25, 75, 110, 190), { noArt: true, border: BORDER });
    this._detail = detail;
  }
  get node(): Node { return this._overlay; }
  destroy(): void { this._detail?.destroy(); this._overlay.destroy(); }

  clearMinghenSynthSlots(): void {
    this._synthSlots = [null, null];
  }

  showSection(section: CampSection): void {
    this._section = section;
    this._title.string = `营地 · ${SECTION_LABELS[section]}`;
    this._callbacks.onSectionChanged?.(section);
    this._clearBody();
    if (!this._profile) { this.showLoading(); return; }
    if (section === 'MINGHEN') this._renderMinghen(this._profile);
    else if (section === 'EQUIPMENT') this._renderEquipment(this._profile);
    else if (section === 'INTEL') this._renderIntel(this._profile);
    else this._renderProfession(this._profile);
  }

  private _renderMinghen(profile: PveProfile): void {
    const L = CAMP_MINGHEN_LAYOUT;
    const equipped = new Map(profile.minghenLoadout.map((entry) => [entry.id, entry]));
    const owned = Object.values(profile.minghenCollection).filter((entry) => !equipped.has(entry.id));
    const metrics = minghenContentMetrics(owned.length);

    const scrollNode = new Node('MinghenScroll');
    scrollNode.setParent(this._body);
    scrollNode.setPosition(0, 0);
    scrollNode.addComponent(UITransform).setContentSize(L.viewportWidth, L.viewportHeight);
    const scroll = scrollNode.addComponent(ScrollView);
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    const view = new Node('View');
    view.setParent(scrollNode);
    view.addComponent(UITransform).setContentSize(L.viewportWidth, L.viewportHeight);
    view.addComponent(Mask);
    const content = new Node('Content');
    content.setParent(view);
    content.addComponent(UITransform).setContentSize(L.viewportWidth, metrics.contentHeight);
    content.setPosition(0, (L.viewportHeight - metrics.contentHeight) / 2);
    scroll.content = content;

    const ownedCount = Object.keys(profile.minghenCollection).length;
    const summary = makeLabel(content, 0, L.summaryY, 540, 54, 22, TEXT, Label.HorizontalAlign.LEFT);
    summary.verticalAlign = Label.VerticalAlign.TOP;
    summary.string = `已收集 ${ownedCount}/56    已装配 ${profile.minghenLoadout.length}/${MINGHEN_LOADOUT_SLOTS}    方案 ${profile.minghenPresets.length}/5\n星尘：${profile.gold}`;

    const equippedTitle = makeLabel(content, 0, L.equippedTitleY, 540, 30, 21, new Color(255, 220, 100), Label.HorizontalAlign.LEFT);
    equippedTitle.isBold = true;
    equippedTitle.string = '已装配命痕';

    for (let index = 0; index < L.equippedSlots; index += 1) {
      const entry = profile.minghenLoadout[index];
      const text = entry
        ? `${getMinghenDefinition(entry.id).name} ${formatMinghenLevelMark(entry.level)}`
        : '空槽';
      this._gridCard(
        content,
        index,
        L.columns,
        L.cardWidth,
        L.cardHeight,
        L.firstRowY,
        text,
        () => { if (entry) this._showMinghenDetail(entry.id, entry.level, true); },
        !entry,
        undefined,
        undefined,
        36,
        L.equippedFontSize,
      );
    }

    const ownedTitle = makeLabel(content, 0, metrics.ownedTitleY, 540, 30, 21, new Color(255, 220, 100), Label.HorizontalAlign.LEFT);
    ownedTitle.isBold = true;
    ownedTitle.string = '拥有的命痕';

    owned.forEach((entry, index) => {
      const spare = spareCopiesForExchange(entry);
      const text = `${getMinghenDefinition(entry.id).name} ${formatMinghenLevelMark(entry.level)} ·×${entry.copies}${spare > 0 ? `(余${spare})` : ''}`;
      this._gridCard(
        content,
        index,
        L.ownedColumns,
        L.ownedCardWidth,
        L.ownedCardHeight,
        metrics.ownedFirstRowY,
        text,
        () => this._showMinghenDetail(entry.id, entry.level, false),
        false,
        undefined,
        undefined,
        36,
        L.ownedFontSize,
      );
    });

    this._renderMinghenSynth(content, profile, metrics);
  }

  private _renderMinghenSynth(
    parent: Node,
    profile: PveProfile,
    metrics: ReturnType<typeof minghenContentMetrics>,
  ): void {
    const L = CAMP_MINGHEN_LAYOUT;
    const title = makeLabel(parent, 0, metrics.synthTitleY, 540, 30, 21, new Color(255, 220, 100), Label.HorizontalAlign.CENTER);
    title.isBold = true;
    title.string = '命痕合成';

    const left = this._synthSlots[0];
    const right = this._synthSlots[1];
    const sameId = left && right && left === right ? left : null;
    const canSynth = sameId ? canSynthesizeMinghenToII(profile, sameId) : false;
    const resultText = canSynth && sameId
      ? `${getMinghenDefinition(sameId).name} II`
      : (left || right ? '需同名 I×2' : '结果');

    const lines = parent.addComponent(Graphics);
    lines.strokeColor = BORDER;
    lines.lineWidth = 2;
    const resultY = metrics.synthResultY;
    const inputY = metrics.synthInputY;
    lines.moveTo(-L.synthInputX, inputY);
    lines.lineTo(0, resultY);
    lines.stroke();
    lines.moveTo(L.synthInputX, inputY);
    lines.lineTo(0, resultY);
    lines.stroke();

    this._synthSlotCard(parent, 0, resultY, resultText, true, () => undefined);
    this._synthSlotCard(parent, -L.synthInputX, inputY, left ? `${getMinghenDefinition(left).name} I` : '材料1', false, () => {
      this._synthSlots[0] = null;
      this.showSection('MINGHEN');
    });
    this._synthSlotCard(parent, L.synthInputX, inputY, right ? `${getMinghenDefinition(right).name} I` : '材料2', false, () => {
      this._synthSlots[1] = null;
      this.showSection('MINGHEN');
    });

    const synthBtn = makeFlatButton(
      parent,
      '合成',
      0,
      metrics.synthButtonY,
      L.synthButtonWidth,
      L.synthButtonHeight,
      () => {
        if (!sameId || !canSynth) return;
        this._callbacks.onSynthesizeMinghen(sameId);
      },
      new Color(25, 75, 110, 190),
      { noArt: true, border: BORDER },
    );
    const btn = synthBtn.getComponent(Button);
    if (btn) btn.interactable = canSynth;
  }

  private _synthSlotCard(
    parent: Node,
    x: number,
    y: number,
    text: string,
    dashed: boolean,
    onClick: () => void,
  ): void {
    const L = CAMP_MINGHEN_LAYOUT;
    const card = makeFlatButton(
      parent,
      text,
      x,
      y,
      L.synthSlotWidth,
      L.synthSlotHeight,
      onClick,
      new Color(13, 47, 92, 210),
      { noArt: true, border: dashed ? new Color(255, 214, 110, 140) : BORDER },
    );
    const label = card.getChildByName('Label')?.getComponent(Label);
    if (label) {
      label.fontSize = 16;
      label.overflow = Label.Overflow.SHRINK;
      label.enableWrapText = false;
    }
  }

  private _stagedCopiesOf(id: string): number {
    return (this._synthSlots[0] === id ? 1 : 0) + (this._synthSlots[1] === id ? 1 : 0);
  }

  private _canPutMinghenIntoSynth(id: string): boolean {
    if (!this._profile) return false;
    const entry = this._profile.minghenCollection[id];
    if (!entry || entry.level !== 1) return false;
    if (this._profile.minghenLoadout.some((x) => x.id === id)) return false;
    if (this._synthSlots[0] && this._synthSlots[1]) return false;
    return entry.copies >= this._stagedCopiesOf(id) + 1;
  }

  private _putMinghenIntoSynth(id: string): void {
    if (!this._canPutMinghenIntoSynth(id)) {
      this.showNotice('无法投入：需要未装配的 I 级，且副本足够、合成槽未满');
      return;
    }
    if (!this._synthSlots[0]) this._synthSlots[0] = id;
    else if (!this._synthSlots[1]) this._synthSlots[1] = id;
    this.showSection('MINGHEN');
  }

  private _renderEquipment(profile: PveProfile): void {
    this._equipmentIconRevision += 1;
    const iconRevision = this._equipmentIconRevision;
    void ensureEquipmentAssetsForFloor(profile.highestUnlockedFloor);
    const summary = makeLabel(this._body, 0, 258, 540, 32, 20, TEXT, Label.HorizontalAlign.LEFT);
    summary.string = `永久背包 ${profile.equipmentInventory.length}/60    星尘：${profile.gold}`;
    this._sectionLabel('已穿戴装备', 218);
    const slotSize = 88;
    const slotGap = 18;
    const slotY = 105;
    const slotTotal = SLOT_ORDER.length * slotSize + (SLOT_ORDER.length - 1) * slotGap;
    SLOT_ORDER.forEach((slot, index) => {
      const instanceId = profile.equipmentLoadout[slot];
      const item = instanceId ? profile.equipmentInventory.find((entry) => entry.instanceId === instanceId) : undefined;
      const x = -slotTotal / 2 + slotSize / 2 + index * (slotSize + slotGap);
      this._equipSquareSlot(this._body, SLOT_NAMES[slot], x, slotY, slotSize, item, iconRevision, () => {
        if (item) this._showEquipmentDetail(item, true);
      });
    });
    this._sectionLabel('永久背包', 18);
    const equippedIds = new Set(Object.values(profile.equipmentLoadout).filter((id): id is string => !!id));
    const bagItems = profile.equipmentInventory.filter((item) => !equippedIds.has(item.instanceId));
    const bagSize = 96;
    const bagCols = 5;
    this._scrollGrid(0, -155, 540, 225, bagCols, bagSize, bagSize, bagItems.length, (index, parent, y) => {
      const item = bagItems[index];
      if (!item) return;
      this._bagIconCard(parent, index, bagCols, bagSize, y, item, iconRevision, () => {
        this._showEquipmentDetail(item, false);
      });
    });
  }

  private _renderIntel(profile: PveProfile): void {
    const floor = profile.highestUnlockedFloor;
    this._summary(`下一目标：第 ${floor} 层\n最高通关：第 ${profile.highestClearedFloor} 层`);
    const info = this._floorIntel(floor);
    const label = makeLabel(this._body, 0, 55, 540, 235, 24, TEXT, Label.HorizontalAlign.LEFT);
    label.verticalAlign = Label.VerticalAlign.TOP;
    label.overflow = Label.Overflow.SHRINK;
    label.string = `${info}\n\n通关后可继续远征，或返回大厅调整命痕、装备和职业。`;
  }

  private _renderProfession(profile: PveProfile): void {
    let y = 205;
    (Object.keys(PROFESSION_NAMES) as PveProfessionId[]).forEach((id) => {
      const mastery = profile.professions[id];
      const block = new Node(`Profession_${id}`);
      block.setParent(this._body);
      block.setPosition(0, y);
      block.addComponent(UITransform).setContentSize(540, 168);
      const gfx = block.addComponent(Graphics);
      gfx.fillColor = new Color(17, 58, 98, 170);
      gfx.roundRect(-270, -84, 540, 168, 12);
      gfx.fill();
      gfx.strokeColor = id === profile.selectedProfessionId ? new Color(255, 214, 110) : new Color(100, 175, 220);
      gfx.lineWidth = 2;
      gfx.roundRect(-269, -83, 538, 166, 11);
      gfx.stroke();
      const title = makeLabel(block, 0, 52, 490, 30, 23, TEXT, Label.HorizontalAlign.LEFT);
      title.isBold = true;
      title.string = mastery.unlocked ? `${id === profile.selectedProfessionId ? '当前职业 · ' : ''}${PROFESSION_NAMES[id]}    LV.${mastery.level}` : `${PROFESSION_NAMES[id]}    未解锁`;
      if (mastery.unlocked) {
        const progress = masteryProgressForXp(mastery.xp);
        this._progressBar(block, 0, 18, 480, 14, progress.ratio);
        const detail = makeLabel(block, 0, -10, 490, 26, 17, DIM, Label.HorizontalAlign.CENTER);
        detail.string = progress.next == null ? `经验：${mastery.xp}    已满级` : `经验：${mastery.xp} / ${progress.next}    还需 ${progress.remaining} 经验`;
        const stats = previewCampCombatStats(profile, id);
        const statsLabel = makeLabel(
          block,
          -50,
          -36,
          400,
          26,
          18,
          id === profile.selectedProfessionId ? new Color(255, 214, 110) : TEXT,
          Label.HorizontalAlign.LEFT,
        );
        statsLabel.string = `攻击 ${stats.attack} · 生命 ${stats.maxHp} · 护甲 ${stats.armor} · 射程 ${stats.range}`;
        const techniques = makeLabel(block, -50, -62, 400, 26, 18, TEXT, Label.HorizontalAlign.LEFT);
        techniques.string = `技法：${mastery.unlockedTechniqueIds.map((technique) => TECHNIQUE_NAMES[technique] ?? '未知技法').join('、') || '基础职业规则'}`;
      }
      const button = makeFlatButton(
        block,
        mastery.unlocked ? '切换' : '未解锁',
        212,
        -50,
        90,
        40,
        () => { if (mastery.unlocked) this._callbacks.onSelectProfession(id); },
        new Color(25, 75, 110, 190),
        { noArt: true, border: BORDER },
      );
      const component = button.getComponent(Button);
      if (component) component.interactable = mastery.unlocked;
      y -= 190;
    });
  }

  private _showMinghenDetail(id: string, level: 1 | 2 | 3, equipped: boolean): void {
    const tracking = this._profile?.tracking;
    const trackingText = tracking?.minghenId === id ? `追踪状态：${tracking.state === 'HUNT' ? '追踪中' : '可试炼'} · 第${tracking.floor}层` : '追踪状态：未追踪';
    const actions: Array<{ text: string; action: () => void; disabled?: boolean }> = [
      { text: equipped ? '卸下' : '装配', action: () => this._callbacks.onToggleMinghen(id) },
      { text: '追踪', action: () => this._callbacks.onTrackMinghen(id) },
    ];
    if (!equipped) {
      actions.push({
        text: '投入合成',
        disabled: !this._canPutMinghenIntoSynth(id),
        action: () => this._putMinghenIntoSynth(id),
      });
    }
    this._showDetail(`${getMinghenDefinition(id).name}详情`, `${formatMinghenCampDetail(id, level)}\n${trackingText}`, actions);
  }

  private _synthesizeAction(item: PveEquipmentInstance, equipped: boolean): {
    text: string;
    action: () => void;
    disabled?: boolean;
  } {
    const next = nextEquipQuality(item.quality);
    const eligible = this._profile
      ? countSynthesizeEligible(
        this._profile.equipmentInventory,
        this._profile.equipmentLoadout,
        item.definitionId,
        item.quality,
      )
      : 0;
    const cost = next ? (SYNTH_STARDUST[item.quality as keyof typeof SYNTH_STARDUST] ?? null) : null;
    const canSynth = !equipped && !item.locked && !!next && cost != null && eligible >= 3;
    let text = '合成';
    if (!next) text = '合成（满品）';
    else if (eligible < 3) text = `合成（还差${3 - eligible}件）`;
    else if (cost != null) text = `合成（${cost}星尘）`;
    return {
      text,
      action: () => this._callbacks.onSynthesizeEquipment(item.instanceId),
      disabled: !canSynth,
    };
  }

  private _showEquipmentDetail(item: PveEquipmentInstance, equipped: boolean): void {
    const body = this._equipmentDetailText(item, equipped);
    if (!equipped) {
      this._showDetail('装备详情', body, [
        { text: '装备', action: () => this._callbacks.onToggleEquipment(item.instanceId) },
        this._synthesizeAction(item, false),
        { text: item.locked ? '解锁' : '锁定', action: () => this._callbacks.onManageEquipment('TOGGLE_LOCK', item.instanceId) },
        { text: '出售', action: () => this._callbacks.onManageEquipment('SELL', item.instanceId), disabled: item.locked },
      ], item);
      return;
    }
    const nextLevel = item.enhanceLevel + 1;
    const enhanceCost = item.enhanceLevel >= 5 ? null : (ENHANCE_COST[nextLevel] ?? null);
    const enhanceLabel = enhanceCost == null ? '已满级' : `强化（${enhanceCost}星尘）`;
    // 合成材料须未穿戴：已装备详情不提供合成入口（去背包点同名副本）。
    this._showDetail('装备详情', body, [
      { text: '卸下', action: () => this._callbacks.onToggleEquipment(item.instanceId) },
      {
        text: enhanceLabel,
        action: () => this._callbacks.onManageEquipment('ENHANCE', item.instanceId),
        disabled: enhanceCost == null,
      },
      { text: item.locked ? '解锁' : '锁定', action: () => this._callbacks.onManageEquipment('TOGGLE_LOCK', item.instanceId) },
      { text: '出售', action: () => this._callbacks.onManageEquipment('SELL', item.instanceId), disabled: item.locked },
    ], item);
  }

  private _showDetail(
    title: string,
    body: string,
    actions: Array<{ text: string; action: () => void; disabled?: boolean }>,
    equipmentIcon?: PveEquipmentInstance,
  ): void {
    this._detail?.destroy();
    const detail = new Node('CampDetailModal');
    detail.setParent(this._overlay);
    detail.setSiblingIndex(9999);
    detail.addComponent(UITransform).setContentSize(720, 1280);
    detail.on(Node.EventType.TOUCH_END, () => detail.destroy());
    const panel = new Node('DetailPanel');
    panel.setParent(detail);
    panel.addComponent(UITransform).setContentSize(560, 640);
    panel.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; });
    const bg = panel.addComponent(Graphics);
    bg.fillColor = PANEL;
    bg.roundRect(-280, -320, 560, 640, 18);
    bg.fill();
    bg.strokeColor = BORDER;
    bg.lineWidth = 2;
    bg.roundRect(-279, -319, 558, 638, 17);
    bg.stroke();
    const titleLabel = makeLabel(panel, equipmentIcon ? 48 : 0, 270, equipmentIcon ? 420 : 500, 44, 28, new Color(255, 220, 100), Label.HorizontalAlign.CENTER);
    titleLabel.string = title;
    titleLabel.isBold = true;
    if (equipmentIcon) {
      const iconHost = new Node('DetailEquipIcon');
      iconHost.setParent(panel);
      iconHost.setPosition(-210, 268, 0);
      iconHost.addComponent(UITransform).setContentSize(88, 88);
      const revision = this._equipmentIconRevision;
      try {
        const equipItem = toFixedEquipItem(equipmentIcon);
        void loadPveEquipSprite(equipItem).then((frame) => {
          if (!frame || !iconHost.isValid || revision !== this._equipmentIconRevision) return;
          ensureArtChild(iconHost, 'EquipArt', frame, 84, 84);
        }).catch(() => null);
      } catch {
        // 未知 definitionId 时仅显示文字
      }
    }
    const bodyLabel = makeLabel(panel, 0, 40, 480, 280, 22, TEXT, Label.HorizontalAlign.LEFT);
    bodyLabel.verticalAlign = Label.VerticalAlign.TOP;
    bodyLabel.overflow = Label.Overflow.SHRINK;
    bodyLabel.enableWrapText = true;
    bodyLabel.lineHeight = 32;
    bodyLabel.string = body;
    actions.forEach((entry, index) => {
      const x = actions.length === 1 ? 0 : (index % 2 === 0 ? -135 : 135);
      const y = index < 2 ? -175 : -232;
      const button = makeFlatButton(panel, entry.text, x, y, 220, 48, () => { detail.destroy(); entry.action(); }, new Color(25, 75, 110, 190), { noArt: true, border: BORDER });
      const component = button.getComponent(Button);
      if (component) component.interactable = !entry.disabled;
    });
    makeFlatButton(panel, '关闭', 0, -290, 170, 40, () => detail.destroy(), new Color(88, 63, 52, 190), { noArt: true, border: new Color(255, 190, 120) });
    this._detail = detail;
  }

  private _summary(text: string): void { const label = makeLabel(this._body, 0, 245, 540, 54, 22, TEXT, Label.HorizontalAlign.LEFT); label.verticalAlign = Label.VerticalAlign.TOP; label.string = text; }
  private _sectionLabel(text: string, y: number): void { const label = makeLabel(this._body, 0, y, 540, 30, 21, new Color(255, 220, 100), Label.HorizontalAlign.LEFT); label.isBold = true; label.string = text; }
  private _renderMessage(text: string): void { this._clearBody(); const label = makeLabel(this._body, 0, 120, 540, 180, 24, TEXT, Label.HorizontalAlign.CENTER); label.verticalAlign = Label.VerticalAlign.TOP; label.overflow = Label.Overflow.SHRINK; label.string = text; }
  private _clearBody(): void { for (const child of [...this._body.children]) child.destroy(); }

  /** 标题在上、正方形槽；有装备时图标铺满，格内无文字。 */
  private _equipSquareSlot(
    parent: Node,
    title: string,
    x: number,
    y: number,
    size: number,
    item: PveEquipmentInstance | undefined,
    iconRevision: number,
    onClick: () => void,
  ): void {
    const titleLabel = makeLabel(parent, x, y + size / 2 + 18, size + 8, 28, 20, new Color(255, 220, 100), Label.HorizontalAlign.CENTER);
    titleLabel.isBold = true;
    titleLabel.string = title;

    const card = makeFlatButton(
      parent,
      '',
      x,
      y,
      size,
      size,
      onClick,
      item ? new Color(25, 75, 110, 205) : new Color(33, 53, 77, 150),
      { noArt: true, border: item ? BORDER : new Color(90, 125, 155) },
    );
    const button = card.getComponent(Button);
    if (button) button.interactable = !!item;
    const label = card.getChildByName('Label');
    if (label) label.active = false;
    if (item) this._attachEquipmentIcon(card, item, iconRevision, size - 10, true);
  }

  /** 永久背包：纯图标方格，无属性文字。 */
  private _bagIconCard(
    parent: Node,
    index: number,
    columns: number,
    size: number,
    rowBaseY: number,
    item: PveEquipmentInstance,
    iconRevision: number,
    onClick: () => void,
  ): void {
    const gap = 12;
    const total = columns * size + (columns - 1) * gap;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = -total / 2 + size / 2 + column * (size + gap);
    const y = rowBaseY - row * (size + gap);
    const card = makeFlatButton(
      parent,
      '',
      x,
      y,
      size,
      size,
      onClick,
      new Color(25, 75, 110, 205),
      { noArt: true, border: BORDER },
    );
    const label = card.getChildByName('Label');
    if (label) label.active = false;
    this._attachEquipmentIcon(card, item, iconRevision, size - 10, true);
  }

  private _gridCard(
    parent: Node,
    index: number,
    columns: number,
    width: number,
    height: number,
    rowBaseY: number,
    text: string,
    onClick: () => void,
    disabled = false,
    iconInstance?: PveEquipmentInstance,
    iconRevision?: number,
    iconSize = 36,
    fontSize?: number,
  ): void {
    const gap = 8;
    const total = columns * width + (columns - 1) * gap;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = -total / 2 + width / 2 + column * (width + gap);
    const y = rowBaseY - row * (height + gap);
    const card = makeFlatButton(parent, text, x, y, width, height, onClick, disabled ? new Color(33, 53, 77, 150) : new Color(25, 75, 110, 205), { noArt: true, border: disabled ? new Color(90, 125, 155) : BORDER });
    const button = card.getComponent(Button);
    if (button) button.interactable = !disabled;
    const label = card.getChildByName('Label')?.getComponent(Label);
    if (label) {
      if (fontSize != null) {
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 4;
      }
      label.overflow = Label.Overflow.SHRINK;
      label.enableWrapText = false;
    }
    if (iconInstance && iconRevision != null) {
      this._attachEquipmentIcon(card, iconInstance, iconRevision, iconSize);
      if (label) {
        label.fontSize = Math.min(17, Math.round(height * 0.26));
        label.lineHeight = label.fontSize + 2;
        label.enableWrapText = true;
        label.overflow = Label.Overflow.SHRINK;
        const labelTf = label.node.getComponent(UITransform);
        if (labelTf) {
          const pad = iconSize + 10;
          labelTf.setContentSize(Math.max(40, width - pad), height - 8);
          label.node.setPosition(pad / 2 - 2, -2, 0);
        }
      }
    }
  }

  private _attachEquipmentIcon(
    card: Node,
    instance: PveEquipmentInstance,
    revision: number,
    size: number,
    fillSquare = false,
  ): void {
    let equipItem;
    try {
      equipItem = toFixedEquipItem(instance);
    } catch {
      return;
    }
    const cardW = card.getComponent(UITransform)?.contentSize.width ?? size;
    const iconHost = new Node('EquipIcon');
    iconHost.setParent(card);
    iconHost.addComponent(UITransform).setContentSize(size, size);
    if (fillSquare) {
      iconHost.setPosition(0, 0, 0);
    } else {
      iconHost.setPosition(-cardW / 2 + size / 2 + 5, size / 2 - 6, 0);
    }
    void loadPveEquipSprite(equipItem).then((frame) => {
      if (!frame || !iconHost.isValid || revision !== this._equipmentIconRevision) return;
      ensureArtChild(iconHost, 'EquipArt', frame, size - (fillSquare ? 2 : 4), size - (fillSquare ? 2 : 4));
    }).catch(() => null);
  }

  private _scrollGrid(x: number, y: number, width: number, height: number, columns: number, cardWidth: number, cardHeight: number, itemCount: number, build: (index: number, parent: Node, rowBaseY: number) => void): void {
    const scrollNode = new Node('InventoryScroll');
    scrollNode.setParent(this._body);
    scrollNode.setPosition(x, y);
    scrollNode.addComponent(UITransform).setContentSize(width, height);
    const scroll = scrollNode.addComponent(ScrollView);
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    const view = new Node('View');
    view.setParent(scrollNode);
    view.addComponent(UITransform).setContentSize(width, height);
    view.addComponent(Mask);
    const rows = Math.max(1, Math.ceil(itemCount / columns));
    const contentHeight = Math.max(height, rows * (cardHeight + 10) + 16);
    const content = new Node('Content');
    content.setParent(view);
    content.addComponent(UITransform).setContentSize(width, contentHeight);
    content.setPosition(0, (height - contentHeight) / 2);
    scroll.content = content;
    for (let index = 0; index < itemCount; index += 1) build(index, content, contentHeight / 2 - cardHeight / 2 - 8);
  }

  private _progressBar(parent: Node, x: number, y: number, width: number, height: number, ratio: number): void {
    const bar = new Node('ExperienceProgress');
    bar.setParent(parent);
    bar.setPosition(x, y);
    bar.addComponent(UITransform).setContentSize(width, height);
    const bg = bar.addComponent(Graphics);
    bg.fillColor = new Color(19, 53, 86);
    bg.roundRect(-width / 2, -height / 2, width, height, height / 2);
    bg.fill();
    const fill = new Node('Fill');
    fill.setParent(bar);
    const fillWidth = Math.max(0, (width - 4) * ratio);
    fill.setPosition(-width / 2 + 2 + fillWidth / 2, 0);
    fill.addComponent(UITransform).setContentSize(fillWidth, height - 4);
    const fg = fill.addComponent(Graphics);
    fg.fillColor = new Color(58, 170, 175);
    fg.roundRect(-fillWidth / 2, -(height - 4) / 2, fillWidth, height - 4, (height - 4) / 2);
    fg.fill();
  }

  private _equipmentDetailText(item: PveEquipmentInstance, _equipped: boolean): string {
    const definition = getFixedEquipmentDefinition(item.definitionId);
    const equipItem = toFixedEquipItem(item);
    const { current, max } = effectiveEquipPrimaryRange(equipItem);
    const slot = equipItem.slot;
    const statLabel = slot === 'WEAPON' ? '攻击'
      : slot === 'ARMOR' ? '护甲'
        : slot === 'SHOES' ? '档位'
          : slot === 'TRINKET' ? '灵气'
            : '生命';
    const lines = [
      definition.name,
      `${SLOT_NAMES[slot]} · ${QUALITY_NAMES[item.quality]}`,
      `${statLabel} ${current}/${max}`,
    ];
    if (slot === 'WEAPON') {
      const minRange = definition.fixed.minRange ?? 1;
      const maxRange = definition.fixed.maxRange ?? minRange;
      lines.push(`攻击范围 ${minRange}-${maxRange}`);
    }
    lines.push(`强化等级 +${item.enhanceLevel}`);
    if (item.enhanceLevel < 5) {
      lines.push(`下次强化消耗 ${ENHANCE_COST[item.enhanceLevel + 1] ?? 0} 星尘`);
    } else {
      lines.push('已强化至上限');
    }
    return lines.join('\n');
  }

  /** 与 `Chapter1Objectives` / `chapter-1-content.md` 对齐；勿再用旧「传令兵 / 三波 / 突围支付 AP」文案。 */
  private _floorIntel(floor: number): string {
    const text = [
      '',
      '目标：取得钥匙\n完成条件：探索迷雾并取得钥匙；完成后钥匙位置出现传送门，互动即可通关。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：低消耗移动或远程探测装备；优先搜未揭示区。',
      '目标：击败双焰精英\n完成条件：找到并击败本层精英。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：先处理护卫，再集火精英。',
      '目标：摧毁号角祭坛\n完成条件：击败封锁通道的敌人，关闭祭坛，并清除剩余召唤物。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：尽快破封锁、关祭坛，减少增援。',
      '目标：截获哨兵军令\n完成条件：追上并击败携令逃跑的哥布林哨兵；若哨兵抵达逃离点则失败。\n失败条件：哨兵逃离，或角色生命降为零 / 中途撤离。\n推荐准备：击退、减速或高机动。',
      '目标：爆破碎石封锁\n完成条件：先激活火药桶，再抵达爆破点引爆。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：激活后敌人会狂暴并立刻冲锋攻击，预留爆发与走位。',
      '目标：守住五波夜袭\n完成条件：四角刷怪点整波召唤，刷出后立刻压向中场；清空五波后出现传送门。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：保留 AP 与范围攻击应对后几波。',
      '目标：击败哥布林酋长\n完成条件：利用掩体躲避重击，击败哥布林酋长。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：高生命、护甲与单体爆发，及时清理增援。',
      '目标：取得钥匙\n完成条件：探索迷雾并取得钥匙；注意沙坑会额外消耗移动 AP；完成后钥匙位置出现传送门，互动即可通关。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：移动减费或地形适应装备。',
      '目标：击败毒蝎精英\n完成条件：找到并击败本层精英。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：解毒/高护甲，优先处理护卫。',
      '目标：清除沙暴警戒者\n完成条件：消灭全部沙暴警戒者后开启传送门；清警戒者后围猎压力会下降。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：优先集火沙暴警戒者，再清理杂兵。',
      '目标：截获沙漠逃兵\n完成条件：追上携令逃跑的目标；若其抵达逃离点则失败。\n失败条件：目标逃离，或角色生命降为零 / 中途撤离。\n推荐准备：高机动、击退或截击。',
      '目标：沙暴走廊突围\n完成条件：在 12 个回合内抵达出口并互动通关。\n失败条件：超时、角色死亡或中途撤离。\n推荐准备：保留 AP 应对沙暴与沙坑，不必清怪。',
      '目标：守住流沙潮汐\n完成条件：清空 4 波敌人并存活；波次清空后出现传送门。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：范围攻击与走位，注意动态沙坑扩张。',
      '目标：击败流沙巨蝎\n完成条件：利用沙坑与走位击败流沙巨蝎 Boss。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：高生命、护甲与爆发，注意潜地与沙暴。',
      '目标：取得钥匙\n完成条件：穿越冰墙迷径取得钥匙；可绕路、拆墙或战斗突破；完成后钥匙位置出现传送门。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：破甲或单体输出，学会拆冰墙捷径。',
      '目标：霜猎悬赏\n完成条件：消灭任意 2 个强化悬赏目标（雪狼/豪猪/精灵/筑墙者原型强化版）后开启传送门。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：按职业与命痕选择最易处理的两名悬赏，不必清场。',
      '目标：冰隙追缉\n完成条件：追上并击败逃跑目标；若目标抵达逃离点则失败。\n失败条件：目标逃离，或角色生命降为零 / 中途撤离。\n推荐准备：利用冰面捷径或破墙截击，注意滑行打乱站位。',
      '目标：摧毁冰川阵核\n完成条件：摧毁中央冰川阵核；周围三座晶柱可选，关闭可降低压力。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：可强杀核心，也可先拆最碍事的晶柱。',
      '目标：霜域夺控\n完成条件：任意 2 个控制点各累计 5 回合占领进度；站在未完成点上会触发夺控狂暴。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：可分段占点，进度不清零；选择适合自己的两点即可。',
      '目标：守住冰潮围城\n完成条件：清空 4 波敌人并存活；第四波清空后中央出现传送门。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：综合应对冰墙、冰面、雪狼与精英控场。',
      '目标：击败冰霜巨人\n完成条件：击败冰霜巨人 Boss；利用冰墙与走位躲避重击与冲锋。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：高生命、破冰与走位，注意冻结与狂暴冲锋。',
      '目标：取得钥匙\n完成条件：穿越熔痕初境取得钥匙；熔岩格为移动成本而非即死；完成后钥匙位置出现传送门。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：移动减费或高生命，利用灰烬猎犬踏火特性。',
      '目标：熔脉封锁\n完成条件：相邻互动封印任意 3 个熔岩 vent；未封印 vents 每 3 回合喷发预警并伤害。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：优先封印离玩家最近的 vents，再清理灰烬猎犬与岩浆蟹。',
      '目标：冷核护运\n完成条件：玩家在 2 格内时护运核心会朝基地移动；抵达基地后开启传送门。\n失败条件：角色死亡、中途撤离或护运核心被摧毁。\n推荐准备：贴身护运，可走安全长路或熔岩短路。',
      '目标：灼域迁徙\n完成条件：在安全区内坚持 8 个玩家回合；安全区每 2 回合迁移。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：跟随安全区迁移，区外每回合受到环境伤害。',
      '目标：守住炎潮围猎\n完成条件：清空 4 波敌人并存活；第四波清空后中央出现传送门。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：综合应对灰烬猎犬、岩浆蟹、火焰元素与灵气炎魂。',
      '目标：逆潮突围\n完成条件：在熔岩潮汐自起点推进下抵达出口并互动；无回合上限失败。\n失败条件：角色死亡或中途撤离。\n推荐准备：关注潮汐预警，保留 AP 冲向出口。',
      '目标：击败熔岩领主\n完成条件：击败熔岩领主 Boss；Boss 机制与经典层一致。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：高生命、灼烧管理与走位，注意熔岩格。',
      '目标：取得钥匙\n完成条件：在命途岔路中选择路线取得钥匙；三条路线风险可预知。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：按职业选择守望 / 影袭 / 轮回路。',
      '目标：击败命轮兽\n完成条件：真正击杀命轮兽；首次死亡会回溯并恢复 50% 生命。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：保留爆发应对第二阶段。',
      '目标：三命择途\n完成条件：互动契印选择斩首 / 突围 / 固守之一并完成该挑战。\n失败条件：角色死亡、中途撤离；突围超时亦失败。\n推荐准备：按当前工具箱选择最适合的命运。',
      '目标：摧毁预言阵眼\n完成条件：摧毁全部 2 个预言阵眼；存活阵眼会周期发动 3×3 预言打击。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：读取预警后调整站位，优先拆眼。',
      '目标：击败命运镜像\n完成条件：击败复用命运守卫行为镜像逻辑的命运镜像。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：改变攻击与移动节奏，避免被镜像针对性复制。',
      '目标：改写命运生存\n完成条件：在周期性改写命运中存活 6 个玩家回合；每次删除 1 个坏结果。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：按当前局势舍弃最不能承受的事件。',
      '目标：击败命运守卫\n完成条件：击败命运守卫 Boss；预言 / 镜像 / 改写命运完整机制不变。\n失败条件：角色生命降为零或中途撤离。\n推荐准备：综合前三层教学，注意阶段切换。',
    ];
    return text[floor] ?? '后续章节情报尚未开放';
  }
}
