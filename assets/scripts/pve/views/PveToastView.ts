// 远征提示视图（design §6/§9）：战斗/拾取/开箱/钥匙/通关等事件文字提示，以及满 100 灵气触发的 3 选 1 强化弹窗。
// M1 无美术资源：纯色面板 + Label，参考 CellEventToast 的「显示→定时/按钮关闭」模式。

import { Color, Graphics, Label, Node, UITransform } from 'cc';
import type { Equipment, EquipItem, EquipSlot } from '../core/PveTypes';
import { makeFlatButton, makeLabel } from './pveUiKit';

const TOAST_W = 520;
const TOAST_H = 64;
const PANEL_COLOR = new Color(26, 30, 42, 220);
const TEXT_COLOR = new Color(235, 238, 245, 255);

/** 所有灵气强化词条的显示标签（ADVENTURER 通用 + 三职业 15 词条，AC-16 M2）。供角色面板等外部读取。 */
export const STRENGTHEN_LABEL: Record<string, { title: string; desc: string }> = {
  // ── ADVENTURER 通用（M1）──
  strengthen_hp_up:     { title: '生命强化',  desc: '最大 HP +40' },
  strengthen_attack_up: { title: '力量强化',  desc: '攻击力 +5' },
  strengthen_ap_up:     { title: '敏捷强化',  desc: '下回合起 AP 上限 +1' },
  strengthen_gold_find: { title: '财富强化',  desc: '拾取金币 +20%' },
  // ── BERSERKER（AC-16 M2）──
  life_steal:           { title: '吸血',      desc: '每次攻击回复 10 HP' },
  berserk:              { title: '狂暴',      desc: 'HP ≤ 50% 时攻击 +10' },
  blood_rage:           { title: '血怒',      desc: '击杀时回复 20 HP' },
  undying:              { title: '不屈',      desc: '每层首次将死时保留 1 HP' },
  counter:              { title: '反击',      desc: '被攻击时对攻击者造成 10 伤害' },
  // ── ARCHER（AC-16 M2）──
  eagle_eye:            { title: '鹰眼',      desc: '攻击范围 +1' },
  marksman:             { title: '射手精通',  desc: '攻击力 +5' },
  multi_shot:           { title: '连射',      desc: '30% 概率对同一目标再射一箭' },
  pierce:               { title: '穿透',      desc: '攻击无视护甲减伤' },
  crit:                 { title: '暴击',      desc: '20% 概率造成三倍伤害' },
  // ── ROGUE（AC-16 M2）──
  swift:                { title: '疾步',      desc: '移动消耗 AP -1' },
  backstab:             { title: '背刺',      desc: '移动后首次攻击双倍伤害' },
  stealth:              { title: '潜行',      desc: '怪物仇恨范围对你缩小 2' },
  afterimage:           { title: '残影',      desc: '每层闪避首次受到的攻击' },
  assassin_heart:       { title: '刺客之心',  desc: '对非追击状态敌人 +20 伤害' },
  // ── 二阶觉醒专属词条（design §七）──
  awakened_cleave:      { title: '横扫',      desc: '攻击命中后，对相邻怪物造成50%溅射伤害' },
  awakened_frenzy:      { title: '狂热',      desc: '击杀后下一次攻击必定暴击并回复20点HP' },
  awakened_power_shot:  { title: '强弓',      desc: '基础伤害额外+15' },
  awakened_volley:      { title: '连珠',      desc: '连射概率提升至60%，并有30%概率连锁' },
  awakened_execute:     { title: '处决',      desc: '目标HP低于30%时直接处决，背刺伤害提升至3倍' },
  awakened_shadow_strike: { title: '影袭',    desc: '每回合可触发2次背刺伤害' },
};

function strengthenInfo(id: string): { title: string; desc: string } {
  return STRENGTHEN_LABEL[id] ?? { title: id, desc: '' };
}

