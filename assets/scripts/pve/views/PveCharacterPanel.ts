// 角色信息弹窗（design §3 / §8 / §10/§11 概览）：点击 HUD「角色」按钮弹出，展示
// 职业 / HP / 攻击力 / 装备 / 词条 / 职业碎片 / 成就 / 图鉴。
// 半透明遮罩 + 居中面板；点击遮罩或关闭按钮收起，期间冻结主场景输入由 Controller 负责。

import { Color, EventTouch, Graphics, Label, Mask, Node, ScrollView, UIOpacity, UITransform } from 'cc';
import { findAchievement } from '../core/AchievementSystem';
import { playerAttackPower } from '../core/CombatSystem';
import { SHOES_FIRST_MOVE_THRESHOLD, SHOES_REVEAL_BONUS_THRESHOLD, SHOES_STEALTH_THRESHOLD, shoesStealthReduction } from '../core/EquipmentSystem';
import { affixDescription } from '../core/AffixSystem';
import { AWAKEN_FORMS, BASE_ATTACK, CLASS_FRAGMENTS_TO_ADVANCE, CLASS_FRAGMENTS_TO_AWAKEN, INITIAL_HP } from '../core/PveConstants';
import { getBalancedApBase, getPlayerBalanceConfig } from '../core/PveBalance';
import { RELIC_DEFS } from '../core/RelicSystem';
import type { EquipItem, EquipSlot, ExpeditionState, PveMeta, RelicId } from '../core/PveTypes';
import { loadUiSprite } from '../../ui/UiAssets';
import { ensureArtChild } from '../../ui/UiSprite';
import { STRENGTHEN_LABEL } from './PveToastView';
import { makeLabel } from './pveUiKit';
import { Effects } from '../../fx/Effects';
import { PveDebug } from '../debug/PveDebug';

const TITLE_COLOR  = new Color(255, 226, 138, 255);
const TEXT_COLOR   = new Color(238, 244, 252, 255);
const DIM_COLOR    = new Color(180, 210, 236, 255);
// 与 PveHudView 的 PANEL / PANEL_BORDER 保持一致（玩家状态卡/战报卡同款半透明 α≈170）
const BG_COLOR     = new Color(7, 31, 70, 170);
const MASK_COLOR   = new Color(0, 8, 24, 185);
const BORDER_COLOR = new Color(84, 200, 239, 240);
const POPUP_BG     = new Color(7, 31, 70, 170);
// 关闭按钮：与 HUD「结束回合」同款（深蓝 + 金黄边），同步降为半透明
const CLOSE_BTN_FILL   = new Color(52, 73, 95, 170);
const CLOSE_BTN_BORDER = new Color(255, 214, 110, 240);

/** 装备品质的文字颜色（用于弹窗标题）。 */
const QUALITY_TEXT: Record<string, Color> = {
  COMMON:    new Color(180, 185, 200, 255),
  FINE:      new Color(100, 210, 100, 255),
  RARE:      new Color(100, 180, 255, 255),
  EPIC:      new Color(200, 120, 255, 255),
  LEGENDARY: new Color(255, 190,  60, 255),
};
/** 装备品质的边框颜色（用于弹窗边框）。 */
const QUALITY_BORDER: Record<string, Color> = {
  COMMON:    new Color(140, 145, 160, 255),
  FINE:      new Color( 80, 180,  80, 255),
  RARE:      new Color( 60, 140, 240, 255),
  EPIC:      new Color(160,  80, 240, 255),
  LEGENDARY: new Color(240, 150,  30, 255),
};

const PANEL_W = 640;
const PANEL_H = 920;
const PANEL_INSETS = { top: 48, bottom: 48, left: 48, right: 48 };
const TITLE_AREA_H = 64;
const BTN_AREA_H = 88;
const SV_W = PANEL_W - 56;
const SV_H = PANEL_H - TITLE_AREA_H - BTN_AREA_H;

const CLASS_LABEL: Record<string, string> = {
  ADVENTURER: '冒险者',
  BERSERKER:  '狂战士',
  ARCHER:     '射手',
  ROGUE:      '隐匿者',
};

const QUALITY_LABEL: Record<string, string> = {
  COMMON:    '普通',
  FINE:      '精良',
  RARE:      '稀有',
  EPIC:      '史诗',
  LEGENDARY: '传奇',
};

