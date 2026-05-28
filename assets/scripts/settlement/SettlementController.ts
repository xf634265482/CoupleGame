import {
  _decorator,
  Button,
  Color,
  Component,
  Graphics,
  Label,
  Node,
  UITransform,
  Vec3,
} from 'cc';
import { GameSession } from '../core/GameSession';
import { SceneLoader } from '../core/SceneLoader';
import { login } from '../platform/wechat/WxAuth';
import { GameStateMirror } from '../network/GameStateMirror';
import { GameWatcher } from '../network/GameWatcher';
import type { SettlementVO } from '../types/GameTypes';

const { ccclass } = _decorator;

const REASON_LABEL: Record<string, string> = {
  LAP: '有人跑满 2 圈',
  ACTION_ROUNDS: '10 个行动回合已满',
  TIMEOUT: '对局到时',
  QUIT: '有玩家退出',
  NORMAL: '对局结束',
};

/** 结算页 → AC-11, AC-12 */
@ccclass('SettlementController')
export class SettlementController extends Component {
  private _label: Label | null = null;

  onLoad(): void {
    const n = new Node('Result');
    n.setParent(this.node);
    n.setPosition(new Vec3(0, 80, 0));
    n.addComponent(UITransform).setContentSize(640, 360);
    this._label = n.addComponent(Label);
    this._label.fontSize = 28;
    this._label.lineHeight = 36;
    this._label.color = new Color(240, 240, 240, 255);
    this._label.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._label.overflow = Label.Overflow.SHRINK;

    this._makeBtn('返回大厅', -220, () => void this._goLobby());
    void this._loadSettlement();
  }

  private async _loadSettlement(): Promise<void> {
    if (GameStateMirror.game?.settlement) {
      this._refresh();
      return;
    }
    const gameId = GameSession.gameId;
    if (!gameId) {
      this._refresh();
      return;
    }
    const game = await GameWatcher.pullGameSnapshot(gameId);
    if (game) {
      GameStateMirror.setGame(game as unknown as Record<string, unknown>);
    }
    this._refresh();
  }

  private _makeBtn(text: string, y: number, onClick: () => void): void {
    const n = new Node(`Btn_${text}`);
    n.setParent(this.node);
    n.setPosition(new Vec3(0, y, 0));
    n.addComponent(UITransform).setContentSize(320, 56);
    const g = n.addComponent(Graphics);
    g.fillColor = new Color(52, 120, 200, 255);
    g.rect(-160, -28, 320, 56);
    g.fill();
    const ln = new Node('L');
    ln.setParent(n);
    ln.addComponent(UITransform).setContentSize(320, 56);
    const lbl = ln.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = 30;
    lbl.color = new Color(255, 255, 255, 255);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    n.addComponent(Button);
    n.on(Button.EventType.CLICK, onClick, this);
  }

  private _refresh(): void {
    const game = GameStateMirror.game;
    const settlement = game?.settlement as SettlementVO | undefined;
    const me = GameSession.user;

    if (!settlement) {
      if (this._label) this._label.string = '加载结算…';
      return;
    }

    const reason = REASON_LABEL[settlement.reason] || settlement.reason;
    const lines = [`【结算】${reason}`, ''];
    settlement.players
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .forEach((p) => {
        const rankLabel = p.isTie ? '并列第1' : `#${p.rank}`;
        const tie = p.isTie ? ' · 平局' : '';
        const meTag = p.openId === me?.openId ? ' ←你' : '';
        lines.push(
          `${rankLabel} 座位${p.seat + 1}  金${p.gold}  钻${p.diamond}${tie}${meTag}`,
        );
        if (p.diamondEarned > 0) {
          lines.push(`    局外钻石 +${p.diamondEarned}`);
        }
      });

    if (this._label) this._label.string = lines.join('\n');
    console.log('[Settlement]', lines.join('\n'));
  }

  private async _goLobby(): Promise<void> {
    GameWatcher.stopGame();
    GameSession.clearGame();
    GameSession.clearRoom();
    try {
      if (typeof wx !== 'undefined') {
        await login();
      }
    } catch (err) {
      console.warn('[Settlement] refresh user', err);
    }
    SceneLoader.loadLobby();
  }
}
