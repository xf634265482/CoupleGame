// 远征 HUD（design §2/§4）：显示 章节-层数/AP/HP/金币/灵气，提供方向移动 + 攻击/交互/结束回合操作入口。
// 代码建 UI（无 prefab），参考 HudController 的回调对象模式；M1 无美术资源，纯 Graphics + Label。

import { Color, Label, Node } from 'cc';
import { playerAttackPower } from '../core/CombatSystem';
import type { Direction } from '../core/MovementSystem';
import { AP_BASE } from '../core/PveConstants';
import type { ExpeditionState } from '../core/PveTypes';
import { makeFlatButton, makeLabel } from './pveUiKit';

export type PveHudCallbacks = {
  onMove: (dir: Direction) => void;
  onAttack: () => void;
  onInteract: () => void;
  onEndTurn: () => void;
  onQuit?: () => void;
  onShowCharacter?: () => void;
};

const INFO_COLOR = new Color(225, 230, 240, 255);
const HP_COLOR = new Color(235, 110, 100, 255);
const AP_COLOR = new Color(120, 200, 255, 255);
const GOLD_COLOR = new Color(245, 210, 110, 255);
const ANIMA_COLOR = new Color(190, 150, 245, 255);
const ATTACK_COLOR = new Color(250, 165, 90, 255);
const KEY_COLOR = new Color(245, 220, 110, 255);
const SHARDS_COLOR = new Color(130, 200, 250, 255);

const DPAD_BTN = 84;
const ACTION_BTN_W = 110;
const ACTION_BTN_H = 60;

/** 远征 HUD 视图 → P2 PveHudView */
export class PveHudView {
  private _root: Node;
  private _floorLabel: Label;
  private _hpLabel: Label;
  private _apLabel: Label;
  private _goldLabel: Label;
  private _animaLabel: Label;
  private _attackLabel: Label;
  private _keyLabel: Label;
  /** 命运碎片余额（AC-20 局外资产，通过 refreshMeta 单独刷新）。 */
  private _shardsLabel: Label;
  /** 状态效果（冰冻 / 灼烧）：显示在顶部状态条下方第二行。 */
  private _statusLabel: Label;

  constructor(parent: Node, screenW: number, screenH: number, callbacks: PveHudCallbacks) {
    this._root = new Node('PveHudView');
    this._root.setParent(parent);
    this._root.setPosition(0, 0, 0);

    // 状态信息条（竖屏 720 宽）：2 行 x 4 列网格 + 状态效果行，整体移至「地图下方、战报栏上方」，
    // 与 ExpeditionController._buildUi 的 mapRoot/PveMessageLog 位置联动（见 design 文档）。
    // Y 坐标用相对 -screenH/2 的常量表达：与 ExpeditionController 中
    // mapRoot 底边 (-screenH/2+598) / 战报栏顶边 (-screenH/2+480) 共同推导，保证三者贴合不重叠。
    const ROW1_Y = -screenH / 2 + 571;
    const ROW2_Y = ROW1_Y - 38;
    const STATUS_Y = ROW2_Y - 36;
    const COL_X = [-270, -90, 90, 270];
    const COL_W = 170;
    const ROW_H = 34;
    const FONT = 20;

    // 第一行：楼层/回合、AP+骰子、HP、攻击力（HP/AP 回到顶部网格，紧邻地图，无遮挡）
    this._floorLabel = makeLabel(this._root, COL_X[0], ROW1_Y, COL_W, ROW_H, FONT, INFO_COLOR);
    this._apLabel = makeLabel(this._root, COL_X[1], ROW1_Y, COL_W, ROW_H, FONT, AP_COLOR);
    this._hpLabel = makeLabel(this._root, COL_X[2], ROW1_Y, COL_W, ROW_H, FONT, HP_COLOR);
    this._attackLabel = makeLabel(this._root, COL_X[3], ROW1_Y, COL_W, ROW_H, FONT, ATTACK_COLOR);

    // 第二行：金币、灵气、钥匙、命运碎片
    this._goldLabel = makeLabel(this._root, COL_X[0], ROW2_Y, COL_W, ROW_H, FONT, GOLD_COLOR);
    this._animaLabel = makeLabel(this._root, COL_X[1], ROW2_Y, COL_W, ROW_H, FONT, ANIMA_COLOR);
    this._keyLabel = makeLabel(this._root, COL_X[2], ROW2_Y, COL_W, ROW_H, FONT, KEY_COLOR);
    // 命运碎片（局外资产，AC-20）
    this._shardsLabel = makeLabel(this._root, COL_X[3], ROW2_Y, COL_W, ROW_H, FONT, SHARDS_COLOR);

    // 状态效果行（第三行）：显示冰冻/灼烧等 Boss 异常状态
    this._statusLabel = makeLabel(
      this._root, 0, STATUS_Y, 600, 26, 18,
      new Color(255, 255, 190, 255), Label.HorizontalAlign.CENTER,
    );

    this._buildDpad(callbacks, screenW, screenH);
    this._buildActionButtons(callbacks, screenW, screenH);

    // 状态条占位（_bootstrap loadSave 期间，让玩家看到"在加载"而不是空 HUD）
    this._floorLabel.string = '加载中…';
  }