const SLOT_LABEL: Record<EquipSlot, string> = {
  WEAPON:  '武器',
  HELMET:  '头盔',
  ARMOR:   '护甲',
  SHOES:   '靴子',
  TRINKET: '饰品',
};
const SLOT_ORDER: EquipSlot[] = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'];

/** 角色信息弹窗 → 由 ExpeditionController 在「角色」按钮回调中 show()/hide()。 */
export class PveCharacterPanel {
  private _root: Node;
  private _panel!: Node;
  private _content!: Node;
  private _statsLabel:        Label;
  private _awakenIcon:        Node;
  /** 装备槽位行（可点击，点击弹出 _detailPopup）。 */
  private _equipRowLabels:    Label[]  = [];
  /** 对应每个槽位当前装备的快照，供点击时读取。 */
  private _currentItems:      (EquipItem | undefined)[] = [];
  private _detailPopup:       Node  | null = null;
  private _detailTitleLabel:  Label | null = null;
  private _detailBodyLabel:   Label | null = null;
  private _detailGfx:         Graphics | null = null;
  private _traitsLabel:       Label;
  private _fragmentsLabel:    Label;
  private _achievementsLabel: Label;
  private _codexLabel:        Label;
  private _currentRelics:     RelicId[] = [];
  private _relicPopup:        Node | null = null;
  private _relicPopupLabel:   Label | null = null;
  private _visible = false;

  constructor(parent: Node, screenW: number, screenH: number, onClose?: () => void) {
    this._root = new Node('PveCharacterPanel');
    this._root.setParent(parent);
    this._root.setSiblingIndex(9999); // 顶层
    this._root.active = false;

    // 全屏遮罩（吃掉点击 → 自动关闭）
    const mask = new Node('Mask');
    mask.setParent(this._root);
    mask.addComponent(UITransform).setContentSize(screenW, screenH);
    const mg = mask.addComponent(Graphics);
    mg.fillColor = MASK_COLOR;
    mg.rect(-screenW / 2, -screenH / 2, screenW, screenH);
    mg.fill();
    mask.on(Node.EventType.TOUCH_END, (_e: EventTouch) => {
      this.hide();
      onClose?.();
    });

    // 面板背景（圆角深蓝 + 青边框，与玩家状态卡/最近战报同款）
    const panel = new Node('Panel');
    this._panel = panel;
    panel.setParent(this._root);
    panel.setPosition(0, 0, 0);
    panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
    panel.on(Node.EventType.TOUCH_END, (e: EventTouch) => e.propagationStopped = true);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = BG_COLOR;
    pg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 18);
    pg.fill();
    pg.strokeColor = BORDER_COLOR;
    pg.lineWidth = 2;
    pg.roundRect(-PANEL_W / 2 + 1, -PANEL_H / 2 + 1, PANEL_W - 2, PANEL_H - 2, 17);
    pg.stroke();
    // 移除不透明的 panel_char_bg_9s 底图叠层，保持与玩家状态卡同款半透明 Graphics 风格。

    // 标题（顶部固定，不参与滚动）
    const titleLbl = makeLabel(
      panel, 0, PANEL_H / 2 - 36,
      PANEL_W - 40, 38, 28, TITLE_COLOR, Label.HorizontalAlign.CENTER,
    );
    titleLbl.string = '👤 角色信息';
    titleLbl.isBold = true;

    // ── ScrollView 中部 ──
    const svNode = new Node('ScrollArea');
    svNode.setParent(panel);
    // 中心 Y：标题占 TITLE_AREA_H 顶端，按钮占 BTN_AREA_H 底端，剩下垂直居中。
    svNode.setPosition(0, (TITLE_AREA_H - BTN_AREA_H) / -2, 0);
    svNode.addComponent(UITransform).setContentSize(SV_W, SV_H);
    const sv = svNode.addComponent(ScrollView);
    sv.horizontal = false;
    sv.vertical = true;
    sv.inertia = true;
    sv.brake = 0.75;
    (sv as ScrollView & { elasticScale?: number }).elasticScale = 0.1;

    const viewNode = new Node('View');
    viewNode.setParent(svNode);
    viewNode.addComponent(UITransform).setContentSize(SV_W, SV_H);
    viewNode.addComponent(Mask);

    // 各 section 的高度（顺序 = 渲染顺序，自上而下）
    // 行高、装备槽高都放宽，避免玩家点击误触相邻槽位。
    const SEC_GAP = 18;
    const statsH       = 260;             // 8 行 × 32 行高
    const equipBlockH  = 36 + 5 * 42;     // 标题 36 + 5 槽位 × 42
    const traitsH      = 108;             // 3 行 × 32 行高 + padding
    const fragmentsH   = 44;
    const achieveH     = 230;
    const codexH       = 64;
    const CONTENT_H = statsH + equipBlockH + traitsH + fragmentsH + achieveH + codexH + SEC_GAP * 5 + 28;

