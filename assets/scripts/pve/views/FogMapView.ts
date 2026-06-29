import { Color, EventTouch, Graphics, Label, Mask, Node, Sprite, SpriteFrame, tween, Tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { CHAPTER3_ICE_WALL_HP } from '../core/PveConstants';
import type { Coord, FloorState, Monster } from '../core/PveTypes';
import { getCachedSprite, loadUiSprite } from '../../ui/UiAssets';
import { loadChapterBackground } from '../ChapterResourceLoader';
import { applySpriteInsideFixedBox, ensureArtCover } from '../../ui/UiSprite';

const AOE_HIT_FILL = new Color(255, 140, 0, 110);
const AOE_HIT_STROKE = new Color(255, 140, 0, 230);
const AOE_SAFE_FILL = new Color(90, 200, 120, 70);
const AOE_SAFE_STROKE = new Color(90, 200, 120, 200);
const AOE_WARNING_FILL = new Color(220, 50, 50, 80);
const AOE_WARNING_STROKE = new Color(220, 50, 50, 220);
const MOVE_RANGE_FILL = new Color(95, 184, 200, 28);
const MOVE_RANGE_STROKE = new Color(95, 184, 200, 115);
const ATTACK_TARGET_STROKE = new Color(217, 107, 107, 235);
const ATTACK_TARGET_INNER = new Color(214, 174, 85, 205);
const PLAYER_RING_FILL = new Color(95, 184, 200, 24);
const PLAYER_RING_STROKE = new Color(95, 184, 200, 150);
const PLAYER_RING_DANGER_FILL = new Color(95, 184, 200, 8);
const PLAYER_RING_DANGER_STROKE = new Color(95, 184, 200, 55);
const NORMAL_MONSTER_ICON_SCALE = 0.68;
// 玩家源图保留了较多透明边距；0.94 的承载盒对应约 80% 的实际可见身高。
const PLAYER_ICON_SCALE = 0.82;
const PLAYER_ICON_SCALE_BY_KEY: Record<string, number> = {
  PLAYER: PLAYER_ICON_SCALE,
  // 以冒险者为基准，按素材可视面积做轻量归一化，避免进阶后因轮廓留白/外扩不同显得忽大忽小。
  PLAYER_BERSERKER: PLAYER_ICON_SCALE * 0.96,
  PLAYER_ARCHER: PLAYER_ICON_SCALE * 1.02,
  PLAYER_ROGUE: PLAYER_ICON_SCALE * 0.95,
};
const PLAYER_OCCUPANT_KEYS = new Set([
  'PLAYER',
  'PLAYER_BERSERKER',
  'PLAYER_ARCHER',
  'PLAYER_ROGUE',
]);
const ELITE_MONSTER_ICON_SCALE = 0.98;
const MAP_ENTITY_ICON_SCALE = 0.62;
const BOSS_ICON_SCALE = 1.38;
const FROZEN_BORDER_STROKE = new Color(120, 220, 255, 255);
const FOG_REVEAL_DURATION = 0.3;
const FOG_REVEAL_SCALE = 1.04;
// 雾砖显示尺寸相对单格的放大倍率：>1 让相邻格云团互相重叠、消除接缝。
// 云团 PNG 自带羽化边，1.4 倍下相邻格云团重叠 ~20%，接缝顺滑且不会盖住消雾后的格子中心。
const FOG_TILE_SCALE = 1.4;
// 格子放大后收紧镜头死区，顶部/底部玩家会更早触发内部内容偏移，
// 避免第一行压住背景石板，也避免最后一行被信息卡裁切。
const CAMERA_DEAD_ZONE_RADIUS = 1.2;
// 摄像机钳制以棋盘边缘为硬边界：视口最远只能让某一行/列贴齐棋盘边缘，
// 不允许越出（否则会露出棋盘背后的章节背景，看上去像"战场区域随玩家漂移"）。
const CAMERA_EDGE_PADDING_CELLS = 0;
// 2026-06-23 真机对齐：固定窗口横向约展示 5.5 格；兼顾单位清晰度与镜头滚动频率。
const MAP_VISIBLE_COLS = 5.5;

type CellRenderContent = {
  entityKey: string;
  entityHpText: string;
  occupantKey: string;
  occupantMeta: string;
};

type CellRenderState = { revealed: boolean; content: string };
type MonsterIndex = Map<string, FloorState['monsters'][number]>;
type EntityIndex = Map<string, FloorState['entities'][number]>;

function cellContentKey(content: CellRenderContent): string {
  return [
    content.entityKey,
    content.entityHpText,
    content.occupantKey,
    content.occupantMeta,
  ].join(':');
}

function buildMonsterIndex(floor: FloorState): MonsterIndex {
  const monsterByPos: MonsterIndex = new Map();
  for (const monster of floor.monsters) {
    if (monster.aiState === 'DEAD') continue;
    // 流沙巨蝎潜地状态：不画在棋盘上（沙坑实体已表达其潜伏位置）
    if (monster.isBurrowed) continue;
    monsterByPos.set(`${monster.pos.x},${monster.pos.y}`, monster);
  }
  return monsterByPos;
}

function buildEntityIndex(floor: FloorState): EntityIndex {
  const entityByPos: EntityIndex = new Map();
  const entityPriority: Record<string, number> = { PORTAL: 100, EXIT: 90, KEY: 80 };
  for (const entity of floor.entities) {
    if (entity.consumed) continue;
    const key = `${entity.pos.x},${entity.pos.y}`;
    const current = entityByPos.get(key);
    if (!current || (entityPriority[entity.type] ?? 0) > (entityPriority[current.type] ?? 0)) {
      entityByPos.set(key, entity);
    }
  }
  return entityByPos;
}

function cellRenderContent(
  floor: FloorState,
  playerClassId: string | undefined,
  x: number,
  y: number,
  monsterByPos: MonsterIndex,
  entityByPos: EntityIndex,
): CellRenderContent {
  let occupantKey = 'EMPTY';
  let occupantMeta = '';
  if (floor.player.x === x && floor.player.y === y) {
    occupantKey = playerClassId === 'BERSERKER'
      ? 'PLAYER_BERSERKER'
      : playerClassId === 'ARCHER'
        ? 'PLAYER_ARCHER'
        : playerClassId === 'ROGUE'
        ? 'PLAYER_ROGUE'
          : 'PLAYER';
  }
  const key = `${x},${y}`;
  const monster = monsterByPos.get(key);
  if (monster) {
    if (monster.bossId === 'FATE_MIRROR') {
      occupantKey = 'MONSTER_FATE_MIRROR';
      occupantMeta = monster.shieldStacks === 1 ? 'SHIELD' : '';
    } else if (monster.bossId) {
      // Boss 使用 bossId 专属 key，方便后续对每个 Boss 配独立美术
      occupantKey = `MONSTER_${monster.bossId}`;
    } else if (monster.variantId) {
      // 普通/精英怪使用 variantId，对应各自专属图标
      occupantKey = `MONSTER_${monster.variantId}`;
    } else {
      occupantKey = `MONSTER_${monster.type}`;
    }
  }

  let entityKey = 'EMPTY';
  let entityHpText = '';
  const entity = entityByPos.get(key);
  if (entity) {
    entityKey = entity.type === 'SAND_PIT' && entity.remaining !== undefined
      ? 'ENTITY_SAND_PIT_DYNAMIC'
      : `ENTITY_${entity.type}`;
    entityHpText = entity.type === 'ICE_WALL' ? String(entity.hp ?? 0) : '';
  }
  return { entityKey, entityHpText, occupantKey, occupantMeta };
}

export type FogMapViewCallbacks = { onCellTap?: (coord: Coord) => void };

export class FogMapView {
  private _root: Node;
  private _content: Node;
  private _cells: Node[] = [];
  private _fogCells: Node[] = [];
  private _rendered: (CellRenderState | undefined)[] = [];
  private _size = 0;
  private _cellSize = 0;
  private _cameraCell: Coord | null = null;
  private _maxW: number;
  private _maxH: number;
  private _screenW: number;
  private _screenH: number;
  private _callbacks: FogMapViewCallbacks;
  private _background: Node;
  private _fogLayer: Node;
  private _entityLayer: Node;
  private _unitCells: Node[] = [];
  private _chapter = 1;
  private _hitOverlay: Node;
  private _warningOverlay: Node;
  private _moveOverlay: Node;
  private _playerFocusOverlay: Node;
  private _targetOverlay: Node;
  private _tutorialOverlay: Node;
  private _bossIconOverlay: Node;
  /** 冲锋等技能动画期间锁住 boss 大图标位置，避免 _refreshAll 把它跳到目标格造成鬼影。 */
  private _bossIconLocked = false;
  private _frozenOverlay: Node;
  private _boardOverlay: Node;
  private _floorPlane: Node;
  private _playerPos: Coord | null = null;
  private _dangerCellKeys = new Set<string>();

  constructor(
    parent: Node,
    maxW: number,
    maxH: number,
    callbacks: FogMapViewCallbacks = {},
    sceneBackground?: { parent: Node; width: number; height: number },
  ) {
    this._maxW = maxW;
    this._maxH = maxH;
    this._screenW = sceneBackground?.width ?? maxW;
    this._screenH = sceneBackground?.height ?? maxH;
    this._callbacks = callbacks;

    this._root = new Node('FogMapView');
    this._root.setParent(parent);
    this._root.addComponent(UITransform).setContentSize(maxW, maxH);
    // 地图相机只允许在固定战场窗口内移动；禁止内容溢出后把整个棋盘视觉推上/推下。
    this._root.addComponent(Mask);
    this._content = new Node('Content');
    this._content.setParent(this._root);

    this._background = new Node('ChapterBackground');
    this._background.setParent(sceneBackground?.parent ?? parent);
    this._background.setPosition(0, 0, 0);
    this._background.addComponent(UITransform);
    this._background.addComponent(Sprite);
    this._background.setSiblingIndex(0);

    this._fogLayer = new Node('FogLayer');
    this._fogLayer.setParent(this._content);

    // 战场平面纹理层（VSS Environment_Reference §4.1）：
    // 单 Sprite 节点覆盖整个棋盘，承载章节地面纹理；Graphics 只负责格线。
    // 层级：背景(场景层) < _floorPlane < boardOverlay(格线) < 格子高亮 < 迷雾 < 单位 < 战斗提示
    this._floorPlane = new Node('FloorPlane');
    this._floorPlane.setParent(this._content);
    this._floorPlane.addComponent(UITransform);
    this._floorPlane.addComponent(Sprite);
    this._floorPlane.addComponent(UIOpacity);
    this._floorPlane.active = false;

    this._boardOverlay = new Node('BoardOverlay');
    this._boardOverlay.setParent(this._content);
    this._boardOverlay.addComponent(UITransform);
    this._boardOverlay.addComponent(Graphics);

    // 单位层：角色/怪物/实体图标 + 文字，独立于 cell，整体提到所有 floor 之上，避免被相邻格草地遮挡
    this._entityLayer = new Node('EntityLayer');
    this._entityLayer.setParent(this._content);

    this._moveOverlay = this._createOverlay('MoveRangeOverlay');
    this._playerFocusOverlay = this._createOverlay('PlayerFocusOverlay');
    this._hitOverlay = this._createOverlay('AoeHitOverlay');
    this._warningOverlay = this._createOverlay('AoeWarningOverlay');
    this._targetOverlay = this._createOverlay('AttackTargetOverlay');
    this._tutorialOverlay = this._createOverlay('TutorialOverlay');
    this._frozenOverlay = this._createOverlay('FrozenOverlay');

    this._bossIconOverlay = new Node('BossIconOverlay');
    this._bossIconOverlay.setParent(this._content);
    this._bossIconOverlay.addComponent(UITransform);
    this._bossIconOverlay.addComponent(Sprite);

    void this._loadBaseArt();
  }

  private _createOverlay(name: string): Node {
    const n = new Node(name);
    n.setParent(this._content);
    n.addComponent(Graphics);
    return n;
  }

  private async _loadBaseArt(): Promise<void> {
    await Promise.all([
      loadUiSprite('pve/map/tile_fog'),
      loadUiSprite('pve/backgrounds/bg_pve_ch1'),
      loadUiSprite('pve/map/icon_player'),
      loadUiSprite('pve/map/icon_player_berserker'),
      loadUiSprite('pve/map/icon_player_archer'),
      loadUiSprite('pve/map/icon_player_rogue'),
    ]);
    // 第2-5章背景已迁出 UiAssets，改由 ChapterResourceLoader 按章节独立 bundle 加载
    // （ExpeditionController 在 Boss 层 preloadChapter 预热、进章时 gating）。此处不再预热。
    // 第1章 ch 通用图标预热（仍在主包）；第2-5章已迁出 UiAssets，由 ChapterResourceLoader
    // 在 _ensureChapterReady 进章 gating 时统一加载并注入 UiAssets 缓存，此处无需预热。
    for (const t of ['normal', 'elite', 'anima', 'boss']) {
      void loadUiSprite(`pve/map/icon_monster_ch1_${t}`).catch(() => null);
    }
    // 第1章怪物变体专属图标预热（仍在主包；其余章节变体在 artMap 里都重定向到 chN_* 通用图标，
    // 那些 chN_* 已由 ensureChapterAssets 进章时统一加载，故不在此处预热）
    for (const v of [
      'goblin_warrior', 'goblin_archer', 'frost_goblin', 'fire_goblin', 'spirit_rat', 'goblin_chief',
    ]) {
      void loadUiSprite(`pve/map/icon_monster_${v}`).catch(() => null);
    }
    void loadUiSprite('pve/map/icon_fragment').catch(() => null);
  }

  private _cellLocalPos(x: number, y: number): Vec3 {
    const half = (this._size - 1) / 2;
    return new Vec3((x - half) * this._cellSize, (half - y) * this._cellSize, 0);
  }

  private _refreshCamera(player: Coord): void {
    const visibleCols = Math.max(1, this._maxW / this._cellSize);
    const visibleRows = Math.max(1, this._maxH / this._cellSize);
    if (this._size <= visibleCols && this._size <= visibleRows) {
      this._cameraCell = null;
      this._content.setPosition(0, 0, 0);
      return;
    }

    // 使用小数可见格数精确钳制：地图最外边缘与裁切窗口严丝合缝，
    // 不再因 floor() 少算半格而在顶部留空、底部多露一排内容。
    const halfCols = visibleCols / 2 - 0.5;
    const halfRows = visibleRows / 2 - 0.5;
    const edgeHalfCols = Math.max(0, halfCols - CAMERA_EDGE_PADDING_CELLS);
    const edgeHalfRows = Math.max(0, halfRows - CAMERA_EDGE_PADDING_CELLS);
    const minX = edgeHalfCols;
    const maxX = this._size - 1 - edgeHalfCols;
    const minY = edgeHalfRows;
    const maxY = this._size - 1 - edgeHalfRows;
    const clampX = (x: number) => Math.max(minX, Math.min(maxX, x));
    const clampY = (y: number) => Math.max(minY, Math.min(maxY, y));

    if (!this._cameraCell) {
      this._cameraCell = {
        x: clampX(Math.floor((this._size - 1) / 2)),
        y: clampY(Math.floor((this._size - 1) / 2)),
      };
    }

    let nextX = this._cameraCell.x;
    let nextY = this._cameraCell.y;
    if (player.x < nextX - CAMERA_DEAD_ZONE_RADIUS) nextX = player.x + CAMERA_DEAD_ZONE_RADIUS;
    if (player.x > nextX + CAMERA_DEAD_ZONE_RADIUS) nextX = player.x - CAMERA_DEAD_ZONE_RADIUS;
    if (player.y < nextY - CAMERA_DEAD_ZONE_RADIUS) nextY = player.y + CAMERA_DEAD_ZONE_RADIUS;
    if (player.y > nextY + CAMERA_DEAD_ZONE_RADIUS) nextY = player.y - CAMERA_DEAD_ZONE_RADIUS;

    this._cameraCell = { x: clampX(nextX), y: clampY(nextY) };
    const cameraPos = this._cellLocalPos(this._cameraCell.x, this._cameraCell.y);
    // cameraPos 表示镜头中心在棋盘内容坐标中的位置；内容需做完全反向位移。
    // 玩家向下时 cameraPos.y 减小，因此 -cameraPos.y 会推动棋盘向上滚动。
    this._content.setPosition(-cameraPos.x, -cameraPos.y, 0);
  }

  private _rebuild(size: number): void {
    this._size = size;
    // 真机横向约显示 5.5 格，棋格、角色、怪物和交互物同步缩放；逻辑地图尺寸保持不变。
    this._cellSize = Math.max(100, Math.floor(this._maxW / MAP_VISIBLE_COLS));
    for (const n of this._cells) n.destroy();
    for (const n of this._fogCells) n.destroy();
    for (const n of this._unitCells) n.destroy();
    this._cells = [];
    this._fogCells = [];
    this._unitCells = [];
    this._rendered = [];
    this._cameraCell = null;
    this._background.setSiblingIndex(0);
    this._fogLayer.setSiblingIndex(1);
    this._refreshBackground();
    this._refreshFloorPlane(this._chapter);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const n = new Node(`Cell_${x}_${y}`);
        n.setParent(this._content);
        n.setPosition(this._cellLocalPos(x, y));
        n.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);
        n.addComponent(Graphics).lineWidth = 1;

        const fogNode = new Node(`Fog_${x}_${y}`);
        fogNode.setParent(this._fogLayer);
        fogNode.setPosition(this._cellLocalPos(x, y));
        fogNode.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);
        fogNode.addComponent(UIOpacity);
        // 新雾砖（GS-FOG-CH1）本身是有机云团 + 中心实心 + alpha 羽化的 PNG，
        // 不再需要 fogBase 实色矩形兜底（兜底矩形会在云团透明角落处露出蓝方块）。
        const fogArt = new Node('Art');
        fogArt.setParent(fogNode);
        // 显示尺寸放大到 FOG_TILE_SCALE 倍单格，使相邻格云团重叠消缝（实际尺寸在 _paintCell 贴图时统一按该倍率写入）。
        fogArt.addComponent(UITransform).setContentSize(
          this._cellSize * FOG_TILE_SCALE,
          this._cellSize * FOG_TILE_SCALE,
        );
        fogArt.addComponent(Sprite);
        fogArt.addComponent(UIOpacity).opacity = 255;
        this._fogCells[idx] = fogNode;

        // 底层：保留给单格覆盖层；当前迷雾统一由 FogLayer 处理。
        const floorArt = new Node('FloorArt');
        floorArt.setParent(n);
        floorArt.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);
        floorArt.addComponent(Sprite);
        floorArt.addComponent(UIOpacity);
        floorArt.active = false;

        // 单位容器：挂在 EntityLayer（高于所有 floor），承载图标与文字，避免相邻格草地遮挡
        const unit = new Node(`Unit_${x}_${y}`);
        unit.setParent(this._entityLayer);
        unit.setPosition(this._cellLocalPos(x, y));
        unit.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);
        this._unitCells[idx] = unit;

        // 顶层：实体图标（玩家 / 怪物 / 宝箱等）
        const entityArt = new Node('EntityArt');
        entityArt.setParent(unit);
        entityArt.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);
        entityArt.addComponent(Sprite);
        entityArt.addComponent(UIOpacity);

        const occupantArt = new Node('OccupantArt');
        occupantArt.setParent(unit);
        occupantArt.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);
        occupantArt.addComponent(Sprite);
        occupantArt.addComponent(UIOpacity);

        const glyphNode = new Node('Glyph');
        glyphNode.setParent(unit);
        glyphNode.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);
        const glyph = glyphNode.addComponent(Label);
        glyph.fontSize = Math.round(this._cellSize * 0.46);
        glyph.lineHeight = Math.round(this._cellSize * 0.5);
        glyph.horizontalAlign = Label.HorizontalAlign.CENTER;
        glyph.verticalAlign = Label.VerticalAlign.CENTER;
        glyph.string = '';

        const hpNode = new Node('HpLabel');
        hpNode.setParent(unit);
        hpNode.setPosition(this._cellSize * 0.22, -this._cellSize * 0.32, 0);
        hpNode.addComponent(UITransform).setContentSize(this._cellSize * 0.6, this._cellSize * 0.3);
        const hpLabel = hpNode.addComponent(Label);
        hpLabel.fontSize = Math.round(this._cellSize * 0.22);
        hpLabel.lineHeight = Math.round(this._cellSize * 0.24);
        hpLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        hpLabel.verticalAlign = Label.VerticalAlign.CENTER;
        hpLabel.color = new Color(220, 230, 240, 255);
        hpLabel.string = '';

        n.on(Node.EventType.TOUCH_END, (_e: EventTouch) => this._callbacks.onCellTap?.({ x, y }));
        this._cells[idx] = n;
      }
    }
    this._background.setSiblingIndex(0);
    // Cell/FloorArt 节点是在 FogLayer 之后创建的。若把 FogLayer 固定在 index 1，
    // 新揭示时刚激活的地板会盖住迷雾 tween，动画虽然执行却完全不可见。
    // 依次提到末尾，固定层级为：
    // 背景/地板 < 移动提示/玩家环 < 迷雾 < 单位 < 战斗提示。
    this._moveOverlay.setSiblingIndex(-1);
    this._playerFocusOverlay.setSiblingIndex(-1);
    this._fogLayer.setSiblingIndex(-1);
    this._entityLayer.setSiblingIndex(-1);
    this._hitOverlay.setSiblingIndex(-1);
    this._warningOverlay.setSiblingIndex(-1);
    this._targetOverlay.setSiblingIndex(-1);
    this._bossIconOverlay.setSiblingIndex(-1);
    this._frozenOverlay.setSiblingIndex(-1);

    const bossUi = this._bossIconOverlay.getComponent(UITransform);
    if (bossUi) bossUi.setContentSize(this._cellSize * BOSS_ICON_SCALE, this._cellSize * BOSS_ICON_SCALE);

    // floorPlane(0) < boardOverlay(格线,1) < 格子及高亮层
    this._drawBoardOverlay();
    this._floorPlane.setSiblingIndex(0);
    this._boardOverlay.setSiblingIndex(1);
  }

  private _refreshBackground(): void {
    const bgUi = this._background.getComponent(UITransform);
    if (bgUi) bgUi.setContentSize(this._screenW, this._screenH);
    this._background.active = false;
    void this._applyChapterBackground(this._chapter);
  }

  private _refreshFloorPlane(chapter: number): void {
    const total = this._size * this._cellSize;
    const ui = this._floorPlane.getComponent(UITransform);
    if (ui) ui.setContentSize(total, total);
    const op = this._floorPlane.getComponent(UIOpacity);
    if (op) op.opacity = 120;
    this._floorPlane.active = false;

    // 第一章背景本身已包含匹配战场的连续沙土地面。旧 tile_floor_ch1 是 787×442 横图，
    // 强制填充正方形棋盘会产生明显纵向拉伸；第一章直接透出章节背景，格线由 Graphics 绘制。
    if (chapter === 1) return;

    const key = `pve/map/tile_floor_ch${chapter}` as const;
    const applyFrame = (frame: import('cc').SpriteFrame) => {
      const sp = this._floorPlane.getComponent(Sprite);
      if (!sp) return;
      // CUSTOM 模式：强制 Sprite 填满 UITransform 指定的 total×total，
      // 避免 Cocos auto-trim 把 alpha 渐变边缘裁掉后纹理面积小于战场。
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      sp.spriteFrame = frame;
      this._floorPlane.active = true;
    };
    const cached = getCachedSprite(key);
    if (cached) {
      applyFrame(cached);
    } else {
      void loadUiSprite(key).then((frame) => {
        if (!frame || !this._floorPlane.isValid || this._chapter !== chapter) return;
        applyFrame(frame);
      });
    }
  }

  private _drawBoardOverlay(): void {
    const g = this._boardOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    const sz = this._cellSize;
    const n = this._size;
    const total = n * sz;
    const ui = this._boardOverlay.getComponent(UITransform);
    if (ui) ui.setContentSize(total, total);
    // GS-BG-CH1 已采用同色温的暖砂岩前哨背景，暗基底只保留轻量落地感。
    g.fillColor = new Color(15, 10, 5, 36);
    g.rect(-total / 2, -total / 2, total, total);
    g.fill();
    // 格子边线：深棕外描边 + 浅白内描边，在暖砂岩地面上保持可读
    const half = (n - 1) / 2;
    for (let cy = 0; cy < n; cy++) {
      for (let cx = 0; cx < n; cx++) {
        const cellX = (cx - half) * sz;
        const cellY = (half - cy) * sz;
        g.rect(cellX - sz / 2 + 0.5, cellY - sz / 2 + 0.5, sz - 1, sz - 1);
      }
    }
    g.lineWidth = 2;
    g.strokeColor = new Color(45, 28, 15, 170);
    g.stroke();
    g.lineWidth = 1;
    g.strokeColor = new Color(255, 245, 230, 95);
    g.stroke();
  }

  private async _applyChapterBackground(chapter: number): Promise<void> {
    // 章节背景统一经 ChapterResourceLoader 取（第1章主包 / 第2-5章独立分包 bundle）。
    // 缓存命中时同步返回；正式进章时 ExpeditionController 已先 gating 加载好，此处取缓存不闪。
    const sf = await loadChapterBackground(chapter).catch(() => null);
    if (!sf || !this._background.isValid || chapter !== this._chapter) return;
    ensureArtCover(this._background, 'Art', sf, this._screenW, this._screenH);
    this._background.active = true;
    this._background.setSiblingIndex(0);
  }

  /** ExpeditionController gating 加载完成后主动注入，避免冷缓存时的背景缺失闪烁。 */
  setChapterBackground(chapter: number, sf: SpriteFrame): void {
    if (!sf || !this._background.isValid || chapter !== this._chapter) return;
    ensureArtCover(this._background, 'Art', sf, this._screenW, this._screenH);
    this._background.active = true;
    this._background.setSiblingIndex(0);
  }

  private _paintCell(node: Node, idx: number, sz: number, revealed: boolean, content: string, animateReveal = false): void {
    const g = node.getComponent(Graphics);
    const floorArt = node.getChildByName('FloorArt')?.getComponent(Sprite);
    const fogNode = this._fogCells[idx];
    const unit = this._unitCells[idx];
    const entityArt = unit?.getChildByName('EntityArt')?.getComponent(Sprite);
    const occupantArt = unit?.getChildByName('OccupantArt')?.getComponent(Sprite);
    const lbl = unit?.getChildByName('Glyph')?.getComponent(Label);
    const hpLbl = unit?.getChildByName('HpLabel')?.getComponent(Label);
    if (!g) return;
    g.clear();

    if (!revealed) {
      if (fogNode) {
        const opacity = fogNode.getComponent(UIOpacity) || fogNode.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        Tween.stopAllByTarget(fogNode);
        opacity.opacity = 255;
        fogNode.active = true;
        const x = idx % this._size;
        const y = Math.floor(idx / this._size);
        fogNode.angle = 0;
        fogNode.setPosition(this._cellLocalPos(x, y));
        fogNode.setScale(1, 1, 1);
        const cachedFog = getCachedSprite('pve/map/tile_fog');
        const fogArt = fogNode.getChildByName('Art');
        const fogBox = Math.round(sz * FOG_TILE_SCALE);
        if (cachedFog) {
          if (fogArt) applySpriteInsideFixedBox(fogArt, cachedFog, fogBox, fogBox);
        } else {
          void loadUiSprite('pve/map/tile_fog').then((frame) => {
            if (frame && fogNode.isValid && fogArt?.isValid) {
              applySpriteInsideFixedBox(fogArt, frame, fogBox, fogBox);
            }
          });
        }
      }
      if (floorArt) floorArt.node.active = false;
      if (entityArt) entityArt.node.active = false;
      if (occupantArt) occupantArt.node.active = false;
      if (lbl) lbl.string = '';
      if (hpLbl) hpLbl.string = '';
      return;
    }

    // 已探索格不再铺实心地砖，让章节背景成为连续战场；格子只保留轻量边线。
    if (floorArt) {
      const opacity = floorArt.node.getComponent(UIOpacity) || floorArt.node.addComponent(UIOpacity);
      Tween.stopAllByTarget(opacity);
      opacity.opacity = 0;
      floorArt.node.active = false;
    }
    if (fogNode) {
      const opacity = fogNode.getComponent(UIOpacity) || fogNode.addComponent(UIOpacity);
      Tween.stopAllByTarget(opacity);
      Tween.stopAllByTarget(fogNode);
      const wasFogActive = fogNode.active;
      if (animateReveal && wasFogActive) {
        fogNode.setScale(1, 1, 1);
        tween(fogNode)
          .to(
            FOG_REVEAL_DURATION,
            { scale: new Vec3(FOG_REVEAL_SCALE, FOG_REVEAL_SCALE, 1) },
            { easing: 'sineOut' },
          )
          .start();
        tween(opacity)
          .to(FOG_REVEAL_DURATION, { opacity: 0 }, { easing: 'sineOut' })
          .call(() => {
            fogNode.active = false;
            opacity.opacity = 255;
            fogNode.setScale(1, 1, 1);
          })
          .start();
      } else {
        fogNode.active = false;
        opacity.opacity = 255;
        fogNode.setScale(1, 1, 1);
      }
    }
    // ── 顶层：实体图标（玩家/怪物/宝箱/出口等）────────────────
    // 格线已由 _boardOverlay 统一绘制，此处仅保留实体专属圈圈（Boss/精英/冻结）
    const [entityKey = 'EMPTY', entityHpText = '', occupantKey = 'EMPTY', occupantMeta = ''] = content.split(':');
    const hasEntity = entityKey !== 'EMPTY';

    // 实体图标映射（不含 EMPTY，地板由底层处理）
    const artMap: Record<string, string> = {
      PLAYER: 'pve/map/icon_player',
      PLAYER_BERSERKER: 'pve/map/icon_player_berserker',
      PLAYER_ARCHER: 'pve/map/icon_player_archer',
      PLAYER_ROGUE: 'pve/map/icon_player_rogue',
      // 通用类型兜底（variantId/bossId 未命中时使用）
      MONSTER_NORMAL: 'pve/map/icon_monster_normal',
      MONSTER_ELITE: 'pve/map/icon_monster_elite',
      MONSTER_ANIMA: 'pve/map/icon_monster_anima',
      MONSTER_BOSS: 'pve/map/icon_monster_boss',
      MONSTER_FATE_MIRROR: 'pve/map/icon_monster_fate_mirror',
      // ── 第 1 章 怪物（专属图标存在时缓存优先；缺图时 fallback 到章节通用图标）──
      // 专属图标生成后 _loadBaseArt 预热进缓存，paintArt 的缓存优先查找会自动命中
      MONSTER_GOBLIN_WARRIOR:   'pve/map/icon_monster_goblin_warrior',
      MONSTER_GOBLIN_ARCHER:    'pve/map/icon_monster_goblin_archer',
      MONSTER_FROST_GOBLIN:     'pve/map/icon_monster_frost_goblin',
      MONSTER_FIRE_GOBLIN:      'pve/map/icon_monster_fire_goblin',
      MONSTER_SPIRIT_RAT:       'pve/map/icon_monster_spirit_rat',
      MONSTER_GOBLIN_CHIEF:     'pve/map/icon_monster_goblin_chief',
      // ── 第 2 章 ────────────────────────────────────────────
      MONSTER_DESERT_RAIDER:    'pve/map/icon_monster_ch2_normal',
      MONSTER_SANDWORM_LARVA:   'pve/map/icon_monster_ch2_normal',
      MONSTER_POISON_SCORPION:  'pve/map/icon_monster_ch2_elite',
      MONSTER_SPIRIT_BEETLE:    'pve/map/icon_monster_ch2_anima',
      MONSTER_QUICKSAND_SCORPION: 'pve/map/icon_monster_ch2_boss',
      // ── 第 3 章 ────────────────────────────────────────────
      MONSTER_SNOW_WOLF:        'pve/map/icon_monster_ch3_normal',
      MONSTER_ICE_SLIME:        'pve/map/icon_monster_ch3_normal',
      MONSTER_FROST_SPRITE:     'pve/map/icon_monster_ch3_elite',
      MONSTER_SPIRIT_ELF:       'pve/map/icon_monster_ch3_anima',
      MONSTER_FROST_GIANT:      'pve/map/icon_monster_ch3_boss',
      // ── 第 4 章 ────────────────────────────────────────────
      MONSTER_LAVA_GRUNT:       'pve/map/icon_monster_ch4_normal',
      MONSTER_LAVA_CRAB:        'pve/map/icon_monster_ch4_normal',
      MONSTER_FIRE_ELEMENTAL:   'pve/map/icon_monster_ch4_elite',
      MONSTER_SPIRIT_EMBER:     'pve/map/icon_monster_ch4_anima',
      MONSTER_LAVA_LORD:        'pve/map/icon_monster_ch4_boss',
      // ── 第 5 章 ────────────────────────────────────────────
      MONSTER_SHADOW_ASSASSIN:  'pve/map/icon_monster_ch5_normal',
      MONSTER_FATE_WATCHER:     'pve/map/icon_monster_ch5_elite',
      MONSTER_VOID_WORM:        'pve/map/icon_monster_ch5_normal',
      MONSTER_SPIRIT_MIRAGE:    'pve/map/icon_monster_ch5_anima',
      MONSTER_FATE_GUARDIAN:    'pve/map/icon_monster_ch5_boss',
      // ── 场景实体 ──────────────────────────────────────────
      ENTITY_CHEST: 'pve/map/icon_chest',
      ENTITY_KEY: 'pve/map/icon_key',
      ENTITY_EXIT: 'pve/map/icon_exit',
      ENTITY_PORTAL: 'pve/map/icon_portal',
      ENTITY_IDOL: 'pve/map/icon_idol',
      ENTITY_HOT_SPRING: 'pve/map/icon_hot_spring',
      ENTITY_ALTAR: 'pve/map/icon_altar',
      ENTITY_BLACKSMITH: 'pve/map/icon_blacksmith',
      ENTITY_FRAGMENT: 'pve/map/icon_fragment',
      ENTITY_SAND_PIT: 'pve/map/icon_sand_pit_permanent',
      // 动态流沙坑暂复用永久沙坑美术（缺独立图时不至于空白占位）。
      ENTITY_SAND_PIT_DYNAMIC: 'pve/map/icon_sand_pit_permanent',
      // ── 特殊地形（按章节逐个补美术，缺图回退汉字占位）──────────
      ENTITY_ROCK: 'pve/map/terrain_rock',
      ENTITY_ICE_WALL: 'pve/map/terrain_ice_wall',
      ENTITY_ICE_TILE: 'pve/map/terrain_ice_tile',
      ENTITY_FREEZE_WALL: 'pve/map/terrain_freeze_wall',
      ENTITY_SHATTERED_ICE: 'pve/map/terrain_shattered_ice',
      ENTITY_LAVA_TILE: 'pve/map/terrain_lava',
    };
    // 无美术时的汉字兜底（比首字母更直观）
    const glyphFallback: Record<string, string> = {
      PLAYER: '我',
      MONSTER_NORMAL: '怪',
      MONSTER_ANIMA: '灵',
      MONSTER_ELITE: '精',
      MONSTER_BOSS: '王',
      MONSTER_FATE_MIRROR: '镜',
      // 第 1 章
      MONSTER_GOBLIN_WARRIOR: '战',
      MONSTER_GOBLIN_ARCHER:  '弓',
      MONSTER_FROST_GOBLIN:   '冰',
      MONSTER_FIRE_GOBLIN:    '火',
      MONSTER_SPIRIT_RAT:     '鼠',
      MONSTER_GOBLIN_CHIEF:   '酋',
      // 第 2 章
      MONSTER_DESERT_RAIDER:  '匪',
      MONSTER_SANDWORM_LARVA: '虫',
      MONSTER_POISON_SCORPION:'毒',
      MONSTER_SPIRIT_BEETLE:  '甲',
      MONSTER_QUICKSAND_SCORPION: '蝎',
      // 第 3 章
      MONSTER_SNOW_WOLF:      '狼',
      MONSTER_ICE_SLIME:      '泥',
      MONSTER_FROST_SPRITE:   '仙',
      MONSTER_SPIRIT_ELF:     '精',
      MONSTER_FROST_GIANT:    '巨',
      // 第 4 章
      MONSTER_LAVA_GRUNT:     '暴',
      MONSTER_LAVA_CRAB:      '蟹',
      MONSTER_FIRE_ELEMENTAL: '焰',
      MONSTER_SPIRIT_EMBER:   '炭',
      MONSTER_LAVA_LORD:      '熔',
      // 第 5 章
      MONSTER_SHADOW_ASSASSIN:'影',
      MONSTER_FATE_WATCHER:   '望',
      MONSTER_VOID_WORM:      '虚',
      MONSTER_SPIRIT_MIRAGE:  '幻',
      MONSTER_FATE_GUARDIAN:  '卫',
      // 场景实体
      ENTITY_CHEST: '箱',
      ENTITY_KEY: '钥',
      ENTITY_EXIT: '出',
      ENTITY_PORTAL: '门',
      ENTITY_IDOL: '像',
      ENTITY_HOT_SPRING: '泉',
      ENTITY_ALTAR: '坛',
      ENTITY_BLACKSMITH: '锻',
      ENTITY_CAMP: '营',
      ENTITY_FRAGMENT: '片',
      ENTITY_ROCK: '石',
      ENTITY_SAND_PIT: '坑',
      ENTITY_SAND_PIT_DYNAMIC: '',
      ENTITY_ICE_WALL: '墙',
      ENTITY_ICE_TILE: '冰',
      ENTITY_FREEZE_WALL: '冻',
      ENTITY_SHATTERED_ICE: '碎',
      ENTITY_LAVA_TILE: '岩',
    };

    const paintArt = (
      sprite: Sprite | undefined,
      glyphKey: string,
      boxScale: number,
      opacityValue = 255,
      alignBottom = false,
    ): void => {
      if (!sprite) return;
      const opacity = sprite.node.getComponent(UIOpacity) || sprite.node.addComponent(UIOpacity);
      opacity.opacity = opacityValue;
      if (glyphKey === 'EMPTY') {
        sprite.node.active = false;
        return;
      } else {
        const artKey = artMap[glyphKey];
        if (artKey) {
          sprite.node.active = true;
          void (async () => {
            // 章节专属怪物图标：只查缓存（_loadBaseArt 预热一次，失败仅报一次 warn）
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let frame: any = null;
            if (glyphKey.startsWith('MONSTER_')) {
              const variantKey = glyphKey.replace('MONSTER_', '').toLowerCase();
              // 优先用变体/Boss 专属图标缓存，其次用章节+类型图标缓存
              frame = getCachedSprite(`pve/map/icon_monster_${variantKey}`)
                ?? getCachedSprite(`pve/map/icon_monster_ch${this._chapter}_${variantKey}`);
            }
            if (!frame) frame = await loadUiSprite(artKey);
            if (this._rendered[idx]?.content !== content) return;
            if (frame) {
              const box = sz * boxScale;
              applySpriteInsideFixedBox(sprite.node, frame, box, box);
              const artUi = sprite.node.getComponent(UITransform);
              sprite.node.setPosition(
                0,
                alignBottom && artUi ? -sz / 2 + artUi.height / 2 : 0,
                0,
              );
              if (lbl && lbl.string === (glyphFallback[glyphKey] ?? '')) {
                lbl.string = '';
              }
            }
          })();
        } else {
          sprite.node.active = false;
        }
      }
    };

    const BOSS_OCCUPANT_KEYS = new Set([
      'MONSTER_BOSS', 'MONSTER_GOBLIN_CHIEF', 'MONSTER_QUICKSAND_SCORPION',
      'MONSTER_FROST_GIANT', 'MONSTER_LAVA_LORD', 'MONSTER_FATE_GUARDIAN',
    ]);
    const ELITE_OCCUPANT_KEYS = new Set([
      'MONSTER_ELITE',
      'MONSTER_FROST_GOBLIN', 'MONSTER_FIRE_GOBLIN',
      'MONSTER_POISON_SCORPION',
      'MONSTER_FROST_SPRITE',
      'MONSTER_FIRE_ELEMENTAL',
      'MONSTER_FATE_WATCHER', 'MONSTER_VOID_WORM',
    ]);
    const occupantScale = BOSS_OCCUPANT_KEYS.has(occupantKey)
      ? BOSS_ICON_SCALE
      : ELITE_OCCUPANT_KEYS.has(occupantKey)
        ? ELITE_MONSTER_ICON_SCALE
        : PLAYER_OCCUPANT_KEYS.has(occupantKey)
          ? (PLAYER_ICON_SCALE_BY_KEY[occupantKey] ?? PLAYER_ICON_SCALE)
          : NORMAL_MONSTER_ICON_SCALE;
    const entityScale = entityKey === 'ENTITY_ICE_WALL'
      ? 0.7
      : entityKey === 'ENTITY_PORTAL'
        ? 0.88
        : entityKey === 'ENTITY_EXIT'
          ? 0.76
          : entityKey === 'ENTITY_IDOL'
            ? MAP_ENTITY_ICON_SCALE * 1.2
            : MAP_ENTITY_ICON_SCALE;
    paintArt(entityArt, entityKey, entityScale);
    paintArt(
      occupantArt,
      occupantKey,
      occupantScale,
      PLAYER_OCCUPANT_KEYS.has(occupantKey) && hasEntity ? 238 : 255,
      BOSS_OCCUPANT_KEYS.has(occupantKey),
    );

    if (lbl) {
      lbl.node.active = true;
      const occupantArtKey = artMap[occupantKey];
      const entityArtKey = artMap[entityKey];
      const missingOccupantArt = occupantKey !== 'EMPTY'
        && (!occupantArtKey || !getCachedSprite(occupantArtKey));
      const missingEntityArt = entityKey !== 'EMPTY'
        && (!entityArtKey || !getCachedSprite(entityArtKey));
      const glyphKey = missingOccupantArt
        ? occupantKey
        : missingEntityArt && entityKey !== 'ENTITY_SAND_PIT_DYNAMIC'
          ? entityKey
          : 'EMPTY';
      lbl.string = glyphKey === 'EMPTY' ? '' : (glyphFallback[glyphKey] ?? glyphKey[0] ?? '');
      const colorMap: Record<string, Color> = {
        PLAYER: new Color(120, 200, 255, 255),
        MONSTER_NORMAL: new Color(235, 110, 90, 255),
        MONSTER_ANIMA: new Color(190, 130, 240, 255),
        MONSTER_ELITE: new Color(245, 165, 70, 255),
        MONSTER_BOSS: new Color(230, 60, 60, 255),
        ENTITY_CHEST: new Color(225, 185, 80, 255),
        ENTITY_KEY: new Color(245, 220, 110, 255),
        ENTITY_EXIT: new Color(120, 220, 140, 255),
        ENTITY_FRAGMENT: new Color(180, 120, 240, 255),
        ENTITY_ROCK: new Color(160, 160, 160, 255),
        ENTITY_SAND_PIT: new Color(210, 180, 100, 255),
        ENTITY_ICE_WALL: new Color(140, 210, 255, 255),
        ENTITY_ICE_TILE: new Color(160, 230, 255, 255),
        ENTITY_FREEZE_WALL: new Color(100, 180, 230, 255),
        ENTITY_SHATTERED_ICE: new Color(180, 230, 255, 255),
        ENTITY_LAVA_TILE: new Color(240, 100, 60, 255),
        MONSTER_FATE_MIRROR: new Color(170, 120, 220, 255),
      };
      lbl.color = colorMap[glyphKey] ?? new Color(255, 255, 255, 255);
    }
    if (hpLbl) {
      hpLbl.string = entityKey === 'ENTITY_ICE_WALL' && entityHpText ? `${entityHpText}/${CHAPTER3_ICE_WALL_HP}` : '';
    }
    if (occupantKey === 'MONSTER_FATE_MIRROR' && occupantMeta === 'SHIELD') {
      g.strokeColor = new Color(120, 200, 255, 240);
      g.lineWidth = 3;
      g.circle(0, 0, sz * 0.42);
      g.stroke();
    }
  }

  refresh(floor: FloorState, playerClassId?: string): void {
    const newChapter = Math.ceil(floor.floor / 5);
    if (floor.size !== this._size) {
      // 楼层尺寸变化：重建格子，_rebuild 内部已调用 _refreshBackground
      this._chapter = newChapter;
      this._rebuild(floor.size);
    } else if (newChapter !== this._chapter) {
      // 章节切换但尺寸不变：仅刷新背景和地面纹理，不重建格子
      this._chapter = newChapter;
      this._refreshBackground();
      this._refreshFloorPlane(newChapter);
    }
    this._refreshCamera(floor.player);
    this._playerPos = { ...floor.player };
    this._refreshPlayerFocus();
    const monsterByPos = buildMonsterIndex(floor);
    const entityByPos = buildEntityIndex(floor);
    for (let y = 0; y < floor.size; y++) {
      for (let x = 0; x < floor.size; x++) {
        const idx = y * floor.size + x;
        const node = this._cells[idx];
        if (!node) continue;
        const revealed = floor.revealed[y]?.[x] ?? false;
        const content = revealed ? cellContentKey(cellRenderContent(floor, playerClassId, x, y, monsterByPos, entityByPos)) : cellContentKey({
          entityKey: 'EMPTY',
          entityHpText: '',
          occupantKey: 'EMPTY',
          occupantMeta: '',
        });
        const prev = this._rendered[idx];
        const hiddenPlayerOccupant = floor.player.x === x
          && floor.player.y === y
          && !this._isOccupantVisible(idx);
        if (prev && prev.revealed === revealed && prev.content === content && !hiddenPlayerOccupant) continue;
        const animateReveal = Boolean(prev && !prev.revealed && revealed);
        this._rendered[idx] = { revealed, content };
        this._paintCell(node, idx, this._cellSize, revealed, content, animateReveal);
      }
    }
    this._refreshBossIcon(floor);
    this._refreshFrozenOverlay(floor);
  }

  private _refreshFrozenOverlay(floor: FloorState): void {
    const g = this._frozenOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    if (!floor.playerFrozen) return;
    const sz = this._cellSize;
    const pos = this._cellLocalPos(floor.player.x, floor.player.y);
    g.strokeColor = FROZEN_BORDER_STROKE;
    g.lineWidth = 3;
    g.rect(pos.x - sz / 2 + 1.5, pos.y - sz / 2 + 1.5, sz - 3, sz - 3);
    g.stroke();
  }

  private _refreshBossIcon(floor: FloorState): void {
    // 锁定期间控制器全权管理 overlay（位置 / active 都不动），
    // 必须放在最前面：否则未揭雾的目标格会先被"隐藏分支"截断，导致冲锋到暗格时 overlay 直接消失。
    if (this._bossIconLocked) return;
    const boss = floor.monsters.find((m) => m.type === 'BOSS' && m.aiState !== 'DEAD');
    const sf = this._bossIconOverlay.getComponent(Sprite);
    // boss 不存在 / 未揭雾 / 已潜地 → 隐藏大图标 overlay
    if (!boss || boss.isBurrowed || !(floor.revealed[boss.pos.y]?.[boss.pos.x] ?? false) || !sf) {
      this._bossIconOverlay.active = false;
      return;
    }
    this._bossIconOverlay.active = true;
    // 优先用 bossId 专属图标，回退通用 boss 图标
    const bossArtById: Record<string, string> = {
      GOBLIN_CHIEF: 'pve/map/icon_monster_goblin_chief',
      QUICKSAND_SCORPION: 'pve/map/icon_monster_ch2_boss',
      FROST_GIANT: 'pve/map/icon_monster_ch3_boss',
      LAVA_LORD: 'pve/map/icon_monster_ch4_boss',
      FATE_GUARDIAN: 'pve/map/icon_monster_ch5_boss',
    };
    const bossVariantKey = boss.bossId ? bossArtById[boss.bossId] : null;
    const loadBossArt = bossVariantKey
      ? loadUiSprite(bossVariantKey).catch(() => loadUiSprite('pve/map/icon_monster_boss'))
      : loadUiSprite('pve/map/icon_monster_boss');
    void loadBossArt.then((frame) => {
      if (!frame || !sf.node?.isValid) return;
      const box = this._cellSize * BOSS_ICON_SCALE;
      applySpriteInsideFixedBox(this._bossIconOverlay, frame, box, box);
      const ui = this._bossIconOverlay.getComponent(UITransform);
      const cellPos = this._cellLocalPos(boss.pos.x, boss.pos.y);
      this._bossIconOverlay.setPosition(
        cellPos.x,
        cellPos.y - this._cellSize / 2 + (ui?.height ?? box) / 2,
        0,
      );
    });
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

  private _cellKey(cell: Coord): string {
    return `${cell.x},${cell.y}`;
  }

  private _refreshPlayerFocus(): void {
    const g = this._playerFocusOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    if (!this._playerPos) return;
    const danger = this._dangerCellKeys.has(this._cellKey(this._playerPos));
    const pos = this._cellLocalPos(this._playerPos.x, this._playerPos.y);
    const radiusX = this._cellSize * 0.31;
    const radiusY = this._cellSize * 0.13;
    g.fillColor = danger ? PLAYER_RING_DANGER_FILL : PLAYER_RING_FILL;
    g.strokeColor = danger ? PLAYER_RING_DANGER_STROKE : PLAYER_RING_STROKE;
    g.lineWidth = danger ? 1.5 : 2;
    g.ellipse(pos.x, pos.y - this._cellSize * 0.28, radiusX, radiusY);
    g.fill();
    g.stroke();
  }

  /**
   * 取某格的占用者艺术节点（OccupantArt 子节点）—— 玩家/怪物图标实际挂在这里。
   * 供 fx/Effects.hit 等战斗动画作用。
   * 注：场景实体（宝箱/温泉/出口）画在 EntityArt 上，需要时另开 getEntityArtAt 即可。
   */
  getOccupantArtAt(coord: Coord): Node | null {
    const idx = coord.y * this._size + coord.x;
    const unit = this._unitCells[idx];
    if (!unit) return null;
    return unit.getChildByName('OccupantArt') ?? null;
  }

  /** 取某格的场景实体艺术节点（EntityArt 子节点）—— 宝箱/温泉/传送门/出口/石块 */
  getEntityArtAt(coord: Coord): Node | null {
    const idx = coord.y * this._size + coord.x;
    const unit = this._unitCells[idx];
    if (!unit) return null;
    return unit.getChildByName('EntityArt') ?? null;
  }

  setOccupantVisible(coord: Coord, visible: boolean): void {
    const idx = coord.y * this._size + coord.x;
    const unit = this._unitCells[idx];
    if (!unit) return;
    const occupantArt = unit.getChildByName('OccupantArt');
    const glyph = unit.getChildByName('Glyph');
    if (occupantArt) occupantArt.active = visible;
    if (glyph) glyph.active = visible;
  }

  /**
   * 复制某格 OccupantArt 当前画面成一个独立子节点，供死亡退场 fx（float/fade）使用。
   * 调用方需在 fx 结束后自行 destroy 返回节点。
   * 用法：refresh 之前抓 → 切 state → refresh（原 OccupantArt 被隐藏）→ 临时节点继续飘走。
   */
  cloneOccupantForFx(coord: Coord): Node | null {
    return this._cloneChildForFx(coord, 'OccupantArt', 'OccupantFxClone');
  }

  cloneMonsterForFx(monster: Monster): Node | null {
    const existing = this.cloneOccupantForFx(monster.pos);
    if (existing) return existing;

    const artMap: Record<string, string> = {
      FATE_MIRROR: 'pve/map/icon_monster_fate_mirror',
      GOBLIN_WARRIOR: 'pve/map/icon_monster_goblin_warrior',
      GOBLIN_ARCHER: 'pve/map/icon_monster_goblin_archer',
      FROST_GOBLIN: 'pve/map/icon_monster_frost_goblin',
      FIRE_GOBLIN: 'pve/map/icon_monster_fire_goblin',
      SPIRIT_RAT: 'pve/map/icon_monster_spirit_rat',
      GOBLIN_CHIEF: 'pve/map/icon_monster_goblin_chief',
      DESERT_RAIDER: 'pve/map/icon_monster_ch2_normal',
      SANDWORM_LARVA: 'pve/map/icon_monster_ch2_normal',
      POISON_SCORPION: 'pve/map/icon_monster_ch2_elite',
      SPIRIT_BEETLE: 'pve/map/icon_monster_ch2_anima',
      QUICKSAND_SCORPION: 'pve/map/icon_monster_ch2_boss',
      SNOW_WOLF: 'pve/map/icon_monster_ch3_normal',
      ICE_SLIME: 'pve/map/icon_monster_ch3_normal',
      FROST_SPRITE: 'pve/map/icon_monster_ch3_elite',
      SPIRIT_ELF: 'pve/map/icon_monster_ch3_anima',
      FROST_GIANT: 'pve/map/icon_monster_ch3_boss',
      LAVA_GRUNT: 'pve/map/icon_monster_ch4_normal',
      LAVA_CRAB: 'pve/map/icon_monster_ch4_normal',
      FIRE_ELEMENTAL: 'pve/map/icon_monster_ch4_elite',
      SPIRIT_EMBER: 'pve/map/icon_monster_ch4_anima',
      LAVA_LORD: 'pve/map/icon_monster_ch4_boss',
      SHADOW_ASSASSIN: 'pve/map/icon_monster_ch5_normal',
      FATE_WATCHER: 'pve/map/icon_monster_ch5_elite',
      VOID_WORM: 'pve/map/icon_monster_ch5_normal',
      SPIRIT_MIRAGE: 'pve/map/icon_monster_ch5_anima',
      FATE_GUARDIAN: 'pve/map/icon_monster_ch5_boss',
    };
    const key = monster.bossId ?? monster.variantId ?? monster.type;
    const artKey = artMap[key];
    const frame = artKey ? getCachedSprite(artKey) : null;
    if (!frame) return null;

    const bossKeys = new Set(['GOBLIN_CHIEF', 'QUICKSAND_SCORPION', 'FROST_GIANT', 'LAVA_LORD', 'FATE_GUARDIAN']);
    const eliteKeys = new Set(['POISON_SCORPION', 'FROST_GOBLIN', 'FIRE_GOBLIN', 'FROST_SPRITE', 'FIRE_ELEMENTAL', 'FATE_WATCHER', 'VOID_WORM']);
    const scale = bossKeys.has(key)
      ? BOSS_ICON_SCALE
      : eliteKeys.has(key)
        ? ELITE_MONSTER_ICON_SCALE
        : NORMAL_MONSTER_ICON_SCALE;

    const clone = new Node('MonsterFxClone');
    clone.setParent(this._content);
    const ui = clone.addComponent(UITransform);
    ui.setContentSize(this._cellSize, this._cellSize);
    const sprite = clone.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    clone.addComponent(UIOpacity).opacity = 255;
    const box = this._cellSize * scale;
    applySpriteInsideFixedBox(clone, frame, box, box);
    return clone;
  }

  cloneBossIconForFx(): Node | null {
    const src = this._bossIconOverlay;
    const srcSprite = src.getComponent(Sprite);
    if (!src.active || !srcSprite?.spriteFrame) return null;
    const srcUi = src.getComponent(UITransform);
    const clone = new Node('BossIconFxClone');
    clone.setParent(this._content);
    const ui = clone.addComponent(UITransform);
    if (srcUi) ui.setContentSize(srcUi.contentSize);
    const sp = clone.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = srcSprite.spriteFrame;
    sp.color = srcSprite.color.clone();
    clone.addComponent(UIOpacity);
    clone.setPosition(src.position);
    clone.setScale(src.scale);
    return clone;
  }

  /** 同上，但克隆 EntityArt（场景实体：宝箱/温泉/出口/石块/...）。 */
  cloneEntityForFx(coord: Coord): Node | null {
    return this._cloneChildForFx(coord, 'EntityArt', 'EntityFxClone');
  }

  /** 返回某格 unit 节点的世界坐标（供移动滑动动画用）。格未初始化时返回零向量。 */
  getCellWorldPosition(coord: Coord): Vec3 {
    const idx = coord.y * this._size + coord.x;
    const unit = this._unitCells[idx];
    if (!unit || !unit.isValid) return new Vec3();
    const wp = new Vec3();
    unit.getWorldPosition(wp);
    return wp;
  }

  private _cloneChildForFx(coord: Coord, childName: string, cloneName: string): Node | null {
    const idx = coord.y * this._size + coord.x;
    const unit = this._unitCells[idx];
    if (!unit) return null;
    const src = unit.getChildByName(childName);
    const srcSprite = src?.getComponent(Sprite);
    if (!src || !srcSprite || !srcSprite.spriteFrame || !src.active) return null;
    const srcUi = src.getComponent(UITransform);
    const clone = new Node(cloneName);
    clone.setParent(unit);
    const ui = clone.addComponent(UITransform);
    if (srcUi) ui.setContentSize(srcUi.contentSize);
    const sp = clone.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = srcSprite.spriteFrame;
    sp.color = srcSprite.color.clone();
    clone.addComponent(UIOpacity);
    clone.setPosition(src.position);
    clone.setScale(src.scale);
    return clone;
  }

  private _isOccupantVisible(idx: number): boolean {
    const unit = this._unitCells[idx];
    if (!unit) return false;
    return Boolean(
      unit.getChildByName('OccupantArt')?.active
      || unit.getChildByName('Glyph')?.active,
    );
  }

  showMoveRange(cells: Coord[]): void {
    const g = this._moveOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    g.fillColor = MOVE_RANGE_FILL;
    g.strokeColor = MOVE_RANGE_STROKE;
    g.lineWidth = 1.5;
    const inset = 7;
    for (const cell of cells) {
      const pos = this._cellLocalPos(cell.x, cell.y);
      g.roundRect(
        pos.x - this._cellSize / 2 + inset,
        pos.y - this._cellSize / 2 + inset,
        this._cellSize - inset * 2,
        this._cellSize - inset * 2,
        10,
      );
      g.fill();
      g.stroke();
    }
  }

  showAoeHit(cells: Coord[], safeCells: Coord[] = []): void {
    const g = this._hitOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    this._paintAoeOverlay(g, cells, AOE_HIT_FILL, AOE_HIT_STROKE);
    this._paintAoeOverlay(g, safeCells, AOE_SAFE_FILL, AOE_SAFE_STROKE);
  }

  clearAoeHit(): void {
    this._hitOverlay.getComponent(Graphics)?.clear();
  }

  showAoeWarning(cells: Coord[]): void {
    const g = this._warningOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    this._dangerCellKeys = new Set(cells.map((cell) => this._cellKey(cell)));
    this._refreshPlayerFocus();
    this._paintAoeOverlay(g, cells, AOE_WARNING_FILL, AOE_WARNING_STROKE);
  }

  clearAoeWarning(): void {
    this._warningOverlay.getComponent(Graphics)?.clear();
    this._dangerCellKeys.clear();
    this._refreshPlayerFocus();
  }

  showAttackTarget(cell: Coord | null): void {
    const g = this._targetOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    if (!cell) return;
    const sz = this._cellSize;
    const pos = this._cellLocalPos(cell.x, cell.y);
    // 四角括号瞄准框：相机对焦风格，不染色不全框，避免覆盖怪物美术
    const inset = sz * 0.06;        // 离格子边缘的内缩
    const armLen = sz * 0.22;       // 每条短臂长度
    const x0 = pos.x - sz / 2 + inset;
    const x1 = pos.x + sz / 2 - inset;
    const y0 = pos.y - sz / 2 + inset;
    const y1 = pos.y + sz / 2 - inset;
    // 外层粗红括号
    g.strokeColor = ATTACK_TARGET_STROKE;
    g.lineWidth = 4;
    g.moveTo(x0, y0 + armLen); g.lineTo(x0, y0); g.lineTo(x0 + armLen, y0);
    g.moveTo(x1 - armLen, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + armLen);
    g.moveTo(x0, y1 - armLen); g.lineTo(x0, y1); g.lineTo(x0 + armLen, y1);
    g.moveTo(x1 - armLen, y1); g.lineTo(x1, y1); g.lineTo(x1, y1 - armLen);
    g.stroke();
    // 内层细金高光，强化"锁定"感
    g.strokeColor = ATTACK_TARGET_INNER;
    g.lineWidth = 1.5;
    g.stroke();
  }

  showTutorialFocus(cells: Coord[]): void {
    const g = this._tutorialOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    if (cells.length === 0) return;
    const boardW = this._size * this._cellSize;
    const boardH = this._size * this._cellSize;
    g.fillColor = new Color(0, 8, 24, 140);
    g.rect(-boardW / 2, -boardH / 2, boardW, boardH);
    g.fill();
    g.strokeColor = new Color(255, 214, 110, 255);
    g.lineWidth = 4;
    for (const cell of cells) {
      const pos = this._cellLocalPos(cell.x, cell.y);
      const inset = 6;
      g.roundRect(
        pos.x - this._cellSize / 2 + inset,
        pos.y - this._cellSize / 2 + inset,
        this._cellSize - inset * 2,
        this._cellSize - inset * 2,
        12,
      );
      g.stroke();
    }
  }

  clearTutorialFocus(): void {
    this._tutorialOverlay.getComponent(Graphics)?.clear();
  }

  moveBossIconTo(cell: Coord): void {
    if (!this._bossIconOverlay.active) return;
    const ui = this._bossIconOverlay.getComponent(UITransform);
    const cellPos = this._cellLocalPos(cell.x, cell.y);
    this._bossIconOverlay.setPosition(
      cellPos.x,
      cellPos.y - this._cellSize / 2 + (ui?.height ?? this._cellSize * BOSS_ICON_SCALE) / 2,
      0,
    );
  }

  /** Boss 大图标节点（供 ExpeditionController 做平滑冲锋 tween）。 */
  getBossIconNode(): Node {
    return this._bossIconOverlay;
  }

  /** 锁定/解锁 boss 大图标位置：锁定时 _refreshAll 不重置 overlay 位置，由控制器自驱 tween。 */
  setBossIconLocked(locked: boolean): void {
    this._bossIconLocked = locked;
  }

  setBossIconVisible(visible: boolean): void {
    this._bossIconOverlay.active = visible;
  }

  /** 把 Boss 大图标 sprite 强制设为指定 cell 的当前贴图（供锁定期间手动驱动用，确保贴图已加载）。 */
  computeBossIconLocalPos(cell: Coord): { x: number; y: number } {
    const ui = this._bossIconOverlay.getComponent(UITransform);
    const cellPos = this._cellLocalPos(cell.x, cell.y);
    return {
      x: cellPos.x,
      y: cellPos.y - this._cellSize / 2 + (ui?.height ?? this._cellSize * BOSS_ICON_SCALE) / 2,
    };
  }

  get node(): Node {
    return this._root;
  }

  destroy(): void {
    this._background.destroy();
    this._root.destroy();
  }
}