  private _buildDpad(callbacks: PveHudCallbacks, screenW: number, screenH: number): void {
    // 单手操作：方向键整体移到屏幕右半侧、贴近「攻击/交互/结束回合」按钮簇，
    // 与动作按钮（x = screenW/2 - ACTION_BTN_W/2 - 24）之间留约 35px 间距，避免重叠。
    const cx = screenW / 2 - 305;
    const cy = -screenH / 2 + 105;
    const gap = DPAD_BTN + 10;

    // 键盘方向键布局：「上」在上方居中，「左/下/右」在下方一排
    makeFlatButton(this._root, '上', cx, cy + gap, DPAD_BTN, DPAD_BTN, () => callbacks.onMove('UP'));
    makeFlatButton(this._root, '左', cx - gap, cy, DPAD_BTN, DPAD_BTN, () => callbacks.onMove('LEFT'));
    makeFlatButton(this._root, '下', cx, cy, DPAD_BTN, DPAD_BTN, () => callbacks.onMove('DOWN'));
    makeFlatButton(this._root, '右', cx + gap, cy, DPAD_BTN, DPAD_BTN, () => callbacks.onMove('RIGHT'));
  }

  private _buildActionButtons(callbacks: PveHudCallbacks, screenW: number, screenH: number): void {
    const x = screenW / 2 - ACTION_BTN_W / 2 - 24;
    // 与 d-pad 中心对齐
    const cy = -screenH / 2 + 105;
    const gap = ACTION_BTN_H + 14;

    makeFlatButton(
      this._root, '攻击', x, cy + gap, ACTION_BTN_W, ACTION_BTN_H,
      () => callbacks.onAttack(), new Color(200, 90, 90, 255),
    );
    makeFlatButton(
      this._root, '交互', x, cy, ACTION_BTN_W, ACTION_BTN_H,
      () => callbacks.onInteract(), new Color(90, 160, 200, 255),
    );
    makeFlatButton(
      this._root, '结束回合', x, cy - gap, ACTION_BTN_W, ACTION_BTN_H,
      () => callbacks.onEndTurn(), new Color(120, 130, 145, 255),
    );

    // 「返回」「角色」按钮：移至地图与战报栏之间的横向空隙
    const SUB_BTN_Y = -screenH / 2 + 274;
    if (callbacks.onQuit) {
      makeFlatButton(
        this._root, '返回', -150, SUB_BTN_Y,
        120, 44, () => callbacks.onQuit?.(), new Color(90, 95, 105, 255),
      );
    }
    if (callbacks.onShowCharacter) {
      makeFlatButton(
        this._root, '角色', 150, SUB_BTN_Y,
        120, 44, () => callbacks.onShowCharacter?.(),
        new Color(140, 100, 200, 255),
      );
    }
  }

  refresh(state: ExpeditionState): void {
    const { player, floorState, chapter, floor } = state;
    this._floorLabel.string = `第${chapter}章·第${floor}层 回合${floorState.turn}`;
    this._hpLabel.string = `❤️${player.hp}/${player.maxHp}`;
    // 攻击力随职业 + 装备实时变化（CombatSystem.playerAttackPower），让玩家看见加成
    const { damage } = playerAttackPower(player);
    this._attackLabel.string = `⚔️${damage}`;
    // 显示骰子值 + 强化/命运树等加成，让玩家明白 maxAp = 8 + 骰子 + 加成（AC-2 表现需求）。
    const apBonus = floorState.maxAp - AP_BASE - floorState.dice;
    this._apLabel.string = apBonus !== 0
      ? `AP ${floorState.ap}/${floorState.maxAp}（🎲${floorState.dice}${apBonus > 0 ? '+' : ''}${apBonus}强化)`
      : `AP ${floorState.ap}/${floorState.maxAp} 🎲${floorState.dice}`;
    this._goldLabel.string = `💰${player.gold}`;
    this._animaLabel.string = `🔮${player.anima} (${player.animaProgress}/${player.animaThreshold ?? 100})`;
    // 钥匙状态对通关至关重要（普通层开门、Boss 层生成传送门），单独 1 槽位
    this._keyLabel.string = floorState.hasKey ? '🔑已持有' : '🔑无';
    // 状态效果行（灼烧/减速）
    const burn = floorState.playerBurnRemaining ?? 0;
    const slow = floorState.playerMoveApPenaltyRounds ?? 0;
    const statusParts: string[] = [];
    if (burn > 0) statusParts.push(`🔥 灼烧 ${burn} 点`);
    if (slow > 0) statusParts.push(`🥶 减速 ${slow} 回合`);
    this._statusLabel.string = statusParts.join('   ');
  }

  /**
   * 刷新命运碎片余额（AC-20 局外资产，不在 ExpeditionState 中，单独更新）。
   * 在 bootstrap 加载元进度后调用一次；结算后用新余额再次调用。
   */
  refreshMeta(destinyShards: number): void {
    this._shardsLabel.string = `💎${destinyShards}`;
  }

  setVisible(visible: boolean): void {
    this._root.active = visible;
  }

  destroy(): void {
    this._root.destroy();
  }
}