    const contentNode = new Node('Content');
    contentNode.setParent(viewNode);
    contentNode.addComponent(UITransform).setContentSize(SV_W - 12, CONTENT_H);
    contentNode.setPosition(0, (CONTENT_H - SV_H) / 2, 0); // top-anchor 起点
    sv.content = contentNode;
    this._content = contentNode;

    // 顺序排布各 section：cursorY 跟踪下一段顶部 Y（相对 content）
    let cursorY = CONTENT_H / 2; // content 顶
    const place = (h: number, color: Color): Label => {
      const lbl = this._makeSection(contentNode, cursorY, h, color);
      lbl.isBold = true;
      cursorY -= (h + SEC_GAP);
      return lbl;
    };

    const statsTop = cursorY;
    this._statsLabel = place(statsH, TEXT_COLOR);
    this._statsLabel.node.setPosition(-54, this._statsLabel.node.position.y, 0);
    this._statsLabel.node.getComponent(UITransform)?.setContentSize(SV_W - 132, statsH);
    this._awakenIcon = new Node('AwakenPortrait');
    this._awakenIcon.setParent(contentNode);
    this._awakenIcon.setPosition(SV_W / 2 - 74, statsTop - 70, 0);
    this._awakenIcon.addComponent(UITransform).setContentSize(104, 104);
    this._awakenIcon.active = false;

    // 装备（标题 + 5 行）单独构建
    this._buildEquipRows(contentNode, cursorY);
    cursorY -= (equipBlockH + SEC_GAP);

