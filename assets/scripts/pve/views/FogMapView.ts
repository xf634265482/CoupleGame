import { Color, EventTouch, Graphics, Label, Mask, Node, Sprite, SpriteFrame, tween, Tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { chapterOfFloor } from '../core/PveConstants';
import type { Coord, FloorState, Monster } from '../core/PveTypes';
import { getCachedSprite, loadUiSprite } from '../../ui/UiAssets';
import { loadChapterBackground } from '../ChapterResourceLoader';
import { applySpriteInsideFixedBox, ensureArtCover } from '../../ui/UiSprite';
import { PveDebug } from '../debug/PveDebug';

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
// 鐜╁婧愬浘淇濈暀浜嗚緝澶氶€忔槑杈硅窛锛?.94 鐨勬壙杞界洅瀵瑰簲绾?80% 鐨勫疄闄呭彲瑙佽韩楂樸€?
const PLAYER_ICON_SCALE = 0.82;
const PLAYER_ICON_SCALE_BY_KEY: Record<string, number> = {
  PLAYER: PLAYER_ICON_SCALE,
  // 浠ュ啋闄╄€呬负鍩哄噯锛屾寜绱犳潗鍙闈㈢Н鍋氳交閲忓綊涓€鍖栵紝閬垮厤杩涢樁鍚庡洜杞粨鐣欑櫧/澶栨墿涓嶅悓鏄惧緱蹇藉ぇ蹇藉皬銆?
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
const SPECIAL_MONSTER_OCCUPANT_KEYS = new Set([
  'MONSTER_GOBLIN_SENTINEL',
  'MONSTER_DUNE_SENTINEL',
  'MONSTER_GLACIER_SHAPER',
  'MONSTER_FIRE_ELEMENTAL',
  'MONSTER_FATE_WATCHER',
]);
const SPECIAL_MONSTER_ICON_SCALE = 0.88;
const ELITE_MONSTER_ICON_SCALE = 0.98;
const CHAPTER4_NORMAL_MONSTER_ICON_SCALE = 0.88;
const CHAPTER4_CRAB_ICON_SCALE = 1.08;
const CHAPTER4_NORMAL_OCCUPANT_KEYS = new Set([
  'MONSTER_LAVA_GRUNT',
  'MONSTER_ASH_HOUND',
]);
const CHAPTER4_CRAB_OCCUPANT_KEYS = new Set(['MONSTER_LAVA_CRAB']);
const CHAPTER4_OUTLINE_COLOR = new Color(255, 220, 130, 235);
const MAP_ENTITY_ICON_SCALE = 0.62;
// Boss only scales the visual icon; board occupancy and collision remain one cell.
const BOSS_ICON_SCALE = 1.8;
const FROZEN_BORDER_STROKE = new Color(120, 220, 255, 255);
const FOG_REVEAL_DURATION = 0.3;
const FOG_REVEAL_SCALE = 1.04;
// 闆剧爾鏄剧ず灏哄鐩稿鍗曟牸鐨勬斁澶у€嶇巼锛?1 璁╃浉閭绘牸浜戝洟浜掔浉閲嶅彔銆佹秷闄ゆ帴缂濄€?
// 浜戝洟 PNG 鑷甫缇藉寲杈癸紝1.4 鍊嶄笅鐩搁偦鏍间簯鍥㈤噸鍙?~20%锛屾帴缂濋『婊戜笖涓嶄細鐩栦綇娑堥浘鍚庣殑鏍煎瓙涓績銆?
const FOG_TILE_SCALE = 1.4;
// 鏍煎瓙鏀惧ぇ鍚庢敹绱ч暅澶存鍖猴紝椤堕儴/搴曢儴鐜╁浼氭洿鏃╄Е鍙戝唴閮ㄥ唴瀹瑰亸绉伙紝
// 閬垮厤绗竴琛屽帇浣忚儗鏅煶鏉匡紝涔熼伩鍏嶆渶鍚庝竴琛岃淇℃伅鍗¤鍒囥€?
const CAMERA_DEAD_ZONE_RADIUS = 1.2;
// 鎽勫儚鏈洪挸鍒朵互妫嬬洏杈圭紭涓虹‖杈圭晫锛氳鍙ｆ渶杩滃彧鑳借鏌愪竴琛?鍒楄创榻愭鐩樿竟缂橈紝
// 涓嶅厑璁歌秺鍑猴紙鍚﹀垯浼氶湶鍑烘鐩樿儗鍚庣殑绔犺妭鑳屾櫙锛岀湅涓婂幓鍍?鎴樺満鍖哄煙闅忕帺瀹舵紓绉?锛夈€?
const CAMERA_EDGE_PADDING_CELLS = 0;
// 2026-06-23 鐪熸満瀵归綈锛氬浐瀹氱獥鍙ｆí鍚戠害灞曠ず 5.5 鏍硷紱鍏奸【鍗曚綅娓呮櫚搴︿笌闀滃ご婊氬姩棰戠巼銆?
const MAP_VISIBLE_COLS = 5.5;

type CellRenderContent = {
  entityKey: string;
  occupantKey: string;
  occupantMeta: string;
};

type CellRenderState = { revealed: boolean; content: string };
type MonsterIndex = Map<string, FloorState['monsters'][number]>;
type EntityIndex = Map<string, FloorState['entities'][number]>;

function cellContentKey(content: CellRenderContent): string {
  return [
    content.entityKey,
    content.occupantKey,
    content.occupantMeta,
  ].join(':');
}

function buildMonsterIndex(floor: FloorState): MonsterIndex {
  const monsterByPos: MonsterIndex = new Map();
  for (const monster of floor.monsters) {
    if (monster.aiState === 'DEAD' || monster.hp <= 0) continue;
    // 娴佹矙宸ㄨ潕娼滃湴鐘舵€侊細涓嶇敾鍦ㄦ鐩樹笂锛堟矙鍧戝疄浣撳凡琛ㄨ揪鍏舵綔浼忎綅缃級
    if (monster.isBurrowed) continue;
    monsterByPos.set(`${monster.pos.x},${monster.pos.y}`, monster);
  }
  return monsterByPos;
}

function buildEntityIndex(floor: FloorState): EntityIndex {
  const entityByPos: EntityIndex = new Map();
  const entityPriority: Record<string, number> = {
    PORTAL: 100,
    EXIT: 95,
    GUNPOWDER_BARREL: 90,
    BLAST_TARGET: 89,
    ESCAPE_MARKER: 88,
    WAVE_SPAWN_MARKER: 87,
    KEY: 85,
    CHEST: 80,
    ALTAR: 75,
    IDOL: 70,
    HOT_SPRING: 70,
    BLACKSMITH: 70,
    FRAGMENT: 65,
    ROCK: 20,
    ICE_WALL: 20,
    FREEZE_WALL: 20,
    SHATTERED_ICE: 10,
    ICE_TILE: 10,
    LAVA_TILE: 10,
    SAND_PIT: 5,
  };
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
        : 'PLAYER_ROGUE';
  }
  const key = `${x},${y}`;
  const playerHere = floor.player.x === x && floor.player.y === y;
  const monster = playerHere ? undefined : monsterByPos.get(key);
  if (monster) {
    if (monster.bossId === 'FATE_MIRROR') {
      occupantKey = 'MONSTER_FATE_MIRROR';
      occupantMeta = monster.shieldStacks === 1 ? 'SHIELD' : '';
    } else if (monster.bossId) {
      // Boss 浣跨敤 bossId 涓撳睘 key锛屾柟渚垮悗缁姣忎釜 Boss 閰嶇嫭绔嬬編鏈?
      occupantKey = `MONSTER_${monster.bossId}`;
    } else if (monster.variantId) {
      // 普通/精英怪使用 variantId，对应各自专属图标。
      occupantKey = `MONSTER_${monster.variantId}`;
      if (monster.variantId === 'GLACIER_SHAPER' && monster.glacierWallTarget) {
        occupantMeta = occupantMeta ? `${occupantMeta}|TELEGRAPH` : 'TELEGRAPH';
      }
    } else {
      occupantKey = `MONSTER_${monster.type}`;
    }
    if (!occupantKey.startsWith('MONSTER_')) {
      console.warn('[PVE][FogMap] monster occupant key missing', {
        monsterType: monster.type,
        variantId: monster.variantId,
        bossId: monster.bossId,
        pos: monster.pos,
      });
    }
    if (monster.side === 'ALLY') {
      occupantMeta = occupantMeta ? `${occupantMeta}|ALLY` : 'ALLY';
    }
  }

  let entityKey = 'EMPTY';
  const entity = entityByPos.get(key);
  if (entity) {
    entityKey = entity.type === 'SAND_PIT' && entity.remaining !== undefined
      ? 'ENTITY_SAND_PIT_DYNAMIC'
      : `ENTITY_${entity.type}`;
  }
  return { entityKey, occupantKey, occupantMeta };
}

export type FogMapViewCallbacks = { onCellTap?: (coord: Coord) => void };

export class FogMapView {
  private _root: Node;
  private _content: Node;
  private _cells: Node[] = [];
  private _fogCells: Node[] = [];
  private _rendered: (CellRenderState | undefined)[] = [];
  private _renderedFloor = 0;
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
  /** 鍐查攱绛夋妧鑳藉姩鐢绘湡闂撮攣浣?boss 澶у浘鏍囦綅缃紝閬垮厤 _refreshAll 鎶婂畠璺冲埌鐩爣鏍奸€犳垚楝煎奖銆?*/
  private _bossIconLocked = false;
  private _frozenOverlay: Node;
  private _boardOverlay: Node;
  private _floorPlane: Node;
  private _playerPos: Coord | null = null;
  private _dangerCellKeys = new Set<string>();
  private _hiddenOccupantCellKeys = new Set<string>();
  private _monsterFallbackLogged = new Set<string>();
  private _cameraBaseX = 0;
  private _cameraBaseY = 0;
  private _manualCameraOffsetX = 0;
  private _manualCameraOffsetY = 0;
  private _dragActive = false;
  private _dragLastUiX = 0;
  private _dragLastUiY = 0;
  private _dragMoved = false;
  private _suppressNextTap = false;

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
    // 鍦板浘鐩告満鍙厑璁稿湪鍥哄畾鎴樺満绐楀彛鍐呯Щ鍔紱绂佹鍐呭婧㈠嚭鍚庢妸鏁翠釜妫嬬洏瑙嗚鎺ㄤ笂/鎺ㄤ笅銆?
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

    // 鎴樺満骞抽潰绾圭悊灞傦紙VSS Environment_Reference 搂4.1锛夛細
    // 鍗?Sprite 鑺傜偣瑕嗙洊鏁翠釜妫嬬洏锛屾壙杞界珷鑺傚湴闈㈢汗鐞嗭紱Graphics 鍙礋璐ｆ牸绾裤€?
    // 灞傜骇锛氳儗鏅?鍦烘櫙灞? < _floorPlane < boardOverlay(鏍肩嚎) < 鏍煎瓙楂樹寒 < 杩烽浘 < 鍗曚綅 < 鎴樻枟鎻愮ず
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

    // 鍗曚綅灞傦細瑙掕壊/鎬墿/瀹炰綋鍥炬爣 + 鏂囧瓧锛岀嫭绔嬩簬 cell锛屾暣浣撴彁鍒版墍鏈?floor 涔嬩笂锛岄伩鍏嶈鐩搁偦鏍艰崏鍦伴伄鎸?
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

    this._root.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
    this._root.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
    this._root.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
    this._root.on(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this);

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
      loadUiSprite('pve/map/icon_player_berserker'),
      loadUiSprite('pve/map/icon_player_archer'),
      loadUiSprite('pve/map/icon_player_rogue'),
      loadUiSprite('pve/map/icon_chest'),
      loadUiSprite('pve/map/icon_key'),
      loadUiSprite('pve/map/icon_exit'),
      loadUiSprite('pve/map/icon_portal'),
      loadUiSprite('pve/map/icon_gunpowder_barrel'),
      loadUiSprite('pve/map/icon_blast_target'),
      loadUiSprite('pve/map/icon_altar'),
      loadUiSprite('pve/map/icon_idol'),
      loadUiSprite('pve/map/icon_hot_spring'),
    ]);
    // 绗?-5绔犺儗鏅凡杩佸嚭 UiAssets锛屾敼鐢?ChapterResourceLoader 鎸夌珷鑺傜嫭绔?bundle 鍔犺浇
    // 锛圗xpeditionController 鍦?Boss 灞?preloadChapter 棰勭儹銆佽繘绔犳椂 gating锛夈€傛澶勪笉鍐嶉鐑€?
    // 绗?绔?ch 閫氱敤鍥炬爣棰勭儹锛堜粛鍦ㄤ富鍖咃級锛涚2-5绔犲凡杩佸嚭 UiAssets锛岀敱 ChapterResourceLoader
    // 鍦?_ensureChapterReady 杩涚珷 gating 鏃剁粺涓€鍔犺浇骞舵敞鍏?UiAssets 缂撳瓨锛屾澶勬棤闇€棰勭儹銆?
    for (const t of ['normal', 'elite']) {
      void loadUiSprite(`pve/map/icon_monster_ch1_${t}`).catch(() => null);
    }
    // 绗?绔犳€墿鍙樹綋涓撳睘鍥炬爣棰勭儹锛堜粛鍦ㄤ富鍖咃紱鍏朵綑绔犺妭鍙樹綋鍦?artMap 閲岄兘閲嶅畾鍚戝埌 chN_* 閫氱敤鍥炬爣锛?
    // 閭ｄ簺 chN_* 宸茬敱 ensureChapterAssets 杩涚珷鏃剁粺涓€鍔犺浇锛屾晠涓嶅湪姝ゅ棰勭儹锛?
    for (const v of [
      'goblin_warrior', 'goblin_archer', 'ch1_goblin_sentinel', 'frost_goblin', 'fire_goblin', 'goblin_chief',
    ]) {
      void loadUiSprite(`pve/map/icon_monster_${v}`).catch(() => null);
    }
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
      this._manualCameraOffsetX = 0;
      this._manualCameraOffsetY = 0;
      this._cameraBaseX = 0;
      this._cameraBaseY = 0;
      this._content.setPosition(0, 0, 0);
      return;
    }

    // 浣跨敤灏忔暟鍙鏍兼暟绮剧‘閽冲埗锛氬湴鍥炬渶澶栬竟缂樹笌瑁佸垏绐楀彛涓ヤ笣鍚堢紳锛?
    // 涓嶅啀鍥?floor() 灏戠畻鍗婃牸鑰屽湪椤堕儴鐣欑┖銆佸簳閮ㄥ闇蹭竴鎺掑唴瀹广€?
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
    this._applyCameraPosition(-cameraPos.x, -cameraPos.y);
  }

  private _maxContentOffsetX(): number {
    return Math.max(0, (this._size * this._cellSize - this._maxW) / 2);
  }

  private _maxContentOffsetY(): number {
    return Math.max(0, (this._size * this._cellSize - this._maxH) / 2);
  }

  private _applyCameraPosition(baseX: number, baseY: number): void {
    this._cameraBaseX = baseX;
    this._cameraBaseY = baseY;
    const maxX = this._maxContentOffsetX();
    const maxY = this._maxContentOffsetY();
    const finalX = Math.max(-maxX, Math.min(maxX, baseX + this._manualCameraOffsetX));
    const finalY = Math.max(-maxY, Math.min(maxY, baseY + this._manualCameraOffsetY));
    this._manualCameraOffsetX = finalX - baseX;
    this._manualCameraOffsetY = finalY - baseY;
    this._content.setPosition(finalX, finalY, 0);
  }

  recenterOnPlayer(): void {
    this._manualCameraOffsetX = 0;
    this._manualCameraOffsetY = 0;
    if (this._playerPos) {
      this._refreshCamera(this._playerPos);
      return;
    }
    this._applyCameraPosition(this._cameraBaseX, this._cameraBaseY);
  }

  private _onTouchStart(event: EventTouch): void {
    if (!this._size || this._cellSize <= 0) return;
    const p = event.getUILocation();
    this._dragActive = true;
    this._dragMoved = false;
    this._dragLastUiX = p.x;
    this._dragLastUiY = p.y;
  }

  private _onTouchMove(event: EventTouch): void {
    if (!this._dragActive) return;
    if (this._maxContentOffsetX() <= 0 && this._maxContentOffsetY() <= 0) return;
    const p = event.getUILocation();
    const dx = p.x - this._dragLastUiX;
    const dy = p.y - this._dragLastUiY;
    this._dragLastUiX = p.x;
    this._dragLastUiY = p.y;
    if (!this._dragMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      this._dragMoved = true;
    }
    if (!this._dragMoved) return;
    this._manualCameraOffsetX += dx;
    this._manualCameraOffsetY += dy;
    this._applyCameraPosition(this._cameraBaseX, this._cameraBaseY);
  }

  private _finishDrag(): void {
    if (this._dragMoved) this._suppressNextTap = true;
    this._dragActive = false;
    this._dragMoved = false;
  }

  private _onTouchEnd(): void {
    this._finishDrag();
  }

  private _onTouchCancel(): void {
    this._finishDrag();
  }

  private _rebuild(size: number): void {
    PveDebug.mark('FogMap._rebuild.begin', `size=${size} cells=${this._cells.length}/${this._fogCells.length}/${this._unitCells.length}`);
    this._size = size;
    // 鐪熸満妯悜绾︽樉绀?5.5 鏍硷紝妫嬫牸銆佽鑹层€佹€墿鍜屼氦浜掔墿鍚屾缂╂斁锛涢€昏緫鍦板浘灏哄淇濇寔涓嶅彉銆?
    this._cellSize = Math.max(100, Math.floor(this._maxW / MAP_VISIBLE_COLS));
    try {
      for (let i = 0; i < this._cells.length; i++) {
        const n = this._cells[i];
        if (n && n.isValid) n.destroy();
        else PveDebug.mark('FogMap._rebuild.skipCell', `i=${i} valid=${!!(n && n.isValid)}`);
      }
      for (let i = 0; i < this._fogCells.length; i++) {
        const n = this._fogCells[i];
        if (n && n.isValid) n.destroy();
        else PveDebug.mark('FogMap._rebuild.skipFog', `i=${i} valid=${!!(n && n.isValid)}`);
      }
      for (let i = 0; i < this._unitCells.length; i++) {
        const n = this._unitCells[i];
        if (n && n.isValid) n.destroy();
        else PveDebug.mark('FogMap._rebuild.skipUnit', `i=${i} valid=${!!(n && n.isValid)}`);
      }
    } catch (err) {
      PveDebug.dump('FogMap._rebuild destroy throw');
      throw err;
    }
    this._cells = [];
    this._fogCells = [];
    this._unitCells = [];
    this._rendered = [];
    this._hiddenOccupantCellKeys.clear();
    this._cameraCell = null;
    this._manualCameraOffsetX = 0;
    this._manualCameraOffsetY = 0;
    this._cameraBaseX = 0;
    this._cameraBaseY = 0;
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
        // 鏂伴浘鐮栵紙GS-FOG-CH1锛夋湰韬槸鏈夋満浜戝洟 + 涓績瀹炲績 + alpha 缇藉寲鐨?PNG锛?
        // 涓嶅啀闇€瑕?fogBase 瀹炶壊鐭╁舰鍏滃簳锛堝厹搴曠煩褰細鍦ㄤ簯鍥㈤€忔槑瑙掕惤澶勯湶鍑鸿摑鏂瑰潡锛夈€?
        const fogArt = new Node('Art');
        fogArt.setParent(fogNode);
        // 鏄剧ず灏哄鏀惧ぇ鍒?FOG_TILE_SCALE 鍊嶅崟鏍硷紝浣跨浉閭绘牸浜戝洟閲嶅彔娑堢紳锛堝疄闄呭昂瀵稿湪 _paintCell 璐村浘鏃剁粺涓€鎸夎鍊嶇巼鍐欏叆锛夈€?
        fogArt.addComponent(UITransform).setContentSize(
          this._cellSize * FOG_TILE_SCALE,
          this._cellSize * FOG_TILE_SCALE,
        );
        fogArt.addComponent(Sprite);
        fogArt.addComponent(UIOpacity).opacity = 255;
        this._fogCells[idx] = fogNode;

        // 搴曞眰锛氫繚鐣欑粰鍗曟牸瑕嗙洊灞傦紱褰撳墠杩烽浘缁熶竴鐢?FogLayer 澶勭悊銆?
        const floorArt = new Node('FloorArt');
        floorArt.setParent(n);
        floorArt.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);
        floorArt.addComponent(Sprite);
        floorArt.addComponent(UIOpacity);
        floorArt.active = false;

        // 鍗曚綅瀹瑰櫒锛氭寕鍦?EntityLayer锛堥珮浜庢墍鏈?floor锛夛紝鎵胯浇鍥炬爣涓庢枃瀛楋紝閬垮厤鐩搁偦鏍艰崏鍦伴伄鎸?
        const unit = new Node(`Unit_${x}_${y}`);
        unit.setParent(this._entityLayer);
        unit.setPosition(this._cellLocalPos(x, y));
        unit.addComponent(UITransform).setContentSize(this._cellSize, this._cellSize);
        this._unitCells[idx] = unit;

        // 椤跺眰锛氬疄浣撳浘鏍囷紙鐜╁ / 鎬墿 / 瀹濈绛夛級
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

        n.on(Node.EventType.TOUCH_END, (_e: EventTouch) => {
          if (this._suppressNextTap) {
            this._suppressNextTap = false;
            return;
          }
          this._callbacks.onCellTap?.({ x, y });
        });
        this._cells[idx] = n;
      }
    }
    this._background.setSiblingIndex(0);
    // Cell/FloorArt 鑺傜偣鏄湪 FogLayer 涔嬪悗鍒涘缓鐨勩€傝嫢鎶?FogLayer 鍥哄畾鍦?index 1锛?
    // 鏂版彮绀烘椂鍒氭縺娲荤殑鍦版澘浼氱洊浣忚糠闆?tween锛屽姩鐢昏櫧鐒舵墽琛屽嵈瀹屽叏涓嶅彲瑙併€?
    // 渚濇鎻愬埌鏈熬锛屽浐瀹氬眰绾т负锛?
    // 鑳屾櫙/鍦版澘 < 绉诲姩鎻愮ず/鐜╁鐜?< 杩烽浘 < 鍗曚綅 < 鎴樻枟鎻愮ず銆?
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

    // floorPlane(0) < boardOverlay(鏍肩嚎,1) < 鏍煎瓙鍙婇珮浜眰
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

    // 绗竴绔犺儗鏅湰韬凡鍖呭惈鍖归厤鎴樺満鐨勮繛缁矙鍦熷湴闈€傛棫 tile_floor_ch1 鏄?787脳442 妯浘锛?
    // 寮哄埗濉厖姝ｆ柟褰㈡鐩樹細浜х敓鏄庢樉绾靛悜鎷変几锛涚涓€绔犵洿鎺ラ€忓嚭绔犺妭鑳屾櫙锛屾牸绾跨敱 Graphics 缁樺埗銆?
    if (chapter === 1) return;

    const key = `pve/map/tile_floor_ch${chapter}` as const;
    const applyFrame = (frame: import('cc').SpriteFrame) => {
      const sp = this._floorPlane.getComponent(Sprite);
      if (!sp) return;
      // CUSTOM 妯″紡锛氬己鍒?Sprite 濉弧 UITransform 鎸囧畾鐨?total脳total锛?
      // 閬垮厤 Cocos auto-trim 鎶?alpha 娓愬彉杈圭紭瑁佹帀鍚庣汗鐞嗛潰绉皬浜庢垬鍦恒€?
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
    // GS-BG-CH1 宸查噰鐢ㄥ悓鑹叉俯鐨勬殩鐮傚博鍓嶅摠鑳屾櫙锛屾殫鍩哄簳鍙繚鐣欒交閲忚惤鍦版劅銆?
    g.fillColor = new Color(15, 10, 5, 36);
    g.rect(-total / 2, -total / 2, total, total);
    g.fill();
    // 鏍煎瓙杈圭嚎锛氭繁妫曞鎻忚竟 + 娴呯櫧鍐呮弿杈癸紝鍦ㄦ殩鐮傚博鍦伴潰涓婁繚鎸佸彲璇?
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
    // 绔犺妭鑳屾櫙缁熶竴缁?ChapterResourceLoader 鍙栵紙绗?绔犱富鍖?/ 绗?-5绔犵嫭绔嬪垎鍖?bundle锛夈€?
    // 缂撳瓨鍛戒腑鏃跺悓姝ヨ繑鍥烇紱姝ｅ紡杩涚珷鏃?ExpeditionController 宸插厛 gating 鍔犺浇濂斤紝姝ゅ鍙栫紦瀛樹笉闂€?
    const sf = await loadChapterBackground(chapter).catch(() => null);
    if (!sf || !this._background.isValid || chapter !== this._chapter) return;
    ensureArtCover(this._background, 'Art', sf, this._screenW, this._screenH);
    this._background.active = true;
    this._background.setSiblingIndex(0);
  }

  /** ExpeditionController gating 鍔犺浇瀹屾垚鍚庝富鍔ㄦ敞鍏ワ紝閬垮厤鍐风紦瀛樻椂鐨勮儗鏅己澶遍棯鐑併€?*/
  setChapterBackground(chapter: number, sf: SpriteFrame): void {
    if (!sf || !this._background.isValid || chapter !== this._chapter) return;
    ensureArtCover(this._background, 'Art', sf, this._screenW, this._screenH);
    this._background.active = true;
    this._background.setSiblingIndex(0);
  }

  private _paintCell(node: Node, idx: number, sz: number, revealed: boolean, content: string, animateReveal = false): void {
    const cellCoord = { x: idx % this._size, y: Math.floor(idx / this._size) };
    const hiddenOccupantKey = this._cellKey(cellCoord);
    const occupantSuppressed = this._hiddenOccupantCellKeys.has(hiddenOccupantKey);
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

    // 宸叉帰绱㈡牸涓嶅啀閾哄疄蹇冨湴鐮栵紝璁╃珷鑺傝儗鏅垚涓鸿繛缁垬鍦猴紱鏍煎瓙鍙繚鐣欒交閲忚竟绾裤€?
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
    // 鈹€鈹€ 椤跺眰锛氬疄浣撳浘鏍囷紙鐜╁/鎬墿/瀹濈/鍑哄彛绛夛級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    // 鏍肩嚎宸茬敱 _boardOverlay 缁熶竴缁樺埗锛屾澶勪粎淇濈暀瀹炰綋涓撳睘鍦堝湀锛圔oss/绮捐嫳/鍐荤粨锛?
    const [entityKey = 'EMPTY', occupantKey = 'EMPTY', occupantMeta = ''] = content.split(':');
    const hasEntity = entityKey !== 'EMPTY';

    // 瀹炰綋鍥炬爣鏄犲皠锛堜笉鍚?EMPTY锛屽湴鏉跨敱搴曞眰澶勭悊锛?
    const artMap: Record<string, string> = {
      PLAYER: 'pve/map/icon_player_berserker',
      PLAYER_BERSERKER: 'pve/map/icon_player_berserker',
      PLAYER_ARCHER: 'pve/map/icon_player_archer',
      PLAYER_ROGUE: 'pve/map/icon_player_rogue',
      // 閫氱敤绫诲瀷鍏滃簳锛坴ariantId/bossId 鏈懡涓椂浣跨敤锛?
      MONSTER_NORMAL: 'pve/map/icon_monster_ch1_normal',
      MONSTER_ELITE: 'pve/map/icon_monster_ch1_elite',
      MONSTER_ANIMA: 'pve/map/icon_monster_ch1_anima',
      MONSTER_BOSS: 'pve/map/icon_monster_goblin_chief',
      MONSTER_FATE_MIRROR: 'pve/map/icon_monster_fate_mirror',
      // 鈹€鈹€ 绗?1 绔?鎬墿锛堜笓灞炲浘鏍囧瓨鍦ㄦ椂缂撳瓨浼樺厛锛涚己鍥炬椂 fallback 鍒扮珷鑺傞€氱敤鍥炬爣锛夆攢鈹€
      // 涓撳睘鍥炬爣鐢熸垚鍚?_loadBaseArt 棰勭儹杩涚紦瀛橈紝paintArt 鐨勭紦瀛樹紭鍏堟煡鎵句細鑷姩鍛戒腑
      MONSTER_GOBLIN_WARRIOR:   'pve/map/icon_monster_goblin_warrior',
      MONSTER_GOBLIN_ARCHER:    'pve/map/icon_monster_goblin_archer',
      MONSTER_GOBLIN_SENTINEL:  'pve/map/icon_monster_ch1_goblin_sentinel',
      MONSTER_BANNER_CAPTAIN:    'pve/map/icon_monster_ch1_elite',
      MONSTER_MESSENGER:         'pve/map/icon_monster_ch1_normal',
      MONSTER_FROST_GOBLIN:     'pve/map/icon_monster_frost_goblin',
      MONSTER_FIRE_GOBLIN:      'pve/map/icon_monster_fire_goblin',
      MONSTER_SPIRIT_RAT:       'pve/map/icon_monster_spirit_rat',
      MONSTER_GOBLIN_CHIEF:     'pve/map/icon_monster_goblin_chief',
      // 鈹€鈹€ 绗?2 绔?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
      MONSTER_DESERT_RAIDER:    'pve/map/icon_monster_ch2_normal',
      MONSTER_SANDWORM_LARVA:   'pve/map/icon_monster_ch2_hopper_lizard',
      MONSTER_DESERT_HOPPER_LIZARD: 'pve/map/icon_monster_ch2_hopper_lizard',
      MONSTER_DUNE_SENTINEL:    'pve/map/icon_monster_ch2_dune_sentinel',
      MONSTER_POISON_SCORPION:  'pve/map/icon_monster_ch2_elite',
      MONSTER_SPIRIT_BEETLE:    'pve/map/icon_monster_ch2_anima',
      MONSTER_QUICKSAND_SCORPION: 'pve/map/icon_monster_ch2_boss',
      // 鈹€鈹€ 绗?3 绔?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
      MONSTER_SNOW_WOLF:        'pve/map/icon_monster_ch3_normal',
      MONSTER_ICE_SLIME:        'pve/map/icon_monster_ch3_frostspike_porcupine',
      MONSTER_FROSTSPIKE_PORCUPINE: 'pve/map/icon_monster_ch3_frostspike_porcupine',
      MONSTER_FROST_SPRITE:     'pve/map/icon_monster_ch3_elite',
      MONSTER_GLACIER_SHAPER:   'pve/map/icon_monster_ch3_glacier_shaper',
      MONSTER_SPIRIT_ELF:       'pve/map/icon_monster_ch3_anima',
      MONSTER_FROST_GIANT:      'pve/map/icon_monster_ch3_boss',
      // 鈹€鈹€ 绗?4 绔?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
      MONSTER_LAVA_GRUNT:       'pve/map/icon_monster_ch4_ash_hound',
      MONSTER_ASH_HOUND:        'pve/map/icon_monster_ch4_ash_hound',
      MONSTER_LAVA_CRAB:        'pve/map/icon_monster_ch4_magma_crab',
      MONSTER_FIRE_ELEMENTAL:   'pve/map/icon_monster_ch4_fire_elemental',
      MONSTER_SPIRIT_EMBER:     'pve/map/icon_monster_ch4_anima',
      MONSTER_LAVA_LORD:        'pve/map/icon_monster_ch4_boss',
      // 鈹€鈹€ 绗?5 绔?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
      MONSTER_SHADOW_ASSASSIN:  'pve/map/icon_monster_ch5_normal',
      MONSTER_FATE_WATCHER:     'pve/map/icon_monster_ch5_fate_watcher',
      MONSTER_VOID_WORM:        'pve/map/icon_monster_ch5_fatewheel_beast',
      MONSTER_FATE_WHEEL_BEAST: 'pve/map/icon_monster_ch5_fatewheel_beast',
      MONSTER_SPIRIT_MIRAGE:    'pve/map/icon_monster_ch5_anima',
      MONSTER_FATE_GUARDIAN:    'pve/map/icon_monster_ch5_boss',
      // 鈹€鈹€ 鍦烘櫙瀹炰綋 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
      ENTITY_CHEST: 'pve/map/icon_chest',
      ENTITY_KEY: 'pve/map/icon_key',
      ENTITY_EXIT: 'pve/map/icon_exit',
      ENTITY_PORTAL: 'pve/map/icon_portal',
      ENTITY_GUNPOWDER_BARREL: 'pve/map/icon_gunpowder_barrel',
      ENTITY_BLAST_TARGET: 'pve/map/icon_blast_target',
      ENTITY_IDOL: 'pve/map/icon_idol',
      ENTITY_HOT_SPRING: 'pve/map/icon_hot_spring',
      ENTITY_ALTAR: 'pve/map/icon_altar',
      ENTITY_BLACKSMITH: 'pve/map/icon_blacksmith',
      ENTITY_FRAGMENT: '',
      ENTITY_SAND_PIT: 'pve/map/icon_sand_pit_permanent',
      // 鍔ㄦ€佹祦娌欏潙鏆傚鐢ㄦ案涔呮矙鍧戠編鏈紙缂虹嫭绔嬪浘鏃朵笉鑷充簬绌虹櫧鍗犱綅锛夈€?
      ENTITY_SAND_PIT_DYNAMIC: 'pve/map/icon_sand_pit_permanent',
      // 鈹€鈹€ 鐗规畩鍦板舰锛堟寜绔犺妭閫愪釜琛ョ編鏈紝缂哄浘鍥為€€姹夊瓧鍗犱綅锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
      ENTITY_ROCK: 'pve/map/terrain_rock',
      ENTITY_ICE_WALL: 'pve/map/terrain_ice_wall',
      ENTITY_ICE_TILE: 'pve/map/terrain_ice_tile',
      ENTITY_FREEZE_WALL: 'pve/map/terrain_freeze_wall',
      ENTITY_SHATTERED_ICE: 'pve/map/terrain_shattered_ice',
      ENTITY_LAVA_TILE: 'pve/map/terrain_lava',
    };
    // 鏃犵編鏈椂鐨勬眽瀛楀厹搴曪紙姣旈瀛楁瘝鏇寸洿瑙傦級
    const glyphFallback: Record<string, string> = {
      PLAYER: 'P',
      MONSTER_NORMAL: 'M',
      MONSTER_ANIMA: 'A',
      MONSTER_ELITE: 'E',
      MONSTER_BOSS: 'B',
      MONSTER_FATE_MIRROR: 'R',
      MONSTER_GOBLIN_WARRIOR: 'W',
      MONSTER_GOBLIN_ARCHER: 'G',
      MONSTER_FROST_GOBLIN: 'I',
      MONSTER_FIRE_GOBLIN: 'F',
      MONSTER_SPIRIT_RAT: 'R',
      MONSTER_GOBLIN_CHIEF: 'C',
      MONSTER_BANNER_CAPTAIN: 'E',
      MONSTER_MESSENGER: 'M',
      MONSTER_DESERT_RAIDER: 'D',
      MONSTER_SANDWORM_LARVA: 'S',
      MONSTER_DESERT_HOPPER_LIZARD: 'L',
      MONSTER_POISON_SCORPION: 'P',
      MONSTER_SPIRIT_BEETLE: 'A',
      MONSTER_QUICKSAND_SCORPION: 'Q',
      MONSTER_SNOW_WOLF: 'W',
      MONSTER_ICE_SLIME: 'I',
      MONSTER_FROSTSPIKE_PORCUPINE: 'H',
      MONSTER_FROST_SPRITE: 'F',
      MONSTER_SPIRIT_ELF: 'A',
      MONSTER_FROST_GIANT: 'G',
      MONSTER_LAVA_GRUNT: 'L',
      MONSTER_ASH_HOUND: 'H',
      MONSTER_LAVA_CRAB: 'C',
      MONSTER_FIRE_ELEMENTAL: 'F',
      MONSTER_SPIRIT_EMBER: 'A',
      MONSTER_LAVA_LORD: 'B',
      MONSTER_SHADOW_ASSASSIN: 'S',
      MONSTER_FATE_WATCHER: 'W',
      MONSTER_VOID_WORM: 'V',
      MONSTER_FATE_WHEEL_BEAST: 'F',
      MONSTER_SPIRIT_MIRAGE: 'A',
      MONSTER_FATE_GUARDIAN: 'B',
      ENTITY_CHEST: '箱',
      ENTITY_KEY: '钥',
      ENTITY_EXIT: '出',
      ENTITY_PORTAL: '门',
      ENTITY_GUNPOWDER_BARREL: '桶',
      ENTITY_BLAST_TARGET: '爆',
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
      ENTITY_FREEZE_WALL: '墙',
      ENTITY_SHATTERED_ICE: '冰',
      ENTITY_LAVA_TILE: '岩',
    };
    const fallbackGlyphFor = (key: string): string => {
      if (key.startsWith('MONSTER_')) {
        if (key.includes('ARCHER')) return '弓';
        if (key.includes('BOSS')
          || key.includes('CHIEF')
          || key.includes('SCORPION')
          || key.includes('GIANT')
          || key.includes('LORD')
          || key.includes('GUARDIAN')
        ) return '王';
        if (key.includes('ELITE') || key.includes('WATCHER')) return '精';
        if (key.includes('SENTINEL')) return '哨';
        return '怪';
      }
      const mapped = glyphFallback[key];
      if (mapped !== undefined) return mapped;
      if (key.startsWith('PLAYER')) return 'P';
      if (key.startsWith('ENTITY_')) return key.slice('ENTITY_'.length, 'ENTITY_'.length + 1);
      return key[0] ?? '';
    };

    const paintArt = (
      sprite: Sprite | undefined,
      glyphKey: string,
      boxScale: number,
      opacityValue = 255,
      alignBottom = false,
      suppressed = false,
    ): void => {
      if (!sprite) return;
      const opacity = sprite.node.getComponent(UIOpacity) || sprite.node.addComponent(UIOpacity);
      opacity.opacity = opacityValue;
      if (glyphKey === 'EMPTY') {
        sprite.node.active = false;
        return;
      }

      const artKey = artMap[glyphKey];
      if (!artKey) {
        sprite.node.active = false;
        return;
      }

      const applyFrame = (frame: SpriteFrame): void => {
        const stillSuppressed = suppressed && this._hiddenOccupantCellKeys.has(hiddenOccupantKey);
        sprite.node.active = !stillSuppressed;
        sprite.color = Color.WHITE;
        const box = sz * boxScale;
        applySpriteInsideFixedBox(sprite.node, frame, box, box);
        const artUi = sprite.node.getComponent(UITransform);
        sprite.node.setPosition(
          0,
          alignBottom && artUi ? -sz / 2 + artUi.height / 2 : 0,
          0,
        );
        if (lbl && lbl.string === fallbackGlyphFor(glyphKey)) {
          lbl.string = '';
        }
      };

      let cached: SpriteFrame | null = getCachedSprite(artKey);
      if (!cached && glyphKey.startsWith('MONSTER_')) {
        const variantKey = glyphKey.replace('MONSTER_', '').toLowerCase();
        cached = getCachedSprite(`pve/map/icon_monster_${variantKey}`)
          ?? getCachedSprite(`pve/map/icon_monster_ch${this._chapter}_${variantKey}`);
      }
      if (cached) {
        applyFrame(cached);
        return;
      }

      sprite.node.active = false;
      sprite.color = Color.WHITE;
      void loadUiSprite(artKey).then((frame) => {
        if (!frame || this._rendered[idx]?.content !== content) return;
        applyFrame(frame);
      }).catch(() => null);
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
      'MONSTER_FATE_WATCHER', 'MONSTER_VOID_WORM', 'MONSTER_FATE_WHEEL_BEAST',
    ]);
    const occupantScale = BOSS_OCCUPANT_KEYS.has(occupantKey)
      ? BOSS_ICON_SCALE
      : CHAPTER4_CRAB_OCCUPANT_KEYS.has(occupantKey)
        ? CHAPTER4_CRAB_ICON_SCALE
        : CHAPTER4_NORMAL_OCCUPANT_KEYS.has(occupantKey)
          ? CHAPTER4_NORMAL_MONSTER_ICON_SCALE
      : SPECIAL_MONSTER_OCCUPANT_KEYS.has(occupantKey)
        ? SPECIAL_MONSTER_ICON_SCALE
      : ELITE_OCCUPANT_KEYS.has(occupantKey)
        ? ELITE_MONSTER_ICON_SCALE
        : PLAYER_OCCUPANT_KEYS.has(occupantKey)
          ? (PLAYER_ICON_SCALE_BY_KEY[occupantKey] ?? PLAYER_ICON_SCALE)
          : NORMAL_MONSTER_ICON_SCALE;
    const entityScale = entityKey === 'ENTITY_ICE_WALL'
      ? 0.7
      : entityKey === 'ENTITY_GUNPOWDER_BARREL'
        ? 0.78
        : entityKey === 'ENTITY_BLAST_TARGET'
          ? 0.88
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
      occupantSuppressed,
    );

    // 第四层逃离点 / 第六层刷怪点：只闪格子，不显示文字占位。
    this._paintEscapeMarkerPulse(unit, sz, entityKey === 'ENTITY_ESCAPE_MARKER');
    this._paintWaveSpawnPulse(unit, sz, entityKey === 'ENTITY_WAVE_SPAWN_MARKER');

    if (lbl) {
      lbl.node.active = !occupantSuppressed;
      const occupantSpriteReady = Boolean(occupantArt?.node.active && occupantArt.spriteFrame);
      const entitySpriteReady = Boolean(entityArt?.node.active && entityArt.spriteFrame);
      const missingOccupantArt = occupantKey !== 'EMPTY'
        && !occupantSpriteReady;
      const missingEntityArt = entityKey !== 'EMPTY'
        && !entitySpriteReady
        && entityKey !== 'ENTITY_SAND_PIT_DYNAMIC'
        && entityKey !== 'ENTITY_ESCAPE_MARKER'
        && entityKey !== 'ENTITY_WAVE_SPAWN_MARKER';
      const glyphKey = missingOccupantArt
        ? occupantKey
        : missingEntityArt
          ? entityKey
          : 'EMPTY';
      if (glyphKey.startsWith('MONSTER_') && !this._monsterFallbackLogged.has(glyphKey)) {
        this._monsterFallbackLogged.add(glyphKey);
        console.warn('[PVE][FogMap] monster art fallback', {
          glyphKey,
          cell: { x: idx % this._size, y: Math.floor(idx / this._size) },
          content,
        });
      }
      lbl.string = occupantSuppressed || glyphKey === 'EMPTY' ? '' : fallbackGlyphFor(glyphKey);
      const colorMap: Record<string, Color> = {
        PLAYER: new Color(120, 200, 255, 255),
        MONSTER_NORMAL: new Color(235, 110, 90, 255),
        MONSTER_ANIMA: new Color(190, 130, 240, 255),
        MONSTER_ELITE: new Color(245, 165, 70, 255),
        MONSTER_BOSS: new Color(230, 60, 60, 255),
        ENTITY_CHEST: new Color(225, 185, 80, 255),
        ENTITY_KEY: new Color(245, 220, 110, 255),
        ENTITY_EXIT: new Color(120, 220, 140, 255),
        ENTITY_PORTAL: new Color(145, 210, 255, 255),
        ENTITY_GUNPOWDER_BARREL: new Color(255, 170, 80, 255),
        ENTITY_BLAST_TARGET: new Color(255, 120, 80, 255),
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
      Tween.stopAllByTarget(lbl.node);
      lbl.node.setScale(Vec3.ONE);
      lbl.fontSize = Math.round(this._cellSize * 0.46);
    }
    if (hpLbl) {
      hpLbl.string = '';
    }
    const occupantMetaFlags = new Set(occupantMeta ? occupantMeta.split('|') : []);
    if (this._chapter === 4 && occupantKey.startsWith('MONSTER_')) {
      // 鐔斿博鍦烘櫙鏄庡害浣庯紝鍏堢敾璇嗗埆鍦堬紝鍐嶇敱鐘舵€佸湀瑕嗙洊鍦ㄩ《灞傘€?      g.strokeColor = CHAPTER4_OUTLINE_COLOR;
      g.lineWidth = 3;
      g.circle(0, 0, sz * 0.44);
      g.stroke();
    }
    if (occupantMetaFlags.has('PRIORITY')) {
      g.strokeColor = occupantMetaFlags.has('TELEGRAPH')
        ? new Color(255, 120, 70, 255)
        : new Color(245, 190, 80, 240);
      g.lineWidth = occupantMetaFlags.has('TELEGRAPH') ? 4 : 3;
      g.circle(0, 0, sz * 0.42);
      g.stroke();
    }
    if (occupantMetaFlags.has('ALLY')) {
      g.strokeColor = new Color(110, 235, 170, 240);
      g.lineWidth = 3;
      g.circle(0, 0, sz * 0.44);
      g.stroke();
    }
    if (occupantMetaFlags.has('TELEGRAPH')) {
      g.fillColor = new Color(255, 110, 70, 235);
      g.strokeColor = new Color(255, 225, 190, 255);
      g.lineWidth = 2;
      g.moveTo(0, sz * 0.42);
      g.lineTo(sz * 0.12, sz * 0.22);
      g.lineTo(-sz * 0.12, sz * 0.22);
      g.close();
      g.fill();
      g.stroke();
    }
    if (occupantKey === 'MONSTER_FATE_MIRROR' && occupantMetaFlags.has('SHIELD')) {
      g.strokeColor = new Color(120, 200, 255, 240);
      g.lineWidth = 3;
      g.circle(0, 0, sz * 0.42);
      g.stroke();
    }
  }

  /** 第四层逃离点：黄框格子呼吸闪烁，不画文字。 */
  private _paintEscapeMarkerPulse(unit: Node | undefined, sz: number, active: boolean): void {
    this._paintMarkerPulse(unit, sz, active, 'EscapePulse', new Color(255, 220, 70, 70), new Color(255, 235, 90, 240));
  }

  /** 第六层夜袭刷怪点：紫红框呼吸闪烁，提示怪物出生格。 */
  private _paintWaveSpawnPulse(unit: Node | undefined, sz: number, active: boolean): void {
    this._paintMarkerPulse(unit, sz, active, 'WaveSpawnPulse', new Color(180, 60, 220, 80), new Color(255, 70, 120, 240));
  }

  private _paintMarkerPulse(
    unit: Node | undefined,
    sz: number,
    active: boolean,
    nodeName: string,
    fill: Color,
    stroke: Color,
  ): void {
    if (!unit) return;
    let pulse = unit.getChildByName(nodeName);
    if (!active) {
      if (pulse?.isValid) {
        const op = pulse.getComponent(UIOpacity);
        if (op) Tween.stopAllByTarget(op);
        pulse.destroy();
      }
      return;
    }
    if (!pulse?.isValid) {
      pulse = new Node(nodeName);
      pulse.setParent(unit);
      pulse.setPosition(0, 0, 0);
      pulse.addComponent(UITransform).setContentSize(sz, sz);
      pulse.addComponent(Graphics);
      pulse.addComponent(UIOpacity);
    }
    const pg = pulse.getComponent(Graphics);
    const op = pulse.getComponent(UIOpacity);
    if (!pg || !op) return;
    pg.clear();
    const inset = Math.max(3, Math.round(sz * 0.06));
    pg.fillColor = fill;
    pg.roundRect(-sz / 2 + inset, -sz / 2 + inset, sz - inset * 2, sz - inset * 2, 10);
    pg.fill();
    pg.strokeColor = stroke;
    pg.lineWidth = 3;
    pg.roundRect(-sz / 2 + inset, -sz / 2 + inset, sz - inset * 2, sz - inset * 2, 10);
    pg.stroke();
    Tween.stopAllByTarget(op);
    op.opacity = 255;
    tween(op)
      .repeatForever(
        tween(op)
          .to(0.55, { opacity: 70 })
          .to(0.55, { opacity: 255 }),
      )
      .start();
  }

  refresh(floor: FloorState, playerClassId?: string): void {
    if (floor.floor !== this._renderedFloor) {
      this._renderedFloor = floor.floor;
      // 移动动画会临时隐藏目标格的 occupant。若楼层切换但棋盘尺寸不变，
      // 按坐标保存的隐藏状态会误伤新楼层同坐标的怪物/实体，导致“数据存在但 UI 不显示”。
      this._hiddenOccupantCellKeys.clear();
      this._rendered = [];
      this.clearAoeHit();
      this.clearAoeWarning();
      this.showMoveRange([]);
      this.showAttackTarget(null);
      this.clearTutorialFocus();
      this._bossIconLocked = false;
    }
    const newChapter = chapterOfFloor(floor.floor);
    if (floor.size !== this._size) {
      // 妤煎眰灏哄鍙樺寲锛氶噸寤烘牸瀛愶紝_rebuild 鍐呴儴宸茶皟鐢?_refreshBackground
      this._chapter = newChapter;
      this._rebuild(floor.size);
    } else if (newChapter !== this._chapter) {
      // 绔犺妭鍒囨崲浣嗗昂瀵镐笉鍙橈細浠呭埛鏂拌儗鏅拰鍦伴潰绾圭悊锛屼笉閲嶅缓鏍煎瓙
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
          occupantKey: 'EMPTY',
          occupantMeta: '',
        });
        const prev = this._rendered[idx];
        const occupantKey = content.split(':')[1] ?? 'EMPTY';
        const hiddenRenderedOccupant = revealed
          && occupantKey !== 'EMPTY'
          && !this._isOccupantVisible(idx);
        if (prev && prev.revealed === revealed && prev.content === content && !hiddenRenderedOccupant) continue;
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
    // 閿佸畾鏈熼棿鎺у埗鍣ㄥ叏鏉冪鐞?overlay锛堜綅缃?/ active 閮戒笉鍔級锛?
    // 蹇呴』鏀惧湪鏈€鍓嶉潰锛氬惁鍒欐湭鎻浘鐨勭洰鏍囨牸浼氬厛琚?闅愯棌鍒嗘敮"鎴柇锛屽鑷村啿閿嬪埌鏆楁牸鏃?overlay 鐩存帴娑堝け銆?
    if (this._bossIconLocked) return;
    const boss = floor.monsters.find((m) => m.type === 'BOSS' && m.aiState !== 'DEAD');
    const sf = this._bossIconOverlay.getComponent(Sprite);
    // boss 涓嶅瓨鍦?/ 鏈彮闆?/ 宸叉綔鍦?鈫?闅愯棌澶у浘鏍?overlay
    if (!boss || boss.isBurrowed || !(floor.revealed[boss.pos.y]?.[boss.pos.x] ?? false) || !sf) {
      this._bossIconOverlay.active = false;
      return;
    }
    this._bossIconOverlay.active = true;
    // 浼樺厛鐢?bossId 涓撳睘鍥炬爣锛屽洖閫€閫氱敤 boss 鍥炬爣
    const bossArtById: Record<string, string> = {
      GOBLIN_CHIEF: 'pve/map/icon_monster_goblin_chief',
      QUICKSAND_SCORPION: 'pve/map/icon_monster_ch2_boss',
      FROST_GIANT: 'pve/map/icon_monster_ch3_boss',
      LAVA_LORD: 'pve/map/icon_monster_ch4_boss',
      FATE_GUARDIAN: 'pve/map/icon_monster_ch5_boss',
    };
    const bossVariantKey = boss.bossId ? bossArtById[boss.bossId] : null;
    const loadBossArt = bossVariantKey
      ? loadUiSprite(bossVariantKey).catch(() => loadUiSprite('pve/map/icon_monster_goblin_chief'))
      : loadUiSprite('pve/map/icon_monster_goblin_chief');
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
   * 鍙栨煇鏍肩殑鍗犵敤鑰呰壓鏈妭鐐癸紙OccupantArt 瀛愯妭鐐癸級鈥斺€?鐜╁/鎬墿鍥炬爣瀹為檯鎸傚湪杩欓噷銆?
   * 渚?fx/Effects.hit 绛夋垬鏂楀姩鐢讳綔鐢ㄣ€?
   * 娉細鍦烘櫙瀹炰綋锛堝疂绠?娓╂硥/鍑哄彛锛夌敾鍦?EntityArt 涓婏紝闇€瑕佹椂鍙﹀紑 getEntityArtAt 鍗冲彲銆?
   */
  getOccupantArtAt(coord: Coord): Node | null {
    const idx = coord.y * this._size + coord.x;
    const unit = this._unitCells[idx];
    if (!unit) return null;
    return unit.getChildByName('OccupantArt') ?? null;
  }

  /** 鍙栨煇鏍肩殑鍦烘櫙瀹炰綋鑹烘湳鑺傜偣锛圗ntityArt 瀛愯妭鐐癸級鈥斺€?瀹濈/娓╂硥/浼犻€侀棬/鍑哄彛/鐭冲潡 */
  getEntityArtAt(coord: Coord): Node | null {
    const idx = coord.y * this._size + coord.x;
    const unit = this._unitCells[idx];
    if (!unit) return null;
    return unit.getChildByName('EntityArt') ?? null;
  }

  setOccupantVisible(coord: Coord, visible: boolean): void {
    const cellKey = this._cellKey(coord);
    if (visible) this._hiddenOccupantCellKeys.delete(cellKey);
    else this._hiddenOccupantCellKeys.add(cellKey);
    const idx = coord.y * this._size + coord.x;
    const unit = this._unitCells[idx];
    this.invalidateRenderCache([coord]);
    if (!unit) return;
    const occupantArt = unit.getChildByName('OccupantArt');
    const glyph = unit.getChildByName('Glyph');
    if (!visible) {
      if (occupantArt) {
        occupantArt.active = false;
      }
      if (glyph) {
        const label = glyph.getComponent(Label);
        if (label) label.string = '';
        glyph.active = false;
      }
      return;
    }
    // 恢复可见：仅清 suppression + invalidate 不够——OccupantArt 仍会停在 active=false。
    // 近战 lunge / 锁链拉扯结束后若不立即 refresh，角色会一直空白直到下一次操作。
    // 这里把已画好的 sprite 直接拉回，caller 再 refresh 可补 glyph / 异步帧。
    const sprite = occupantArt?.getComponent(Sprite);
    if (occupantArt && sprite?.spriteFrame) {
      occupantArt.active = true;
    }
    if (glyph) glyph.active = true;
  }

  clearOccupantVisibilitySuppression(coord: Coord): void {
    this._hiddenOccupantCellKeys.delete(this._cellKey(coord));
    this.invalidateRenderCache([coord]);
  }

  /**
   * 澶嶅埗鏌愭牸 OccupantArt 褰撳墠鐢婚潰鎴愪竴涓嫭绔嬪瓙鑺傜偣锛屼緵姝讳骸閫€鍦?fx锛坒loat/fade锛変娇鐢ㄣ€?
   * 璋冪敤鏂归渶鍦?fx 缁撴潫鍚庤嚜琛?destroy 杩斿洖鑺傜偣銆?
   * 鐢ㄦ硶锛歳efresh 涔嬪墠鎶?鈫?鍒?state 鈫?refresh锛堝師 OccupantArt 琚殣钘忥級鈫?涓存椂鑺傜偣缁х画椋樿蛋銆?
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
      GOBLIN_SENTINEL: 'pve/map/icon_monster_ch1_goblin_sentinel',
      BANNER_CAPTAIN: 'pve/map/icon_monster_ch1_elite',
      MESSENGER: 'pve/map/icon_monster_ch1_normal',
      FROST_GOBLIN: 'pve/map/icon_monster_frost_goblin',
      FIRE_GOBLIN: 'pve/map/icon_monster_fire_goblin',
      SPIRIT_RAT: 'pve/map/icon_monster_spirit_rat',
      GOBLIN_CHIEF: 'pve/map/icon_monster_goblin_chief',
      DESERT_RAIDER: 'pve/map/icon_monster_ch2_normal',
      SANDWORM_LARVA: 'pve/map/icon_monster_ch2_hopper_lizard',
      DESERT_HOPPER_LIZARD: 'pve/map/icon_monster_ch2_hopper_lizard',
      DUNE_SENTINEL: 'pve/map/icon_monster_ch2_dune_sentinel',
      POISON_SCORPION: 'pve/map/icon_monster_ch2_elite',
      SPIRIT_BEETLE: 'pve/map/icon_monster_ch2_anima',
      QUICKSAND_SCORPION: 'pve/map/icon_monster_ch2_boss',
      SNOW_WOLF: 'pve/map/icon_monster_ch3_normal',
      ICE_SLIME: 'pve/map/icon_monster_ch3_frostspike_porcupine',
      FROSTSPIKE_PORCUPINE: 'pve/map/icon_monster_ch3_frostspike_porcupine',
      FROST_SPRITE: 'pve/map/icon_monster_ch3_elite',
      GLACIER_SHAPER: 'pve/map/icon_monster_ch3_glacier_shaper',
      SPIRIT_ELF: 'pve/map/icon_monster_ch3_anima',
      FROST_GIANT: 'pve/map/icon_monster_ch3_boss',
      LAVA_GRUNT: 'pve/map/icon_monster_ch4_ash_hound',
      ASH_HOUND: 'pve/map/icon_monster_ch4_ash_hound',
      LAVA_CRAB: 'pve/map/icon_monster_ch4_magma_crab',
      FIRE_ELEMENTAL: 'pve/map/icon_monster_ch4_fire_elemental',
      SPIRIT_EMBER: 'pve/map/icon_monster_ch4_anima',
      LAVA_LORD: 'pve/map/icon_monster_ch4_boss',
      SHADOW_ASSASSIN: 'pve/map/icon_monster_ch5_normal',
      FATE_WATCHER: 'pve/map/icon_monster_ch5_fate_watcher',
      VOID_WORM: 'pve/map/icon_monster_ch5_fatewheel_beast',
      FATE_WHEEL_BEAST: 'pve/map/icon_monster_ch5_fatewheel_beast',
      SPIRIT_MIRAGE: 'pve/map/icon_monster_ch5_anima',
      FATE_GUARDIAN: 'pve/map/icon_monster_ch5_boss',
    };
    const key = monster.bossId ?? monster.variantId ?? monster.type;
    const artKey = artMap[key];
    const frame = artKey ? getCachedSprite(artKey) : null;
    if (!frame) return null;

    const bossKeys = new Set(['GOBLIN_CHIEF', 'QUICKSAND_SCORPION', 'FROST_GIANT', 'LAVA_LORD', 'FATE_GUARDIAN']);
    const eliteKeys = new Set(['POISON_SCORPION', 'FROST_GOBLIN', 'FIRE_GOBLIN', 'FROST_SPRITE', 'FIRE_ELEMENTAL', 'FATE_WATCHER', 'VOID_WORM', 'FATE_WHEEL_BEAST']);
    const specialKeys = new Set(['GOBLIN_SENTINEL', 'DUNE_SENTINEL', 'GLACIER_SHAPER', 'FIRE_ELEMENTAL', 'FATE_WATCHER']);
    const scale = bossKeys.has(key)
      ? BOSS_ICON_SCALE
      : key === 'LAVA_CRAB'
        ? CHAPTER4_CRAB_ICON_SCALE
        : key === 'LAVA_GRUNT' || key === 'ASH_HOUND'
          ? CHAPTER4_NORMAL_MONSTER_ICON_SCALE
      : specialKeys.has(key)
        ? SPECIAL_MONSTER_ICON_SCALE
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

  /** 鍚屼笂锛屼絾鍏嬮殕 EntityArt锛堝満鏅疄浣擄細瀹濈/娓╂硥/鍑哄彛/鐭冲潡/...锛夈€?*/
  cloneEntityForFx(coord: Coord): Node | null {
    return this._cloneChildForFx(coord, 'EntityArt', 'EntityFxClone');
  }

  /** 杩斿洖鏌愭牸 unit 鑺傜偣鐨勪笘鐣屽潗鏍囷紙渚涚Щ鍔ㄦ粦鍔ㄥ姩鐢荤敤锛夈€傛牸鏈垵濮嬪寲鏃惰繑鍥為浂鍚戦噺銆?*/
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
    const coord = { x: idx % this._size, y: Math.floor(idx / this._size) };
    if (this._hiddenOccupantCellKeys.has(this._cellKey(coord))) return false;
    const occupantArt = unit.getChildByName('OccupantArt');
    const occupantSprite = occupantArt?.getComponent(Sprite);
    if (occupantArt?.active && occupantSprite?.spriteFrame) return true;
    const glyph = unit.getChildByName('Glyph')?.getComponent(Label);
    return Boolean(glyph?.node.active && glyph.string.trim());
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

  /**
   * 寮哄埗璁╂寚瀹氭牸瀛愶紙鎴栨暣寮犳鐩橈級鐨勬覆鏌撶紦瀛樺け鏁堛€?   * 鐢ㄤ簬澶勭悊 Boss 閽诲湴/鍐掑嚭杩欑被鐘舵€佺獊鍙橈細閫昏緫涓婂唴瀹瑰凡鍙橈紝浣嗘煇浜涙牸瀛愮殑 OccupantArt /
   * Glyph 鍙兘琚笂涓€甯ф樉闅愭搷浣滄墦涔憋紝蹇呴』璺宠繃 diff 缂撳瓨閲嶇敾涓€娆°€?   */
  invalidateRenderCache(cells?: Coord[]): void {
    if (!cells || cells.length === 0) {
      this._rendered = [];
      return;
    }
    for (const cell of cells) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= this._size || cell.y >= this._size) continue;
      const idx = cell.y * this._size + cell.x;
      this._rendered[idx] = undefined;
    }
  }

  /**
   * 寮哄埗娓呯┖妫嬬洏鏍煎唴鐨勫崰浣嶅彲瑙嗙姸鎬侊紝骞堕攢姣佹畫鐣欑殑 cell clone銆?   * 鐢ㄤ簬 Boss 閽诲湴/鍐掑嚭杩欑被寮虹姸鎬佸垏鎹細濡傛灉涓婁竴甯ф煇鏍?OccupantArt / Glyph 鏄鹃殣琚姩鐢讳腑鏂紝
   * 鍏堟妸妫嬬洏鏄剧ず灞傚綊闆讹紝鍐嶇敱 refresh() 鍏ㄩ噺閲嶇粯锛岄伩鍏嶆棫鐜╁鍥惧儚鍗″湪鍘熷湴銆?   */
  resetUnitVisualState(): void {
    this._hiddenOccupantCellKeys.clear();
    const transientNames = new Set(['OccupantFxClone', 'MonsterFxClone', 'EntityFxClone', 'BossIconFxClone']);
    for (const unit of this._unitCells) {
      if (!unit?.isValid) continue;
      for (const child of [...unit.children]) {
        if (transientNames.has(child.name) && child.isValid) child.destroy();
      }
      const occupantArt = unit.getChildByName('OccupantArt');
      const entityArt = unit.getChildByName('EntityArt');
      const glyph = unit.getChildByName('Glyph')?.getComponent(Label);
      const hpLabel = unit.getChildByName('HpLabel')?.getComponent(Label);
      if (occupantArt) occupantArt.active = false;
      if (entityArt) entityArt.active = false;
      if (glyph) glyph.string = '';
      if (hpLabel) hpLabel.string = '';
    }
    if (this._bossIconOverlay?.isValid) this._bossIconOverlay.active = false;
    this._rendered = [];
  }

  showAttackTarget(cell: Coord | null): void {
    const g = this._targetOverlay.getComponent(Graphics);
    if (!g) return;
    g.clear();
    if (!cell) return;
    const sz = this._cellSize;
    const pos = this._cellLocalPos(cell.x, cell.y);
    // 鍥涜鎷彿鐬勫噯妗嗭細鐩告満瀵圭劍椋庢牸锛屼笉鏌撹壊涓嶅叏妗嗭紝閬垮厤瑕嗙洊鎬墿缇庢湳
    const inset = sz * 0.06;        // 绂绘牸瀛愯竟缂樼殑鍐呯缉
    const armLen = sz * 0.22;       // 姣忔潯鐭噦闀垮害
    const x0 = pos.x - sz / 2 + inset;
    const x1 = pos.x + sz / 2 - inset;
    const y0 = pos.y - sz / 2 + inset;
    const y1 = pos.y + sz / 2 - inset;
    // 澶栧眰绮楃孩鎷彿
    g.strokeColor = ATTACK_TARGET_STROKE;
    g.lineWidth = 4;
    g.moveTo(x0, y0 + armLen); g.lineTo(x0, y0); g.lineTo(x0 + armLen, y0);
    g.moveTo(x1 - armLen, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + armLen);
    g.moveTo(x0, y1 - armLen); g.lineTo(x0, y1); g.lineTo(x0 + armLen, y1);
    g.moveTo(x1 - armLen, y1); g.lineTo(x1, y1); g.lineTo(x1, y1 - armLen);
    g.stroke();
    // 鍐呭眰缁嗛噾楂樺厜锛屽己鍖?閿佸畾"鎰?
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

  /** Boss 澶у浘鏍囪妭鐐癸紙渚?ExpeditionController 鍋氬钩婊戝啿閿?tween锛夈€?*/
  getBossIconNode(): Node {
    return this._bossIconOverlay;
  }

  /** 閿佸畾/瑙ｉ攣 boss 澶у浘鏍囦綅缃細閿佸畾鏃?_refreshAll 涓嶉噸缃?overlay 浣嶇疆锛岀敱鎺у埗鍣ㄨ嚜椹?tween銆?*/
  setBossIconLocked(locked: boolean): void {
    this._bossIconLocked = locked;
  }

  setBossIconVisible(visible: boolean): void {
    this._bossIconOverlay.active = visible;
  }

  /** 鎶?Boss 澶у浘鏍?sprite 寮哄埗璁句负鎸囧畾 cell 鐨勫綋鍓嶈创鍥撅紙渚涢攣瀹氭湡闂存墜鍔ㄩ┍鍔ㄧ敤锛岀‘淇濊创鍥惧凡鍔犺浇锛夈€?*/
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
    PveDebug.mark('FogMap.destroy.begin');
    try {
      if (this._background && this._background.isValid) this._background.destroy();
      else PveDebug.mark('FogMap.destroy.bgInvalid');
      if (this._root && this._root.isValid) this._root.destroy();
      else PveDebug.mark('FogMap.destroy.rootInvalid');
      PveDebug.mark('FogMap.destroy.end');
    } catch (err) {
      PveDebug.dump('FogMap.destroy throw');
      throw err;
    }
  }
}