/** 装备词条显示标签（铁匠洗炼结果展示用）。 */
export const EQUIP_TRAIT_LABEL: Record<string, string> = {
  equip_atk_up:  '攻击 +10',
  equip_def_up:  '防御 +10',
  equip_hp_up:   '最大 HP +20',
  equip_crit_up: '暴击率 +5%',
  equip_gold_up: '拾取金币 +10%',
  equip_swift:   '移动 AP -1',
};

/** 远征提示视图（战斗战报 toast + 灵气强化 3 选 1 弹窗） → P2 PveToastView */
export class PveToastView {
  private _root: Node;
  private _toastNode: Node | null = null;
  private _toastLabel: Label | null = null;
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;
  private _choiceNode: Node | null = null;

  constructor(parent: Node, private _screenW: number, private _screenH: number) {
    this._root = new Node('PveToastView');
    this._root.setParent(parent);
    this._root.setPosition(0, 0, 0);
    this._root.setSiblingIndex(9999);
  }

  /** 顶部居中文字提示，自动定时消失；连续提示会顶替前一条。 */
  toast(message: string, durationMs = 1600): void {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    if (!this._toastNode) {
      const n = new Node('Toast');
      n.setParent(this._root);
      n.setPosition(0, this._screenH / 2 - 96, 0);
      n.addComponent(UITransform).setContentSize(TOAST_W, TOAST_H);
      const g = n.addComponent(Graphics);
      g.fillColor = PANEL_COLOR;
      g.rect(-TOAST_W / 2, -TOAST_H / 2, TOAST_W, TOAST_H);
      g.fill();
      this._toastLabel = makeLabel(n, 0, 0, TOAST_W - 32, TOAST_H, 24, TEXT_COLOR, Label.HorizontalAlign.CENTER);
      this._toastNode = n;
    }
    this._toastNode.active = true;
    if (this._toastLabel) this._toastLabel.string = message;
    this._toastTimer = setTimeout(() => {
      if (this._toastNode) this._toastNode.active = false;
    }, durationMs);
  }