    this._traitsLabel    = place(traitsH, DIM_COLOR);
    // 遗物行可点击——轻触整个词条区域弹出遗物详情
    this._traitsLabel.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      if (this._currentRelics.length > 0) this._showRelicDetail();
    });
    this._fragmentsLabel = place(fragmentsH, DIM_COLOR);
    this._achievementsLabel = place(achieveH, new Color(255, 215, 100, 255));
    this._achievementsLabel.overflow = Label.Overflow.CLAMP;
    this._codexLabel     = place(codexH, DIM_COLOR);

    this._buildDetailPopup(panel);
    this._buildRelicPopup(panel);

    // 关闭按钮（底部固定）— 与 HUD「结束回合」同款 Graphics 圆角按钮，不加 sprite 叠层
    this._buildCloseButton(panel, () => { this.hide(); onClose?.(); });
  }

  private _buildCloseButton(panel: Node, onClick: () => void): void {
    const w = 220;
    const h = 60;
    const node = new Node('Btn_Close');
    node.setParent(panel);
    node.setPosition(0, -PANEL_H / 2 + BTN_AREA_H / 2, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = CLOSE_BTN_FILL;
    g.roundRect(-w / 2, -h / 2, w, h, 12);
    g.fill();
    g.strokeColor = CLOSE_BTN_BORDER;
    g.lineWidth = 2;
    g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 11);
    g.stroke();
    const lblNode = new Node('Label');
    lblNode.setParent(node);
    lblNode.addComponent(UITransform).setContentSize(w, h);
    const lbl = lblNode.addComponent(Label);
    lbl.string = '关闭';
    lbl.fontSize = 26;
    lbl.lineHeight = 30;
    lbl.isBold = true;
    lbl.color = new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      onClick();
    });
  }

  /** 构建装备标题行 + 5 个可点击槽位行；topY 为该区块顶部 Y（相对 parent）。 */
  private _buildEquipRows(parent: Node, topY: number): void {
    const ROW_W = SV_W - 24;
    const TITLE_H = 36;
    const ROW_H = 42;
    const ICON_SIZE = 32;

    // 标题行
    const titleLbl = makeLabel(parent, 0, topY - TITLE_H / 2, ROW_W, TITLE_H, 20, TEXT_COLOR, Label.HorizontalAlign.LEFT);
    titleLbl.string = '装备：（点击查看详情）';
    titleLbl.isBold = true;

    // 5 个槽位行
    this._equipRowLabels = [];
    this._currentItems   = new Array(SLOT_ORDER.length).fill(undefined);
    SLOT_ORDER.forEach((slot, i) => {
      const rowCenterY = topY - TITLE_H - ROW_H / 2 - i * ROW_H;
      const rowNode = new Node(`EquipRow_${slot}`);
      rowNode.setParent(parent);
      rowNode.setPosition(0, rowCenterY, 0);
      rowNode.addComponent(UITransform).setContentSize(ROW_W, ROW_H);

      const labelNode = new Node('Label');
      labelNode.setParent(rowNode);
      labelNode.addComponent(UITransform).setContentSize(ROW_W, ROW_H);
      const lbl = labelNode.addComponent(Label);
      lbl.fontSize = 20;
      lbl.lineHeight = 24;
      lbl.isBold = true;
      lbl.color    = DIM_COLOR;
      lbl.string   = `  ${SLOT_LABEL[slot]}：(空)`;
      lbl.horizontalAlign = Label.HorizontalAlign.LEFT;
      lbl.verticalAlign   = Label.VerticalAlign.CENTER;
      this._equipRowLabels.push(lbl);
      void loadUiSprite('pve/panel/slot_equip_empty').then((frame) => {
        if (!frame || !rowNode.isValid) return;
        const art = ensureArtChild(rowNode, 'SlotArt', frame, ICON_SIZE, ICON_SIZE);
        art.node.setPosition(-ROW_W / 2 + ICON_SIZE / 2 + 4, 0, 0);
        art.node.setSiblingIndex(0);
        labelNode.setPosition(ICON_SIZE / 2 + 10, 0, 0);
        labelNode.setSiblingIndex(1);
      });

      rowNode.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
        e.propagationStopped = true;
        const item = this._currentItems[i];
        if (item) this._showEquipDetail(item);
      });
    });
  }

  /** 构建装备详情浮层（默认隐藏，_showEquipDetail 时显示）。 */
  private _buildDetailPopup(panel: Node): void {
    const POP_W = 480;
    const POP_H = 240;

    const popup = new Node('EquipDetailPopup');
    popup.setParent(panel);
    popup.setPosition(0, -40, 0);
    popup.setSiblingIndex(9999);
    popup.addComponent(UITransform).setContentSize(POP_W, POP_H);
    popup.active = false;

    // 背景 + 边框（圆角，与主面板风格一致）
    const gfx = popup.addComponent(Graphics);
    gfx.fillColor = POPUP_BG;
    gfx.roundRect(-POP_W / 2, -POP_H / 2, POP_W, POP_H, 14);
    gfx.fill();
    gfx.strokeColor = BORDER_COLOR;
    gfx.lineWidth = 2;
    gfx.roundRect(-POP_W / 2 + 1, -POP_H / 2 + 1, POP_W - 2, POP_H - 2, 13);
    gfx.stroke();

    // 装备名标题
    const titleLbl = makeLabel(popup, 0, POP_H / 2 - 28, POP_W - 24, 32, 24, TEXT_COLOR, Label.HorizontalAlign.CENTER);
    titleLbl.isBold = true;

    // 属性正文
    const bodyLbl = makeLabel(popup, 0, POP_H / 2 - 80, POP_W - 36, 130, 19, TEXT_COLOR, Label.HorizontalAlign.LEFT);
    bodyLbl.verticalAlign = Label.VerticalAlign.TOP;
    bodyLbl.lineHeight = 26;
    bodyLbl.isBold = true;

    // 关闭按钮（HUD 风格）
    const closeBtnNode = new Node('Btn_DetailClose');
    closeBtnNode.setParent(popup);
    closeBtnNode.setPosition(0, -POP_H / 2 + 32, 0);
    closeBtnNode.addComponent(UITransform).setContentSize(140, 44);
    const cbg = closeBtnNode.addComponent(Graphics);
    cbg.fillColor = CLOSE_BTN_FILL;
    cbg.roundRect(-70, -22, 140, 44, 10);
    cbg.fill();
    cbg.strokeColor = CLOSE_BTN_BORDER;
    cbg.lineWidth = 2;
    cbg.roundRect(-69, -21, 138, 42, 9);
    cbg.stroke();
    const cbLbl = makeLabel(closeBtnNode, 0, 0, 140, 44, 20, new Color(255, 255, 255, 255), Label.HorizontalAlign.CENTER);
    cbLbl.string = '关闭';
    cbLbl.isBold = true;
    closeBtnNode.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      popup.active = false;
    });

    // 点击弹窗背景本身也关闭
    popup.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      popup.active = false;
    });

    this._detailPopup      = popup;
    this._detailTitleLabel = titleLbl;
    this._detailBodyLabel  = bodyLbl;
    this._detailGfx        = gfx;
  }

  /** 构建遗物详情浮层（默认隐藏，_showRelicDetail 时填充并显示）。 */
  private _buildRelicPopup(panel: Node): void {
    const POP_W = 480;
    const POP_H = 420;

    const popup = new Node('RelicDetailPopup');
    popup.setParent(panel);
    popup.setPosition(0, -20, 0);
    popup.setSiblingIndex(9999);
    popup.addComponent(UITransform).setContentSize(POP_W, POP_H);
    popup.active = false;

    const gfx = popup.addComponent(Graphics);
    gfx.fillColor = POPUP_BG;
    gfx.roundRect(-POP_W / 2, -POP_H / 2, POP_W, POP_H, 14);
    gfx.fill();
    gfx.strokeColor = new Color(200, 170, 255, 240); // 遗物专属紫边框
    gfx.lineWidth = 2;
    gfx.roundRect(-POP_W / 2 + 1, -POP_H / 2 + 1, POP_W - 2, POP_H - 2, 13);
    gfx.stroke();

    const titleLbl = makeLabel(popup, 0, POP_H / 2 - 28, POP_W - 24, 32, 22, new Color(220, 190, 255, 255), Label.HorizontalAlign.CENTER);
    titleLbl.isBold = true;
    titleLbl.string = '🏺 遗物详情';

    const bodyLbl = makeLabel(popup, 0, POP_H / 2 - 80, POP_W - 36, 290, 19, TEXT_COLOR, Label.HorizontalAlign.LEFT);
    bodyLbl.verticalAlign = Label.VerticalAlign.TOP;
    bodyLbl.lineHeight = 28;
    bodyLbl.isBold = true;
    bodyLbl.overflow = Label.Overflow.CLAMP;

    const closeBtnNode = new Node('Btn_RelicClose');
    closeBtnNode.setParent(popup);
    closeBtnNode.setPosition(0, -POP_H / 2 + 32, 0);
    closeBtnNode.addComponent(UITransform).setContentSize(140, 44);
    const cbg = closeBtnNode.addComponent(Graphics);
    cbg.fillColor = CLOSE_BTN_FILL;
    cbg.roundRect(-70, -22, 140, 44, 10);
    cbg.fill();
    cbg.strokeColor = CLOSE_BTN_BORDER;
    cbg.lineWidth = 2;
    cbg.roundRect(-69, -21, 138, 42, 9);
    cbg.stroke();
    const cbLbl = makeLabel(closeBtnNode, 0, 0, 140, 44, 20, new Color(255, 255, 255, 255), Label.HorizontalAlign.CENTER);
    cbLbl.string = '关闭';
    cbLbl.isBold = true;
    closeBtnNode.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      popup.active = false;
    });
    popup.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      popup.active = false;
    });

    this._relicPopup      = popup;
    this._relicPopupLabel = bodyLbl;
  }

  /** 显示当前所有遗物的详情浮层。 */
  private _showRelicDetail(): void {
    if (!this._relicPopup || !this._relicPopupLabel) return;
    const lines: string[] = [];
    this._currentRelics.forEach((id, idx) => {
      const def = RELIC_DEFS[id];
      if (!def) return;
      if (idx > 0) lines.push('');
      lines.push(`【${def.name}】`);
      lines.push(def.description);
    });
    this._relicPopupLabel.string = lines.join('\n');
    this._relicPopup.active = true;
  }

  /** 显示指定装备的详情浮层。 */
  private _showEquipDetail(item: EquipItem): void {
    if (!this._detailPopup || !this._detailTitleLabel || !this._detailBodyLabel || !this._detailGfx) return;

    const qualityStr  = QUALITY_LABEL[item.quality] ?? item.quality;
    const slotStr     = SLOT_LABEL[item.slot];
    const titleColor  = QUALITY_TEXT[item.quality] ?? TEXT_COLOR;
    const borderColor = QUALITY_BORDER[item.quality] ?? BORDER_COLOR;

    // 更新标题颜色与文字
    this._detailTitleLabel.color  = titleColor;
    this._detailTitleLabel.string = item.name;

    // 动态更新边框颜色（重绘，圆角）
    const POP_W = 480, POP_H = 240;
    const gfx = this._detailGfx;
    gfx.clear();
    gfx.fillColor = POPUP_BG;
    gfx.roundRect(-POP_W / 2, -POP_H / 2, POP_W, POP_H, 14);
    gfx.fill();
    gfx.strokeColor = borderColor;
    gfx.lineWidth = 2;
    gfx.roundRect(-POP_W / 2 + 1, -POP_H / 2 + 1, POP_W - 2, POP_H - 2, 13);
    gfx.stroke();

    // 正文内容
    const effectLine = this._slotEffectDesc(item.slot, item.baseStat, item.baseStatMax);
    const implicitLine = item.implicit
      ? `特性：${PveCharacterPanel._IMPLICIT_CN[item.implicit] ?? item.implicit}`
      : '';
    const affixLines = (item.affixes ?? []).map((aff) => affixDescription(aff));
    const traitLine  = item.trait
      ? `词条：${PveCharacterPanel._TRAIT_CN[item.trait] ?? '特殊词条'}`
      : (affixLines.length === 0 ? '词条：(未洗炼)' : '');

    this._detailBodyLabel.string = [
      `${slotStr} · ${qualityStr}`,
      `主属性：${effectLine}`,
      ...(implicitLine ? [implicitLine] : []),
      ...affixLines,
      ...(traitLine ? [traitLine] : []),
    ].join('\n');

    this._detailPopup.active = true;
  }

  /** 基础款优缺点中文映射（AC-EQ-3）。 */
  private static readonly _IMPLICIT_CN: Record<string, string> = {
    weapon_axe:    '高攻 / 攻击AP+1',
    weapon_spear:  '攻击范围+1 / 伤略低',
    armor_plate:   '高防 / 移动AP+1',
    helmet_heavy:  '高HP / 警戒范围+1',
    trinket_gold:  '金币获取加成',
  };

  /**
   * 装备词条完整中文映射（通用词条 + Boss 专属词条）。
   * 补充 BossEquipTraitEffects 里的 trait id，避免详情弹窗显示英文 id。
   */
  private static readonly _TRAIT_CN: Record<string, string> = {
    // 通用词条（与 EQUIP_TRAIT_LABEL 一致）
    equip_atk_up:  '攻击 +10',
    equip_def_up:  '防御 +10',
    equip_hp_up:   '最大HP +20',
    equip_crit_up: '暴击率 +5%',
    equip_gold_up: '拾取金币 +10%',
    equip_swift:   '移动AP -1',
    // Boss 专属词条（BossEquipTraitEffects.ts 命名规范）
    'on_hit_lifesteal_1': '命中吸血（回复HP）',
    'boss_stun_on_hurt':  '受击有概率眩晕攻击者',
    'boss_bleed_on_hit':  '命中附加流血',
    'boss_sand_immune':   '沙坑地形免疫',
    'boss_phys_reduce_15':'物理减伤 15%',
    'boss_slow_on_hit':   '命中减速（冰冻1回合）',
    'boss_active_ice':    '主动冰冻',
    'boss_ice_reduce_20': '站冰面时减伤 20%',
    'boss_burn_on_hit':   '命中附加灼烧',
    'boss_burn_immune':   '灼烧免疫',
    'boss_kill_heal_8':   '击杀回复 8 HP',
    'boss_crit_15':       '15% 概率暴击×2',
    'boss_revive_50':     '致死时复活（回50%HP，每场1次）',
  };

  /** 按槽位 + baseStat（+ 可选上限）生成主属性效果描述。 */
  private _slotEffectDesc(slot: EquipSlot, baseStat: number, baseStatMax?: number): string {
    const maxSuffix = baseStatMax !== undefined && baseStatMax !== baseStat ? `/${baseStatMax}` : '';
    switch (slot) {
      case 'WEAPON':  return `攻击力 +${baseStat}${maxSuffix}`;
      case 'HELMET':  return `最大HP +${baseStat}${maxSuffix}`;
      case 'ARMOR':   return `减伤 ${baseStat}${maxSuffix} 点`;
      case 'TRINKET': return `灵气 +${baseStat}${maxSuffix}%`;
      case 'SHOES': {
        const parts: string[] = [`档位 ${baseStat}${maxSuffix}`];
        if (baseStat >= SHOES_REVEAL_BONUS_THRESHOLD) parts.push('视野+1');
        if (baseStat >= SHOES_FIRST_MOVE_THRESHOLD)   parts.push('首步免费');
        if (baseStat >= SHOES_STEALTH_THRESHOLD)      parts.push(`潜行-${shoesStealthReduction(baseStat)}`);
        return parts.join(' · ');
      }
    }
  }

  private _makeSection(parent: Node, y: number, h: number, color: Color): Label {
    const lbl = makeLabel(
      parent, 0, y - h / 2,
      SV_W - 24, h, 21, color, Label.HorizontalAlign.LEFT,
    );
    lbl.verticalAlign = Label.VerticalAlign.TOP;
    lbl.lineHeight = 33;
    return lbl;
  }

  /** 用当前 ExpeditionState（+ 可选局外元进度）刷新所有字段（show 时调用）。 */
  update(state: ExpeditionState, meta?: PveMeta): void {
    const { player, floorState } = state;
    const awakenDef = player.awakenForm ? AWAKEN_FORMS[player.awakenForm] : undefined;
    const cls = awakenDef?.name ?? CLASS_LABEL[player.classId] ?? player.classId;
    const balanceConfig = getPlayerBalanceConfig(state.balanceSnapshot, state.chapter);
    const baseHp = balanceConfig.initialHp ?? INITIAL_HP;
    const baseAttack = balanceConfig.baseAttack ?? BASE_ATTACK;
    const apBase = getBalancedApBase(state.balanceSnapshot, state.chapter);
    const { damage, range } = playerAttackPower(player, state.balanceSnapshot, state.chapter);
    const threshold = player.animaThreshold ?? 100;

    // ── 基础属性 ──────────────────────────────────────────────
    const awakenLine = awakenDef ? `核心天赋：${awakenDef.coreName}` : null;
    this._awakenIcon.active = !!awakenDef;
    if (awakenDef) {
      void loadUiSprite(awakenDef.iconKey).then((frame) => {
        if (frame && this._awakenIcon.isValid) ensureArtChild(this._awakenIcon, 'Art', frame, 104, 104);
      }).catch(() => null);
    }

    // HP/攻击力/AP 数值组成：基础值 + 装备/词条/命运树等加成，方便玩家核对来源
    const hpBonus = player.maxHp - baseHp;
    const hpLine = hpBonus !== 0
      ? `HP：${player.hp} / ${player.maxHp}（${baseHp}+${hpBonus}）`
      : `HP：${player.hp} / ${player.maxHp}`;

    const attackBonus = damage - baseAttack;
    const attackLine = attackBonus !== 0
      ? `攻击力：⚔️ ${damage}（${baseAttack}+${attackBonus}，攻击范围 ${range}）`
      : `攻击力：⚔️ ${damage}（攻击范围 ${range}）`;

    // maxAp = 平衡配置 AP 基线 + 骰子 + 加成（强化/命运树/冰冻惩罚等），骰子之外的加成按差值反推
    const apBonus = floorState.maxAp - apBase - floorState.dice;
    const apLine = apBonus !== 0
      ? `当前回合 AP：${floorState.ap}/${floorState.maxAp}（${apBase}+🎲${floorState.dice}${apBonus > 0 ? '+' : ''}${apBonus}）`
      : `当前回合 AP：${floorState.ap}/${floorState.maxAp}（${apBase}+🎲${floorState.dice}）`;

    this._statsLabel.string = [
      `职业：${cls}`,
      ...(awakenLine ? [awakenLine] : []),
      hpLine,
      attackLine,
      `金币：${player.gold}    灵气：${player.anima}（进度 ${player.animaProgress}/${threshold}）`,
      apLine,
      `钥匙：${floorState.hasKey ? '✅ 已持有' : '⬜ 未拾取'}`,
    ].join('\n');

    // ── 装备行刷新 ────────────────────────────────────────────
    SLOT_ORDER.forEach((slot, i) => {
      const item = player.equipment[slot];
      this._currentItems[i] = item;
      const lbl = this._equipRowLabels[i];
      if (!lbl) return;
      if (!item) {
        lbl.color = DIM_COLOR;
        lbl.string = `  ${SLOT_LABEL[slot]}：(空)`;
      } else {
        lbl.color = QUALITY_TEXT[item.quality] ?? TEXT_COLOR;
        const traitMark = item.trait ? ' ★' : '';
        const enhanceSuffix = (item.enhanceLevel ?? 0) > 0 ? `+${item.enhanceLevel}` : '';
        lbl.string = `  ${SLOT_LABEL[slot]}：${item.name}${enhanceSuffix} +${item.baseStat}${traitMark}  ▸`;
      }
    });

    // ── 词条 + 遗物 + 卷轴 ────────────────────────────────────
    const traits = player.classTraits;
    const traitNames = traits.map((id) => STRENGTHEN_LABEL[id]?.title ?? id);
    const traitLine = `词条：${traitNames.length === 0 ? '(无)' : traitNames.join('、')}`;
    const awakenState: string[] = [];
    if (floorState.frenzyPending) awakenState.push(`杀意待发${(floorState.awakenSlayerIntentStacks ?? 0) > 0 ? `·${floorState.awakenSlayerIntentStacks}层` : ''}`);
    if ((floorState.awakenShadowCharges ?? 0) > 0) awakenState.push(`影袭×${floorState.awakenShadowCharges}`);
    if (floorState.awakenSniperGuaranteedCrit) awakenState.push('强弓必暴');
    const awakenStateLine = awakenState.length > 0 ? `觉醒状态：${awakenState.join('、')}` : '';
    const relics = player.relics ?? [];
    this._currentRelics = relics;
    const relicLine = relics.length > 0
      ? `🏺 遗物：${relics.map((r) => RELIC_DEFS[r]?.name ?? r).join('、')}  ▸点击查看`
      : '🏺 遗物：(无)';
    const scrolls = player.scrolls ?? 0;
    const scrollLine = scrolls > 0 ? `📜 命运卷轴：×${scrolls}` : '';
    this._traitsLabel.string = [traitLine, awakenStateLine, relicLine, ...(scrollLine ? [scrollLine] : [])].filter(Boolean).join('\n');

    // ── 职业碎片 ──────────────────────────────────────────────
    const fragEntries = Object.entries(player.classFragments)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([k, n]) => {
        if (k === player.classId) {
          return player.awakenForm
            ? `${CLASS_LABEL[k] ?? k} ${n}（已觉醒）`
            : `${CLASS_LABEL[k] ?? k} ${n}/${CLASS_FRAGMENTS_TO_AWAKEN}（觉醒）`;
        }
        return `${CLASS_LABEL[k] ?? k} ${n}/${CLASS_FRAGMENTS_TO_ADVANCE}`;
      });
    this._fragmentsLabel.string = `职业碎片：${fragEntries.length === 0 ? '(无)' : fragEntries.join('  ')}`;

    // ── 成就（AC-20）─────────────────────────────────────────
    if (meta) {
      // 防御性过滤：确保是纯字符串数组（兼容云端脏数据或序列化异常）
      const rawUnlocked = meta.achievements;
      const unlocked: string[] = Array.isArray(rawUnlocked)
        ? rawUnlocked.filter((a): a is string => typeof a === 'string')
        : [];

      if (unlocked.length === 0) {
        this._achievementsLabel.string = '🏆 成就：(暂无)';
      } else {
        const lines = [`🏆 成就（${unlocked.length}/8）：`];
        for (const id of unlocked) {
          const def = findAchievement(id);
          lines.push(`  ✅ ${def ? def.name : id}`);
        }
        this._achievementsLabel.string = lines.join('\n');
      }

      // ── 图鉴（AC-20）──────────────────────────────────────
      const monCount = meta.codex.monsters.length;
      const eqCount  = meta.codex.equipment.length;
      this._codexLabel.string =
        `📖 图鉴：` +
        `怪物 ${monCount} 种  装备 ${eqCount} 种  ` +
        `💎 命运碎片 ${meta.destinyShards}`;
    } else {
      this._achievementsLabel.string = '🏆 成就：(加载中…)';
      this._codexLabel.string        = '📖 图鉴：(加载中…)';
    }
  }

  show(state: ExpeditionState, meta?: PveMeta): void {
    this.update(state, meta);
    this._root.active = true;
    this._visible = true;
    void Effects.pop(this._panel);
  }

  hide(): void {
    // 收起前先对 panel 做一个 fade，再统一关闭 _root（避免下次 show 时 opacity 残留）。
    void Effects.fade(this._panel, 0, { duration: 0.15, onComplete: () => {
      this._root.active = false;
      this._visible = false;
      // 恢复到 255，下次 show + pop 的 fadeIn 才能从 0→255 显示。
      const op = this._panel.getComponent(UIOpacity);
      if (op) op.opacity = 255;
    } });
  }

  get visible(): boolean {
    return this._visible;
  }

  destroy(): void {
    PveDebug.mark('CharPanel.destroy.begin');
    try {
      if (this._root && this._root.isValid) this._root.destroy();
      else PveDebug.mark('CharPanel.destroy.rootInvalid');
      PveDebug.mark('CharPanel.destroy.end');
    } catch (err) {
      PveDebug.dump('CharPanel.destroy throw');
      throw err;
    }
  }
}
