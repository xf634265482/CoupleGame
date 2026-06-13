// 迷雾地图渲染（design §5）：8×8/9×9/10×10 网格 + 战争迷雾 + 实体/怪物/玩家图标。
// 节点池化 + diff 刷新 —— 参考 BoardView：预建 size*size 个格子节点常驻复用，
// 仅在内容变化（揭示状态/格上实体）时重绘，禁止每次 refresh 销毁重建。
// M1 无美术资源：用 Graphics 色块 + Label 文字图标占位渲染。

import { Color, EventTouch, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import { CHAPTER3_ICE_WALL_HP } from '../core/PveConstants';
import type { Coord, FloorState } from '../core/PveTypes';

const FOG_COLOR = new Color(18, 20, 28, 235);
const FLOOR_COLOR = new Color(60, 66, 86, 255);
const GRID_LINE = new Color(90, 98, 122, 120);
const AOE_HIT_FILL = new Color(255, 140, 0, 110);
const AOE_HIT_STROKE = new Color(255, 140, 0, 230);
const AOE_SAFE_FILL = new Color(90, 200, 120, 70);
const AOE_SAFE_STROKE = new Color(90, 200, 120, 200);
const ATTACK_TARGET_STROKE = new Color(255, 215, 80, 220);

type CellGlyph = { text: string; color: Color };

const GLYPH: Record<string, CellGlyph> = {
  PLAYER: { text: '人', color: new Color(120, 200, 255, 255) },
  MONSTER_NORMAL: { text: '怪', color: new Color(235, 110, 90, 255) },
  MONSTER_ANIMA: { text: '灵', color: new Color(190, 130, 240, 255) },
  MONSTER_ELITE: { text: '精', color: new Color(245, 165, 70, 255) },
  MONSTER_BOSS: { text: '王', color: new Color(230, 60, 60, 255) },
  ENTITY_CHEST: { text: '箱', color: new Color(225, 185, 80, 255) },
  ENTITY_KEY: { text: '钥', color: new Color(245, 220, 110, 255) },
  ENTITY_EXIT: { text: '门', color: new Color(120, 220, 140, 255) },
  ENTITY_PORTAL: { text: '门', color: new Color(110, 220, 235, 255) },
  ENTITY_BLACKSMITH: { text: '锻', color: new Color(180, 180, 190, 255) },
  ENTITY_IDOL: { text: '像', color: new Color(200, 180, 230, 255) },
  ENTITY_HOT_SPRING: { text: '泉', color: new Color(140, 210, 230, 255) },
  ENTITY_ALTAR: { text: '坛', color: new Color(220, 160, 160, 255) },
  ENTITY_FRAGMENT: { text: '碎', color: new Color(180, 230, 130, 255) },
  ENTITY_ROCK: { text: '石', color: new Color(170, 170, 180, 255) },
  ENTITY_SAND_PIT: { text: '坑', color: new Color(200, 170, 110, 255) },
  ENTITY_ICE_WALL: { text: '冰', color: new Color(150, 220, 245, 255) },
  ENTITY_LAVA_TILE: { text: '焰', color: new Color(255, 120, 60, 255) },
  MONSTER_FATE_MIRROR: { text: '影', color: new Color(170, 120, 220, 255) },
};

type CellRenderState = { revealed: boolean; content: string };

function cellContentKey(floor: FloorState, x: number, y: number): string {
  if (floor.player.x === x && floor.player.y === y) return 'PLAYER';
  const monster = floor.monsters.find(
    (m) => m.aiState !== 'DEAD' && m.pos.x === x && m.pos.y === y,
  );
  if (monster) {
    if (monster.bossId === 'FATE_MIRROR') return 'MONSTER_FATE_MIRROR';
    return `MONSTER_${monster.type}`;
  }
  const entity = floor.entities.find((e) => !e.consumed && e.pos.x === x && e.pos.y === y);
  if (entity) {
    if (entity.type === 'ICE_WALL') return `ENTITY_ICE_WALL:${entity.hp ?? 0}`;
    return `ENTITY_${entity.type}`;
  }
  return 'EMPTY';
}

export type FogMapViewCallbacks = {
  onCellTap?: (coord: Coord) => void;
};

/** 迷雾网格视图：节点池化 + diff 刷新 → P2 FogMapView */
export class FogMapView {
  private _root: Node;
  private _content: Node;
  private _cells: Node[] = [];
  private _rendered: (CellRenderState | undefined)[] = [];
  private _size = 0;
  private _cellSize = 0;
  private _maxW: number;
  private _maxH: number;
  private _callbacks: FogMapViewCallbacks;
  private _hitOverlay: Node;
  private _targetOverlay: Node;

  /**
   * @param maxW 地图区域可用宽度（含左右留边后的值）；cellSize 按 floor(x / floor.size) 计算，
   *             使不同尺寸（8x8/9x9/10x10）的楼层都能尽量填满该宽度，避免左右出现大片黑边。
   * @param maxH 地图区域可用高度，限制 cellSize 上限（10x10 Boss 层不会超出该高度）。
   */
  constructor(parent: Node, maxW: number, maxH: number, callbacks: FogMapViewCallbacks = {}) {
    this._maxW = maxW;
    this._maxH = maxH;
    this._callbacks = callbacks;
    this._root = new Node('FogMapView');
    this._root.setParent(parent);
    this._root.setPosition(0, 0, 0);
    this._content = new Node('Content');
    this._content.setParent(this._root);
    this._content.setPosition(0, 0, 0);

    // AOE 实际命中范围层：独立 Graphics 节点，置于格子之上，refresh() 不会重绘它；蓄力重击结算后标识本次实际打到的区域
    this._hitOverlay = new Node('AoeHitOverlay');
    this._hitOverlay.setParent(this._content);
    this._hitOverlay.setPosition(0, 0, 0);
    this._hitOverlay.addComponent(Graphics);

    // 攻击目标提示层：独立 Graphics 节点，绘制当前"攻击"按钮将命中的目标格的细描边
    this._targetOverlay = new Node('AttackTargetOverlay');
    this._targetOverlay.setParent(this._content);
    this._targetOverlay.setPosition(0, 0, 0);
    this._targetOverlay.addComponent(Graphics);
  }

  /** 网格内某格在 Content 下的局部坐标（x 向右，y 向下，原点居中）。 */
  private _cellLocalPos(x: number, y: number): Vec3 {
    const half = (this._size - 1) / 2;
    return new Vec3((x - half) * this._cellSize, (half - y) * this._cellSize, 0);
  }

  private _rebuild(size: number): void {
    this._size = size;
    // 按当前楼层尺寸重新计算 cellSize：尽量填满可用宽度，同时不超过可用高度（10x10 Boss 层封顶）。
    this._cellSize = Math.max(28, Math.floor(Math.min(this._maxW, this._maxH) / size));
    for (const n of this._cells) n.destroy();
    this._cells = [];
    this._rendered = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const n = new Node(`Cell_${x}_${y}`);
        n.setParent(this._content);
        n.setPosition(this._cellLocalPos(x, y));
        n.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);

        const g = n.addComponent(Graphics);
        g.lineWidth = 1;

        const labelN = new Node('Glyph');
        labelN.setParent(n);
        labelN.setPosition(0, 0, 0);
        labelN.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);
        const lbl = labelN.addComponent(Label);
        lbl.fontSize = Math.round(this._cellSize * 0.46);
        lbl.lineHeight = Math.round(this._cellSize * 0.5);
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.string = '';

        const hpLabelN = new Node('HpLabel');
        hpLabelN.setParent(n);
        hpLabelN.setPosition(this._cellSize * 0.22, -this._cellSize * 0.32, 0);
        hpLabelN.addComponent(UITransform).setContentSize(this._cellSize * 0.6, this._cellSize * 0.3);
        const hpLbl = hpLabelN.addComponent(Label);
        hpLbl.fontSize = Math.round(this._cellSize * 0.22);
        hpLbl.lineHeight = Math.round(this._cellSize * 0.24);
        hpLbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        hpLbl.verticalAlign = Label.VerticalAlign.MIDDLE;
        hpLbl.color = new Color(220, 230, 240, 255);
        hpLbl.string = '';

        const coord: Coord = { x, y };
        n.on(Node.EventType.TOUCH_END, (_e: EventTouch) => this._callbacks.onCellTap?.(coord));

        this._cells[idx] = n;
      }
    }

    // 重建格子节点后，确保命中/目标提示层始终在最上层
    this._hitOverlay.setSiblingIndex(-1);
    this._targetOverlay.setSiblingIndex(-1);
  }

  private _paintCell(node: Node, sz: number, revealed: boolean, content: string): void {
    const g = node.getComponent(Graphics);
    const lbl = node.getChildByName('Glyph')?.getComponent(Label);
    const hpLbl = node.getChildByName('HpLabel')?.getComponent(Label);
    if (!g) return;
    g.clear();

    if (!revealed) {
      g.fillColor = FOG_COLOR;
      g.rect(-sz / 2, -sz / 2, sz, sz);
      g.fill();
      if (lbl) lbl.string = '';
      if (hpLbl) hpLbl.string = '';
      return;
    }

    g.fillColor = FLOOR_COLOR;
    g.rect(-sz / 2, -sz / 2, sz, sz);
    g.fill();
    g.strokeColor = GRID_LINE;
    g.rect(-sz / 2 + 0.5, -sz / 2 + 0.5, sz - 1, sz - 1);
    g.stroke();

    const [glyphKey, hpText] = content.split(':');
    const glyph = GLYPH[glyphKey];
    if (lbl) {
      if (glyph) {
        lbl.string = glyph.text;
        lbl.color = glyph.color;
      } else {
        lbl.string = '';
      }
    }
    if (hpLbl) {
      hpLbl.string = glyphKey === 'ENTITY_ICE_WALL' && hpText ? `${hpText}/${CHAPTER3_ICE_WALL_HP}` : '';
    }
  }

  /** 按楼层运行态做 diff 刷新：仅重绘揭示状态或格上内容变化的格子。 */
  refresh(floor: FloorState): void {
    if (floor.size !== this._size) {
      this._rebuild(floor.size);
    }

    for (let y = 0; y < floor.size; y++) {
      for (let x = 0; x < floor.size; x++) {
        const idx = y * floor.size + x;
        const node = this._cells[idx];
        if (!node) continue;

        const revealed = floor.revealed[y]?.[x] ?? false;
        const content = revealed ? cellContentKey(floor, x, y) : 'EMPTY';
        const prev = this._rendered[idx];
        if (prev && prev.revealed === revealed && prev.content === content) continue;

        this._rendered[idx] = { revealed, content };
        this._paintCell(node, this._cellSize, revealed, content);
      }
    }
  }

  private _paintAoeOverlay(g: Graphics, cells: Coord[], fill: Color, stroke: Color): void {
    const sz = this._cellSize;
    g.fillColor = fill;
    g.strokeColor = stroke;
    g.lineWidth = 2;
    for (const c of cells) {
      const pos = this._cellLocalPos(c.x, c.y);
      g.rect(pos.x - sz / 2 + 1, pos.y - sz / 2 + 1, sz - 2, sz - 2);
      g.fill();
      g.stroke();
    }
  }

  /**
   * 在指定格子上绘制橙色「实际命中区域」（蓄力重击结算时调用，标识本次真正打到的范围）。
   * safeCells：被石块遮挡、本次未受到伤害的格子，用绿色「安全」标识区分。
   */
  showAoeHit(cells: Coord[], safeCells: Coord[] = []): void {
    const g = this._hitOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    this._paintAoeOverlay(g, cells, AOE_HIT_FILL, AOE_HIT_STROKE);
    this._paintAoeOverlay(g, safeCells, AOE_SAFE_FILL, AOE_SAFE_STROKE);
  }

  /** 清除「实际命中区域」高亮。 */
  clearAoeHit(): void {
    this._hitOverlay.getComponent(Graphics)?.clear();
  }

  /** 在目标格绘制细描边，提示"攻击"按钮当前会命中该格（不遮挡格内图标，避免打扰）；cell 为 null 时清除。 */
  showAttackTarget(cell: Coord | null): void {
    const g = this._targetOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    if (!cell) return;
    const sz = this._cellSize;
    const pos = this._cellLocalPos(cell.x, cell.y);
    g.strokeColor = ATTACK_TARGET_STROKE;
    g.lineWidth = 2;
    g.rect(pos.x - sz / 2 + 2, pos.y - sz / 2 + 2, sz - 4, sz - 4);
    g.stroke();
  }

  get node(): Node {
    return this._root;
  }

  destroy(): void {
    this._root.destroy();
  }
}