  /**
   * 灵气满 100 触发的 3 选 1 强化弹窗：阻塞式 —— 玩家必须选定一项后才会 resolve。
   * M1 强化池为占位数值词条（见 acceptance-checklist 已知问题表）。
   */
  showStrengthenChoice(choices: string[]): Promise<string> {
    return new Promise((resolve) => {
      this._closeChoice();

      const box = new Node('StrengthenChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      const boxW = 620;
      const boxH = 120 + choices.length * 84;
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = PANEL_COLOR;
      g.rect(-boxW / 2, -boxH / 2, boxW, boxH);
      g.fill();

      makeLabel(
        box, 0, boxH / 2 - 44, boxW - 60, 40, 28,
        new Color(255, 220, 120, 255), Label.HorizontalAlign.CENTER,
      ).string = '灵气满溢 · 选择一项强化';

      let y = boxH / 2 - 110;
      for (const choiceId of choices) {
        const info = strengthenInfo(choiceId);
        makeFlatButton(
          box, `${info.title}：${info.desc}`, 0, y, boxW - 80, 64,
          () => {
            this._closeChoice();
            resolve(choiceId);
          },
          new Color(70, 110, 160, 255),
        );
        y -= 84;
      }

      this._choiceNode = box;
    });
  }

  /**
   * 命运树「三选一」弹窗（E2 命运馈赠 / E3 命运护佑，阻塞式）：
   * 展示 title + 候选项文案列表，玩家选定后 resolve 所选下标。
   */
  showTreeChoice(title: string, options: string[]): Promise<number> {
    return new Promise((resolve) => {
      this._closeChoice();

      const box = new Node('TreeChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      const boxW = 620;
      const boxH = 120 + options.length * 84;
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = PANEL_COLOR;
      g.rect(-boxW / 2, -boxH / 2, boxW, boxH);
      g.fill();

      makeLabel(
        box, 0, boxH / 2 - 44, boxW - 60, 40, 28,
        new Color(255, 220, 120, 255), Label.HorizontalAlign.CENTER,
      ).string = title;

      let y = boxH / 2 - 110;
      options.forEach((label, index) => {
        makeFlatButton(
          box, label, 0, y, boxW - 80, 64,
          () => {
            this._closeChoice();
            resolve(index);
          },
          new Color(70, 110, 160, 255),
        );
        y -= 84;
      });

      this._choiceNode = box;
    });
  }

  /**
   * 通用确认弹窗（阻塞式）：玩家必须选其中一项后才会 resolve。
   * 用于通关后「继续远征 / 返回大厅」等二选场景。
   */
  showConfirm(title: string, options: { label: string; value: string }[]): Promise<string> {
    return new Promise((resolve) => {
      this._closeChoice();

      const box = new Node('ConfirmChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      const boxW = 540;
      const boxH = 100 + options.length * 76;
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = PANEL_COLOR;
      g.rect(-boxW / 2, -boxH / 2, boxW, boxH);
      g.fill();

      makeLabel(
        box, 0, boxH / 2 - 38, boxW - 40, 36, 26,
        new Color(235, 238, 245, 255), Label.HorizontalAlign.CENTER,
      ).string = title;

      let y = boxH / 2 - 90;
      for (const opt of options) {
        makeFlatButton(
          box, opt.label, 0, y, boxW - 80, 60,
          () => { this._closeChoice(); resolve(opt.value); },
          new Color(55, 90, 140, 255),
        );
        y -= 76;
      }

      this._choiceNode = box;
    });
  }

  /**
   * 职业进阶选择弹窗（阻塞式，AC-15 M2）。
   * available: 可进阶的职业 id 列表；玩家选定后 resolve 职业 id，点「稍后决定」resolve null。
   */
  showClassAdvanceChoice(available: string[]): Promise<string | null> {
    const CLASS_NAME: Record<string, string> = {
      BERSERKER: '⚔️ 狂战士（攻击 +15，即时损失约一半HP）',
      ARCHER: '🏹 射手（攻击 +5，射程 +2）',
      ROGUE: '🗡️ 隐匿者（攻击 +10，移动 +1）',
    };

    return new Promise((resolve) => {
      this._closeChoice();

      const box = new Node('ClassAdvanceChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      const boxW = 580;
      const boxH = 140 + available.length * 76;
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = PANEL_COLOR;
      g.rect(-boxW / 2, -boxH / 2, boxW, boxH);
      g.fill();

      makeLabel(
        box, 0, boxH / 2 - 40, boxW - 40, 40, 26,
        new Color(255, 220, 100, 255), Label.HorizontalAlign.CENTER,
      ).string = '职业碎片集齐！选择进阶职业';

      let y = boxH / 2 - 100;
      for (const classId of available) {
        const label = CLASS_NAME[classId] ?? classId;
        makeFlatButton(
          box, label, 0, y, boxW - 80, 64,
          () => { this._closeChoice(); resolve(classId); },
          new Color(70, 120, 80, 255),
        );
        y -= 76;
      }
      // 稍后决定
      makeFlatButton(
        box, '稍后决定', 0, y - 4, boxW - 80, 52,
        () => { this._closeChoice(); resolve(null); },
        new Color(60, 60, 80, 255),
      );

      this._choiceNode = box;
    });
  }

  /**
   * 二阶觉醒确认弹窗（阻塞式，design §七）。
   * className: 当前职业中文名（如"狂战士"）；玩家确认后 resolve true，点「稍后决定」resolve false。
   * 觉醒形态由 ClassSystem.applyClassAwaken 内部根据副职业碎片数判定，此处不剧透具体形态。
   */
  showClassAwakenChoice(className: string): Promise<boolean> {
    return new Promise((resolve) => {
      this._closeChoice();

      const box = new Node('ClassAwakenChoice');
      box.setParent(this._root);
      box.setPosition(0, 0, 0);
      const boxW = 580;
      const boxH = 220;
      box.addComponent(UITransform).setContentSize(boxW, boxH);
      const g = box.addComponent(Graphics);
      g.fillColor = PANEL_COLOR;
      g.rect(-boxW / 2, -boxH / 2, boxW, boxH);
      g.fill();

      makeLabel(
        box, 0, boxH / 2 - 40, boxW - 40, 40, 26,
        new Color(255, 220, 100, 255), Label.HorizontalAlign.CENTER,
      ).string = '🌟 二阶觉醒条件已满足！';

      makeLabel(
        box, 0, boxH / 2 - 84, boxW - 40, 60, 22,
        TEXT_COLOR, Label.HorizontalAlign.CENTER,
      ).string = `是否唤醒 [${className}] 体内蕴藏的更强力量？`;

      makeFlatButton(
        box, '立即觉醒', 0, -boxH / 2 + 70, boxW - 80, 64,
        () => { this._closeChoice(); resolve(true); },
        new Color(70, 120, 80, 255),
      );
      makeFlatButton(
        box, '稍后决定', 0, -boxH / 2 + 18, boxW - 80, 44,
        () => { this._closeChoice(); resolve(false); },
        new Color(60, 60, 80, 255),
      );

      this._choiceNode = box;
    });
  }

  /**
   * 营地全屏弹窗（阻塞式，AC-19）：章节 Boss 击败后触发。
   * - 显示当前玩家 HP / 金币
   * - 商店：每个商品可多次购买（购买成功后重建弹窗刷新状态）
   * - 装备整理：查看装备 + 变卖换金币（design §3.1）
   * - 「继续远征」或「返回大厅」才会 resolve
   *
   * @param chapter       - 刚通关的章节（用于标题）
   * @param initialPlayer - 进营地时的玩家状态（hp/maxHp/gold/equipment）
   * @param shopItems     - 商品列表，每项含 id/name/desc/cost
   * @param onBuy         - 购买回调：成功时返回更新后的 player，失败返回 null
   * @param onSellEquip   - 变卖装备回调：成功时返回更新后的 player，失败返回 null
   */
  showCamp(
    chapter: number,
    initialPlayer: { hp: number; maxHp: number; gold: number; equipment: Equipment },
    shopItems: ReadonlyArray<{ id: string; name: string; desc: string; cost: number }>,
    onBuy: (itemId: string) => { hp: number; maxHp: number; gold: number; equipment: Equipment } | null,
    onSellEquip: (slot: EquipSlot) => { hp: number; maxHp: number; gold: number; equipment: Equipment } | null,
  ): Promise<'continue' | 'quit'> {
    // 装备槽信息（供装备整理面板使用）
    const SLOT_ORDER: EquipSlot[] = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'];
    const SLOT_LABEL: Record<EquipSlot, string> = {
      WEAPON: '武器', HELMET: '头盔', ARMOR: '护甲', SHOES: '靴子', TRINKET: '饰品',
    };
    // 变卖价格（与 CampSystem.SELL_PRICE 同步，View 层仅用于显示）
    const EQUIP_SELL_PRICE: Record<string, number> = {
      COMMON: 10, FINE: 20, RARE: 40, EPIC: 80, LEGENDARY: 200,
    };
    // 品质中文标签
    const EQUIP_QUALITY_LABEL: Record<string, string> = {
      COMMON: '普通', FINE: '精良', RARE: '稀有', EPIC: '史诗', LEGENDARY: '传奇',
    };

    return new Promise((resolve) => {
      let currentPlayer = { ...initialPlayer };

      const BOX_W = 640;
      // 默认 2 项 → 520（含装备整理按钮行 +80），每多一项 +80
      const BOX_H = 520 + (shopItems.length - 2) * 80;

      // ── 装备整理面板（先声明以便 buildModal 引用）────────────
      let buildEquipPanel!: () => void;

      const buildModal = () => {
        this._closeChoice();
        const p = currentPlayer;

        const box = new Node('CampModal');
        box.setParent(this._root);
        box.setPosition(0, 0, 0);
        box.addComponent(UITransform).setContentSize(BOX_W, BOX_H);
        const bg = box.addComponent(Graphics);
        bg.fillColor = PANEL_COLOR;
        bg.rect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H);
        bg.fill();

        // ── 从顶部依次摆放 ──
        let curY = BOX_H / 2 - 20;

        // 标题
        curY -= 25;
        makeLabel(
          box, 0, curY, BOX_W - 40, 50, 28,
          new Color(255, 216, 80, 255), Label.HorizontalAlign.CENTER,
        ).string = `🏕️ 第${chapter}章通关 · 进入营地`;
        curY -= 25 + 12;

        // 玩家状态
        curY -= 18;
        makeLabel(
          box, 0, curY, BOX_W - 40, 36, 22,
          new Color(190, 230, 190, 255), Label.HorizontalAlign.CENTER,
        ).string = `❤️  HP ${p.hp} / ${p.maxHp}       💰  金币 ${p.gold}`;
        curY -= 18 + 14;

        // 商店标题
        curY -= 12;
        makeLabel(
          box, 0, curY, BOX_W - 60, 24, 18,
          new Color(140, 150, 170, 255), Label.HorizontalAlign.CENTER,
        ).string = '── 营地商店 ──';
        curY -= 12 + 16;

        // 商品按钮
        for (const item of shopItems) {
          const alreadyFull = item.id === 'HEAL_FULL' && p.hp >= p.maxHp;
          const canAfford = p.gold >= item.cost;
          const enabled = canAfford && !alreadyFull;

          curY -= 34;
          const label = `${item.name}  ${item.desc}   （${item.cost} 💰）`;
          if (enabled) {
            makeFlatButton(
              box, label, 0, curY, BOX_W - 80, 68,
              () => {
                const updated = onBuy(item.id);
                if (updated) { currentPlayer = { ...updated }; buildModal(); }
              },
              new Color(55, 110, 75, 255),
            );
          } else {
            const disabledLabel = alreadyFull
              ? `${item.name}  ${item.desc}   （已满血）`
              : `${item.name}  ${item.desc}   （${item.cost} 💰 · 金币不足）`;
            makeFlatButton(box, disabledLabel, 0, curY, BOX_W - 80, 68,
              () => { /* disabled */ }, new Color(55, 58, 68, 255));
          }
          curY -= 34 + 12;
        }

        // 装备整理按钮
        curY -= 16;
        curY -= 32;
        makeFlatButton(
          box, '⚒️ 装备整理（变卖装备换金币）', 0, curY, BOX_W - 80, 64,
          () => buildEquipPanel(),
          new Color(100, 80, 50, 255),
        );
        curY -= 32 + 12;

        // 底部：继续远征 + 返回大厅
        curY -= 16;
        curY -= 32;
        const btnW = Math.floor((BOX_W - 120) / 2);
        const leftX = -(btnW / 2 + 10);
        const rightX = btnW / 2 + 10;
        makeFlatButton(box, '继续远征 →', leftX, curY, btnW, 64,
          () => { this._closeChoice(); resolve('continue'); }, new Color(50, 90, 160, 255));
        makeFlatButton(box, '返回大厅', rightX, curY, btnW, 64,
          () => { this._closeChoice(); resolve('quit'); }, new Color(90, 55, 55, 255));

        this._choiceNode = box;
      };

      buildEquipPanel = () => {
        this._closeChoice();
        const p = currentPlayer;
        const EQ_W = 620;
        const EQ_H = 100 + SLOT_ORDER.length * 76 + 76; // title + 5 slots + back btn
        const equip = new Node('EquipPanel');
        equip.setParent(this._root);
        equip.setPosition(0, 0, 0);
        equip.addComponent(UITransform).setContentSize(EQ_W, EQ_H);
        const ebg = equip.addComponent(Graphics);
        ebg.fillColor = PANEL_COLOR;
        ebg.rect(-EQ_W / 2, -EQ_H / 2, EQ_W, EQ_H);
        ebg.fill();

        let curY = EQ_H / 2 - 40;
        makeLabel(equip, 0, curY, EQ_W - 40, 50, 24,
          new Color(255, 216, 80, 255), Label.HorizontalAlign.CENTER,
        ).string = '⚒️ 装备整理（变卖装备获得金币）';
        curY -= 70;

        for (const slot of SLOT_ORDER) {
          const item = p.equipment[slot];
          curY -= 28;
          if (item) {
            const sellGold = EQUIP_SELL_PRICE[item.quality] ?? 10;
            makeFlatButton(
              equip,
              `${SLOT_LABEL[slot]}：${item.name}（${EQUIP_QUALITY_LABEL[item.quality] ?? item.quality}）  💰 变卖 +${sellGold}`,
              0, curY, EQ_W - 80, 56,
              () => {
                const updated = onSellEquip(slot);
                if (updated) { currentPlayer = { ...updated }; buildEquipPanel(); }
              },
              new Color(100, 75, 45, 255),
            );
          } else {
            makeFlatButton(equip, `${SLOT_LABEL[slot]}：（空）`, 0, curY, EQ_W - 80, 56,
              () => {}, new Color(40, 45, 55, 255));
          }
          curY -= 28 + 12;
        }

        // 返回营地
        curY -= 12;
        curY -= 28;
        makeFlatButton(equip, '← 返回营地', 0, curY, EQ_W - 80, 56,
          () => buildModal(), new Color(55, 90, 140, 255));

        this._choiceNode = equip;
      };

      buildModal();
    });
  }

  /**
   * 铁匠弹窗（阻塞式）：显示当前装备，提供强化（+1 基础属性）与洗炼（重置词条）按钮。
   * 点「离开铁匠」后 resolve。回调返回 null 表示操作失败（金币不足等）。
   *
   * @param initialPlayer - 玩家当前状态（gold + equipment）
   * @param onUpgrade     - 强化回调：成功返回更新后的 player，失败返回 null
   * @param onReroll      - 洗炼回调：成功返回更新后的 player，失败返回 null
   */
  showBlacksmith(
    initialPlayer: { gold: number; equipment: Equipment },
    onUpgrade: (slot: EquipSlot) => { gold: number; equipment: Equipment } | null,
    onReroll: (slot: EquipSlot) => { gold: number; equipment: Equipment } | null,
  ): Promise<void> {
    const SLOT_ORDER: EquipSlot[] = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'];
    const SLOT_LABEL: Record<EquipSlot, string> = {
      WEAPON: '武器', HELMET: '头盔', ARMOR: '护甲', SHOES: '靴子', TRINKET: '饰品',
    };
    // 强化按钮文案：明确标出本次强化提升的具体属性与数值变化，避免玩家不知道"+1"加在哪里
    const SLOT_ATTR_LABEL: Record<EquipSlot, string> = {
      WEAPON: '攻击力', HELMET: '最大HP', ARMOR: '减伤', SHOES: '靴子等级', TRINKET: '灵气加成',
    };
    const upgradeStepFor = (slot: EquipSlot): number => (slot === 'SHOES' || slot === 'TRINKET' ? 1 : 10);

    return new Promise((resolve) => {
      let currentPlayer = { ...initialPlayer };

      const buildPanel = () => {
        this._closeChoice();
        const p = currentPlayer;

        const equippedSlots = SLOT_ORDER.filter((s) => !!p.equipment[s]);
        const BOX_W = 660;
        const BOX_H = 140 + equippedSlots.length * 96 + 70 + (equippedSlots.length === 0 ? 40 : 0);

        const box = new Node('BlacksmithPanel');
        box.setParent(this._root);
        box.setPosition(0, 0, 0);
        box.addComponent(UITransform).setContentSize(BOX_W, BOX_H);
        const bg = box.addComponent(Graphics);
        bg.fillColor = PANEL_COLOR;
        bg.rect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H);
        bg.fill();

        let curY = BOX_H / 2 - 20;

        // 标题
        curY -= 26;
        makeLabel(
          box, 0, curY, BOX_W - 40, 52, 28,
          new Color(255, 195, 90, 255), Label.HorizontalAlign.CENTER,
        ).string = '⚒️ 铁匠铺';
        curY -= 26 + 12;

        // 金币
        curY -= 14;
        makeLabel(
          box, 0, curY, BOX_W - 60, 28, 20,
          new Color(245, 215, 110, 255), Label.HorizontalAlign.CENTER,
        ).string = `💰 当前金币：${p.gold}`;
        curY -= 14 + 16;

        // 每个已装备槽位
        if (equippedSlots.length === 0) {
          makeLabel(
            box, 0, curY - 20, BOX_W - 60, 36, 20,
            new Color(140, 150, 170, 255), Label.HorizontalAlign.CENTER,
          ).string = '（无已装备物品）';
          makeLabel(
            box, 0, curY - 56, BOX_W - 60, 36, 18,
            new Color(150, 160, 180, 255), Label.HorizontalAlign.CENTER,
          ).string = '先去打怪 / 开宝箱获取装备后，再来强化吧';
        }

        for (const slot of equippedSlots) {
          const item = p.equipment[slot] as EquipItem;
          // 词条：仅紫色(EPIC)/传说(LEGENDARY)品质有词条槽，低品质不显示词条
          const hasTraitSlot = item.quality === 'EPIC' || item.quality === 'LEGENDARY';
          const traitText = hasTraitSlot
            ? (item.trait ? `[${EQUIP_TRAIT_LABEL[item.trait] ?? item.trait}]` : '[未洗炼]')
            : '[低品质无词条]';

          // 装备名称行
          curY -= 12;
          makeLabel(
            box, 0, curY, BOX_W - 60, 24, 18,
            new Color(210, 220, 240, 255), Label.HorizontalAlign.CENTER,
          ).string = `${SLOT_LABEL[slot]}：${item.name}（基础 ${item.baseStat}）${traitText}`;
          curY -= 12 + 8;

          // 强化 / 洗炼按钮（并排）
          curY -= 30;
          const btnW = Math.floor((BOX_W - 120) / 2);
          const canUpgrade = p.gold >= 20;
          const canReroll = hasTraitSlot && p.gold >= 30;

          const step = upgradeStepFor(slot);
          const upgradeLabel = `强化${SLOT_ATTR_LABEL[slot]} ${item.baseStat}→${item.baseStat + step}`;
          if (canUpgrade) {
            makeFlatButton(
              box, `${upgradeLabel}（20💰）`, -(btnW / 2 + 8), curY, btnW, 60,
              () => {
                const updated = onUpgrade(slot);
                if (updated) { currentPlayer = { ...updated }; buildPanel(); }
              },
              new Color(50, 100, 60, 255),
            );
          } else {
            makeFlatButton(box, `${upgradeLabel}（20💰 不足）`, -(btnW / 2 + 8), curY, btnW, 60,
              () => {}, new Color(40, 50, 40, 255));
          }

          if (!hasTraitSlot) {
            // 低品质：灰色禁用按钮，提示无词条槽
            makeFlatButton(box, `品质过低·无词条`, btnW / 2 + 8, curY, btnW, 60,
              () => {}, new Color(45, 45, 45, 255));
          } else if (canReroll) {
            makeFlatButton(
              box, `洗炼词条（30💰）`, btnW / 2 + 8, curY, btnW, 60,
              () => {
                const updated = onReroll(slot);
                if (updated) { currentPlayer = { ...updated }; buildPanel(); }
              },
              new Color(80, 50, 120, 255),
            );
          } else {
            makeFlatButton(box, `洗炼词条（30💰 不足）`, btnW / 2 + 8, curY, btnW, 60,
              () => {}, new Color(40, 40, 55, 255));
          }

          curY -= 30 + 8;
        }

        // 离开按钮
        curY -= 16;
        curY -= 26;
        makeFlatButton(
          box, '← 离开铁匠', 0, curY, BOX_W - 80, 52,
          () => { this._closeChoice(); resolve(); },
          new Color(55, 90, 140, 255),
        );

        this._choiceNode = box;
      };

      buildPanel();
    });
  }

  private _closeChoice(): void {
    if (this._choiceNode) {
      this._choiceNode.destroy();
      this._choiceNode = null;
    }
  }

  destroy(): void {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._root.destroy();
  }
}
