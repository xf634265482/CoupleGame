import {
  Button,
  Color,
  EventTouch,
  Graphics,
  Label,
  Mask,
  Node,
  ScrollView,
  UITransform,
} from 'cc';
import { applyUiLayerTree, visibleDesignSize } from '../platform/wechat/ViewAdapt';
import { saveAgreement } from '../platform/PlayerAgreement';

// ── 协议文档占位内容 ─────────────────────────────────────────────────────────
// TODO: 上线前请将以下三段替换为正式法律文本，并更新 PlayerAgreement.ts 中的 AGREEMENT_VERSION

const DOCS: Record<string, { title: string; content: string }> = {
  user: {
    title: '用户协议',
    content: `【用户协议 · 占位文本，上线前请替换为正式内容】

欢迎来到《塔塔远征团》！使用本游戏即视为同意本协议全部条款。

一、服务说明
本游戏由 [开发商名称] 提供，适合 8 周岁及以上用户使用。
实际运营主体及联系方式：[待填写]

二、账号管理
游戏账号与微信账号绑定，不得转让或出售账号。
账号下的虚拟资产由用户自行保管，因账号泄露造成的损失由用户承担。

三、游戏规则
禁止使用外挂、脚本或任何作弊手段，违者将被封禁且不予退款。
禁止利用游戏漏洞获取不正当利益，发现漏洞请通过官方渠道上报。

四、虚拟物品
游戏内虚拟货币及道具不可兑换为现实货币，不支持退款。
虚拟物品的所有权归 [开发商名称] 所有，玩家享有使用权。

五、免责声明
因不可抗力、第三方平台原因导致的服务中断，[开发商名称]
不承担超出法律规定的责任。

六、协议变更
本协议如有更新，将通过游戏内公告通知，继续使用游戏视为接受新协议。

如有疑问请通过游戏内反馈联系我们。`,
  },
  privacy: {
    title: '隐私政策',
    content: `【隐私政策 · 占位文本，上线前请替换为正式内容】

《塔塔远征团》隐私政策
更新日期：2026-06-26

我们非常重视您的个人信息保护。请在使用前仔细阅读本政策。

一、信息收集
· 微信 openid（账号唯一标识，必要）
· 游戏数据（存档、积分、命运碎片等，必要）
· 昵称与头像（您主动授权后才收集，可拒绝）

我们不会在您未主动授权前收集您的昵称、头像、
手机号、位置、相册等隐私信息。

二、信息使用
仅用于提供游戏服务、排行榜功能及体验优化。
不会用于广告精准推送或出售给第三方。

三、信息存储
您的游戏数据存储于微信云开发平台，
受平台安全机制保护，存储地点位于中国境内。

四、第三方分享
除以下情况外，不向第三方共享您的信息：
· 法律法规要求
· 平台安全风控需要

五、您的权利
· 查看：可在游戏内查看个人资料
· 修改：可修改昵称
· 删除：可通过游戏内入口申请删除全部个人数据

隐私相关问题请联系：[联系方式 · 待填写]`,
  },
  minor: {
    title: '未成年人保护提示',
    content: `【未成年人保护提示 · 占位文本，上线前请替换为正式内容】

亲爱的家长 / 监护人：

感谢您选择《塔塔远征团》！为保护未成年人健康成长，
我们特别提示如下：

一、适龄提示
本游戏适合 8 周岁及以上用户游玩，
12 周岁以下未成年人建议在监护人陪同下使用。

二、防沉迷系统
本游戏已接入微信防沉迷实名认证系统：
· 未成年人每天可游戏时长受国家规定限制
· 法定节假日每日不超过 2 小时
· 其他时间每日不超过 1.5 小时
· 22:00 至次日 8:00 期间禁止游戏

三、消费引导
· 请妥善保管您的支付账号，防止未成年人未经授权消费
· 如发现未成年人误消费，请在 30 天内联系我们处理
  联系方式：[待填写]

四、内容安全
本游戏不含暴力、色情等不适宜内容，通过国家相关审批。

五、家长监护
建议家长定期查看孩子的游戏记录，引导建立健康游戏习惯。

祝小冒险家们探险愉快，平安归来！`,
  },
};
// ─────────────────────────────────────────────────────────────────────────────

export class AgreementScreen {
  static show(parent: Node): Promise<void> {
    return new Promise<void>((resolve) => {
      new AgreementScreen(parent, resolve)._build();
    });
  }

  private readonly _parent: Node;
  private readonly _resolve: () => void;
  private _root!: Node;
  private _checked = false;
  private _checkNode: Node | null = null;
  private _tipLabel: Label | null = null;

  private constructor(parent: Node, resolve: () => void) {
    this._parent = parent;
    this._resolve = resolve;
  }

  private _build(): void {
    const { w, h } = visibleDesignSize();
    const root = new Node('AgreementScreen');
    root.setParent(this._parent);
    root.addComponent(UITransform).setContentSize(w, h);
    this._root = root;

    // 全屏深蓝遮罩
    const bg = root.addComponent(Graphics);
    bg.fillColor = new Color(4, 12, 36, 218);
    bg.rect(-w / 2, -h / 2, w, h);
    bg.fill();

    // 装饰星点
    const stars: [number, number, number][] = [
      [-w / 2 + 32, h / 2 - 44, 2.4],
      [w / 2 - 48, h / 2 - 76, 1.8],
      [-w / 2 + 90, -h / 2 + 56, 2],
      [w / 2 - 28, -h / 2 + 96, 1.6],
      [-60, h / 2 - 18, 1.5],
      [80, -h / 2 + 32, 2.2],
    ];
    for (const [sx, sy, sr] of stars) {
      const s = new Node('Star');
      s.setParent(root);
      s.setPosition(sx, sy, 0);
      s.addComponent(UITransform).setContentSize(8, 8);
      const sg = s.addComponent(Graphics);
      sg.fillColor = new Color(255, 220, 130, 180);
      sg.circle(0, 0, sr);
      sg.fill();
    }

    const PANEL_W = Math.min(w - 40, 620);
    const PANEL_H = 580;
    const panel = new Node('Panel');
    panel.setParent(root);
    panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
    this._drawRoundedRect(panel, PANEL_W, PANEL_H, 28,
      new Color(12, 42, 86, 195),
      new Color(255, 205, 85, 240));
    panel.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    });

    const halfH = PANEL_H / 2;
    let y = halfH - 52;

    // 标题
    const title = this._makeLabel(panel, 'Title', y, 36, PANEL_W - 40, 48);
    title.string = '✦ 玩家须知 ✦';
    title.color = new Color(255, 220, 105, 255);
    title.isBold = true;
    y -= 62;

    // 简短说明（Q版口吻）
    const sub = this._makeLabel(panel, 'Sub', y, 19, PANEL_W - 60, 54);
    sub.string = '踏入命运高塔前，请先了解冒险者守则～\n签署协议之后，平安出发、满载而归！';
    sub.color = new Color(170, 215, 255, 210);
    sub.overflow = Label.Overflow.NONE;
    y -= 68;

    // 分隔线
    this._addDivider(panel, y + 6, PANEL_W - 60);
    y -= 18;

    // 三个协议链接（竖排）
    const linkDefs = [
      { key: 'user', label: '《用户协议》' },
      { key: 'privacy', label: '《隐私政策》' },
      { key: 'minor', label: '《未成年人保护提示》' },
    ] as const;
    for (const def of linkDefs) {
      const linkNode = new Node(`Link_${def.key}`);
      linkNode.setParent(panel);
      linkNode.setPosition(0, y - 18, 0);
      linkNode.addComponent(UITransform).setContentSize(PANEL_W - 60, 36);
      const lbl = linkNode.addComponent(Label);
      lbl.string = def.label;
      lbl.fontSize = 20;
      lbl.lineHeight = 28;
      lbl.color = new Color(100, 190, 255, 255);
      lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
      lbl.verticalAlign = Label.VerticalAlign.CENTER;
      lbl.overflow = Label.Overflow.SHRINK;
      const btn = linkNode.addComponent(Button);
      btn.transition = Button.Transition.SCALE;
      btn.zoomScale = 0.94;
      btn.target = linkNode;
      const docKey = def.key;
      linkNode.on(Button.EventType.CLICK, () => {
        const doc = DOCS[docKey];
        this._showDocModal(root, doc.title, doc.content, PANEL_W, PANEL_H);
      }, this);
      y -= 44;
    }

    y -= 4;
    // 分隔线
    this._addDivider(panel, y + 6, PANEL_W - 60);
    y -= 18;

    // 勾选框行
    const cbRow = new Node('CheckboxRow');
    cbRow.setParent(panel);
    cbRow.setPosition(0, y - 18, 0);
    cbRow.addComponent(UITransform).setContentSize(PANEL_W - 60, 44);
    const cbBtn = cbRow.addComponent(Button);
    cbBtn.transition = Button.Transition.SCALE;
    cbBtn.zoomScale = 0.98;
    cbBtn.target = cbRow;
    cbRow.on(Button.EventType.CLICK, () => this._toggleCheck(), this);

    const cbNode = new Node('Checkbox');
    cbNode.setParent(cbRow);
    cbNode.setPosition(-(PANEL_W - 100) / 2 + 14, 0, 0);
    cbNode.addComponent(UITransform).setContentSize(28, 28);
    const cbG = cbNode.addComponent(Graphics);
    this._checkNode = cbNode;
    this._renderCheckbox(cbG, false);

    const cbText = this._makeLabel(cbRow, 'CbText', 0, 19, PANEL_W - 120, 38);
    cbText.node.setPosition(20, 0, 0);
    cbText.string = '我已阅读并同意以上内容';
    cbText.color = new Color(220, 235, 255, 240);
    cbText.horizontalAlign = Label.HorizontalAlign.LEFT;
    y -= 52;

    // 提示文字（未勾选时点击按钮展示）
    const tip = this._makeLabel(panel, 'Tip', y, 17, PANEL_W - 60, 28);
    tip.string = '';
    tip.color = new Color(255, 160, 80, 255);
    this._tipLabel = tip;
    y -= 38;

    // 开始游戏按钮
    const btnH = 68;
    const btnNode = new Node('Btn_Start');
    btnNode.setParent(panel);
    btnNode.setPosition(0, y - btnH / 2, 0);
    btnNode.addComponent(UITransform).setContentSize(PANEL_W - 80, btnH);
    this._drawRoundedRect(btnNode, PANEL_W - 80, btnH, 20,
      new Color(24, 96, 192, 240),
      new Color(255, 210, 90, 255));
    // 顶部高光
    const highlight = new Node('Highlight');
    highlight.setParent(btnNode);
    highlight.setPosition(0, btnH / 2 - 6, 0);
    highlight.addComponent(UITransform).setContentSize(PANEL_W - 120, 6);
    this._drawRoundedRect(highlight, PANEL_W - 120, 6, 3, new Color(255, 255, 255, 30));
    const btnLbl = this._makeLabel(btnNode, 'Label', 0, 32, PANEL_W - 100, btnH - 8);
    btnLbl.string = '开始游戏 ✦';
    btnLbl.isBold = true;
    btnLbl.color = new Color(255, 248, 220, 255);
    const startBtn = btnNode.addComponent(Button);
    startBtn.transition = Button.Transition.SCALE;
    startBtn.zoomScale = 0.96;
    startBtn.target = btnNode;
    btnNode.on(Button.EventType.CLICK, () => this._onStartGame(), this);

    applyUiLayerTree(root, this._parent.layer);
  }

  private _toggleCheck(): void {
    this._checked = !this._checked;
    const g = this._checkNode?.getComponent(Graphics);
    if (g) this._renderCheckbox(g, this._checked);
    if (this._tipLabel && this._checked) this._tipLabel.string = '';
  }

  private _renderCheckbox(g: Graphics, checked: boolean): void {
    g.clear();
    if (checked) {
      g.fillColor = new Color(255, 205, 85, 255);
      g.roundRect(-12, -12, 24, 24, 5);
      g.fill();
      g.strokeColor = new Color(12, 42, 86, 255);
      g.lineWidth = 3;
      g.moveTo(-7, -1);
      g.lineTo(-2, -6);
      g.lineTo(8, 5);
      g.stroke();
    } else {
      g.strokeColor = new Color(255, 205, 85, 180);
      g.lineWidth = 2;
      g.roundRect(-12, -12, 24, 24, 5);
      g.stroke();
    }
  }

  private _onStartGame(): void {
    if (!this._checked) {
      if (this._tipLabel) this._tipLabel.string = '请先阅读并同意玩家须知';
      return;
    }
    saveAgreement();
    this._root.destroy();
    this._resolve();
  }

  private _showDocModal(
    parent: Node,
    docTitle: string,
    content: string,
    panelW: number,
    panelH: number,
  ): void {
    const overlay = new Node(`DocModal`);
    overlay.setParent(parent);
    overlay.addComponent(UITransform).setContentSize(panelW, panelH);
    this._drawRoundedRect(overlay, panelW, panelH, 28,
      new Color(8, 28, 68, 248),
      new Color(255, 205, 85, 240));
    overlay.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    });

    const titleLbl = this._makeLabel(overlay, 'Title', panelH / 2 - 50, 26, panelW - 40, 44);
    titleLbl.string = docTitle;
    titleLbl.color = new Color(255, 220, 105, 255);
    titleLbl.isBold = true;

    const SV_W = panelW - 40;
    const SV_H = panelH - 148;
    const svNode = new Node('Scroll');
    svNode.setParent(overlay);
    svNode.setPosition(0, -22, 0);
    svNode.addComponent(UITransform).setContentSize(SV_W, SV_H);
    const sv = svNode.addComponent(ScrollView);
    sv.horizontal = false;
    sv.vertical = true;
    sv.inertia = true;
    sv.brake = 0.75;

    const viewNode = new Node('View');
    viewNode.setParent(svNode);
    viewNode.addComponent(UITransform).setContentSize(SV_W, SV_H);
    viewNode.addComponent(Mask);

    const LINE_H = 28;
    const CONTENT_H = Math.max(SV_H, content.split('\n').length * LINE_H + 50);
    const contentNode = new Node('Content');
    contentNode.setParent(viewNode);
    contentNode.addComponent(UITransform).setContentSize(SV_W, CONTENT_H);
    contentNode.setPosition(0, (CONTENT_H - SV_H) / 2, 0);
    sv.content = contentNode;

    const textNode = new Node('Text');
    textNode.setParent(contentNode);
    textNode.setPosition(0, 0, 0);
    textNode.addComponent(UITransform).setContentSize(SV_W - 20, CONTENT_H);
    const lbl = textNode.addComponent(Label);
    lbl.string = content;
    lbl.fontSize = 18;
    lbl.lineHeight = LINE_H;
    lbl.color = new Color(200, 220, 250, 225);
    lbl.horizontalAlign = Label.HorizontalAlign.LEFT;
    lbl.verticalAlign = Label.VerticalAlign.TOP;
    lbl.overflow = Label.Overflow.NONE;
    lbl.enableWrapText = true;

    const closeNode = new Node('Btn_Back');
    closeNode.setParent(overlay);
    closeNode.setPosition(0, -panelH / 2 + 40, 0);
    closeNode.addComponent(UITransform).setContentSize(200, 56);
    this._drawRoundedRect(closeNode, 200, 56, 14,
      new Color(52, 73, 95, 170),
      new Color(255, 214, 110, 240));
    const closeLbl = this._makeLabel(closeNode, 'Label', 0, 26, 188, 48);
    closeLbl.string = '返回';
    closeLbl.isBold = true;
    const closeBtn = closeNode.addComponent(Button);
    closeBtn.transition = Button.Transition.SCALE;
    closeBtn.zoomScale = 0.96;
    closeBtn.target = closeNode;
    closeNode.on(Button.EventType.CLICK, () => overlay.destroy(), this);

    applyUiLayerTree(overlay, this._parent.layer);
  }

  private _makeLabel(
    parent: Node,
    name: string,
    y: number,
    fontSize: number,
    width: number,
    height: number,
  ): Label {
    const node = new Node(name);
    node.setParent(parent);
    node.setPosition(0, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    const lbl = node.addComponent(Label);
    lbl.fontSize = fontSize;
    lbl.lineHeight = fontSize + 7;
    lbl.color = new Color(245, 248, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;
    return lbl;
  }

  private _addDivider(parent: Node, y: number, width: number): void {
    const node = new Node('Divider');
    node.setParent(parent);
    node.setPosition(0, y, 0);
    node.addComponent(UITransform).setContentSize(width, 2);
    const g = node.addComponent(Graphics);
    g.strokeColor = new Color(255, 205, 85, 70);
    g.lineWidth = 1;
    g.moveTo(-width / 2, 0);
    g.lineTo(width / 2, 0);
    g.stroke();
  }

  private _drawRoundedRect(
    node: Node,
    width: number,
    height: number,
    radius: number,
    fill: Color,
    stroke?: Color,
  ): void {
    const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    g.clear();
    g.fillColor = fill;
    g.roundRect(-width / 2, -height / 2, width, height, radius);
    g.fill();
    if (stroke) {
      g.strokeColor = stroke;
      g.lineWidth = 2;
      g.roundRect(-width / 2, -height / 2, width, height, radius);
      g.stroke();
    }
  }
}
