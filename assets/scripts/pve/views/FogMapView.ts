import { Color, EventTouch, Graphics, Label, Node, Sprite, tween, Tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { CHAPTER3_ICE_WALL_HP } from '../core/PveConstants';
import type { Coord, FloorState } from '../core/PveTypes';
import { getCachedSprite, loadUiSprite, PVE_BG_KEYS } from '../../ui/UiAssets';
import { applySpriteInsideFixedBox, ensureArtStretch } from '../../ui/UiSprite';

const AOE_HIT_FILL = new Color(255, 140, 0, 110);
const AOE_HIT_STROKE = new Color(255, 140, 0, 230);
const AOE_SAFE_FILL = new Color(90, 200, 120, 70);
const AOE_SAFE_STROKE = new Color(90, 200, 120, 200);
const AOE_WARNING_FILL = new Color(220, 50, 50, 80);
const AOE_WARNING_STROKE = new Color(220, 50, 50, 220);
const ATTACK_TARGET_STROKE = new Color(255, 215, 80, 220);
const NORMAL_MONSTER_ICON_SCALE = 0.68;
const PLAYER_ICON_SCALE = 0.82;
const ELITE_MONSTER_ICON_SCALE = 0.98;
const BOSS_ICON_SCALE = 1.38;
const FROZEN_BORDER_STROKE = new Color(120, 220, 255, 255);
const FOG_REVEAL_DURATION = 0.45;
const FOG_REVEAL_SCALE = 1.08;

type CellRenderContent = {
  entityKey: string;
  entityHpText: string;
  occupantKey: string;
  occupantMeta: string;
};

type CellRenderState = { revealed: boolean; content: string };

function cellContentKey(content: CellRenderContent): string {
  return [
    content.entityKey,
    content.entityHpText,
    content.occupantKey,
    content.occupantMeta,
  ].join(':');
}

function cellRenderContent(floor: FloorState, x: number, y: number): CellRenderContent {
  let occupantKey = 'EMPTY';
  let occupantMeta = '';
  if (floor.player.x === x && floor.player.y === y) {
    occupantKey = 'PLAYER';
  }
  const monster = floor.monsters.find((m) => m.aiState !== 'DEAD' && m.pos.x === x && m.pos.y === y);
  if (monster) {
    if (monster.bossId === 'FATE_MIRROR') {
      occupantKey = 'MONSTER_FATE_MIRROR';
      occupantMeta = monster.shieldStacks === 1 ? 'SHIELD' : '';
    } else {
      occupantKey = `MONSTER_${monster.type}`;
    }
  }

  let entityKey = 'EMPTY';
  let entityHpText = '';
  const atPos = (e: { consumed?: boolean; pos: { x: number; y: number } }) =>
    !e.consumed && e.pos.x === x && e.pos.y === y;
  const entityPriority: Record<string, number> = { PORTAL: 100, EXIT: 90, KEY: 80 };
  const entitiesHere = floor.entities.filter((e) => atPos(e));
  const entity = entitiesHere.length > 1
    ? entitiesHere.reduce((best, e) => (entityPriority[e.type] ?? 0) > (entityPriority[best.type] ?? 0) ? e : best)
    : entitiesHere[0];
  if (entity) {
    entityKey = `ENTITY_${entity.type}`;
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
  private _maxW: number;
  private _maxH: number;
  private _callbacks: FogMapViewCallbacks;
  private _background: Node;
  private _fogLayer: Node;
  private _entityLayer: Node;
  private _unitCells: Node[] = [];
  private _chapter = 1;
  private _hitOverlay: Node;
  private _warningOverlay: Node;
  private _targetOverlay: Node;
  private _bossIconOverlay: Node;
  private _frozenOverlay: Node;

  constructor(parent: Node, maxW: number, maxH: number, callbacks: FogMapViewCallbacks = {}) {
    this._maxW = maxW;
    this._maxH = maxH;
    this._callbacks = callbacks;

    this._root = new Node('FogMapView');
    this._root.setParent(parent);
    this._content = new Node('Content');
    this._content.setParent(this._root);

    this._background = new Node('MapBackground');
    this._background.setParent(this._content);
    this._background.addComponent(UITransform);
    this._background.addComponent(Sprite);

    this._fogLayer = new Node('FogLayer');
    this._fogLayer.setParent(this._content);

    // 单位层：角色/怪物/实体图标 + 文字，独立于 cell，整体提到所有 floor 之上，避免被相邻格草地遮挡
    this._entityLayer = new Node('EntityLayer');
    this._entityLayer.setParent(this._content);

    this._hitOverlay = this._createOverlay('AoeHitOverlay');
    this._warningOverlay = this._createOverlay('AoeWarningOverlay');
    this._targetOverlay = this._createOverlay('AttackTargetOverlay');
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
      loadUiSprite('pve/map/tile_floor_ch1'),
      loadUiSprite('pve/map/tile_selected_frame'),
      loadUiSprite('pve/map/mark_move_range'),
      loadUiSprite('pve/map/mark_attack_range'),
    ]);
    // ch2-5 地板砖与章节背景：非阻塞预热，加载失败静默（ch1 无章节背景图，地图靠瓦片铺满）
    for (let ch = 2; ch <= 5; ch++) {
      void loadUiSprite(`pve/map/tile_floor_ch${ch}`).catch(() => null);
      void loadUiSprite(`pve/backgrounds/bg_pve_ch${ch}`).catch(() => null);
    }
    // ch1 专属怪物图标预热：目前仅 normal 有独立美术，其余沿用通用图标（静默回退）
    void loadUiSprite('pve/map/icon_monster_ch1_normal').catch(() => null);
  }

  private _cellLocalPos(x: number, y: number): Vec3 {
    const half = (this._size - 1) / 2;
    return new Vec3((x - half) * this._cellSize, (half - y) * this._cellSize, 0);
  }

  private _rebuild(size: number): void {
    this._size = size;
    this._cellSize = Math.max(28, Math.floor(Math.min(this._maxW, this._maxH) / size));
    for (const n of this._cells) n.destroy();
    for (const n of this._fogCells) n.destroy();
    for (const n of this._unitCells) n.destroy();
    this._cells = [];
    this._fogCells = [];
    this._unitCells = [];
    this._rendered = [];
    this._background.setSiblingIndex(0);
    this._fogLayer.setSiblingIndex(1);
    this._refreshBackground();

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
        fogNode.addComponent(Sprite);
        fogNode.addComponent(UIOpacity);
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
    // 依次提到末尾，固定层级为：背景/地板 < 迷雾 < 单位 < 战斗提示。
    this._fogLayer.setSiblingIndex(-1);
    this._entityLayer.setSiblingIndex(-1);
    this._hitOverlay.setSiblingIndex(-1);
    this._warningOverlay.setSiblingIndex(-1);
    this._targetOverlay.setSiblingIndex(-1);
    this._bossIconOverlay.setSiblingIndex(-1);
    this._frozenOverlay.setSiblingIndex(-1);

    const bossUi = this._bossIconOverlay.getComponent(UITransform);
    if (bossUi) bossUi.setContentSize(this._cellSize * BOSS_ICON_SCALE, this._cellSize * BOSS_ICON_SCALE);
  }

  private _refreshBackground(): void {
    const mapSize = this._size * this._cellSize;
    const bgUi = this._background.getComponent(UITransform);
    if (bgUi) bgUi.setContentSize(mapSize, mapSize);
    this._background.active = false;
    void this._applyChapterBackground(this._chapter);
  }

  private async _applyChapterBackground(chapter: number): Promise<void> {
    const key = `pve/backgrounds/bg_pve_ch${chapter}`;
    // 无章节背景图的章节（如 ch1，地图靠 floor/fog 瓦片铺满）静默跳过，不触发加载报错
    if ((PVE_BG_KEYS as readonly string[]).indexOf(key) < 0) return;
    const sf = getCachedSprite(key) ?? await loadUiSprite(key).catch(() => null);
    if (!sf || !this._background.isValid) return;
    const mapSize = this._size * this._cellSize;
    ensureArtStretch(this._background, 'Sprite', sf, mapSize, mapSize);
    this._background.active = true;
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
        if (cachedFog) {
          applySpriteInsideFixedBox(fogNode, cachedFog, sz, sz);
        } else {
          void loadUiSprite('pve/map/tile_fog').then((frame) => {
            if (frame && fogNode.isValid) applySpriteInsideFixedBox(fogNode, frame, sz, sz);
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

    // 已探索格保持透明，让整块地图底图透出来；新探索格的雾会淡出。
    if (floorArt) {
      const opacity = floorArt.node.getComponent(UIOpacity) || floorArt.node.addComponent(UIOpacity);
      Tween.stopAllByTarget(opacity);
      floorArt.node.active = true;
      opacity.opacity = 255;
      const chapterKey = `pve/map/tile_floor_ch${this._chapter}`;
      const floorKey = getCachedSprite(chapterKey) ? chapterKey : 'pve/map/tile_floor_ch1';
      const cachedFloor = getCachedSprite(floorKey);
      if (cachedFloor) {
        applySpriteInsideFixedBox(floorArt.node, cachedFloor, sz, sz);
      } else {
        void loadUiSprite(floorKey).then((frame) => {
          if (frame && floorArt.node.isValid) applySpriteInsideFixedBox(floorArt.node, frame, sz, sz);
        });
      }
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
    g.strokeColor = new Color(120, 160, 140, 24);
    g.rect(-sz / 2 + 0.5, -sz / 2 + 0.5, sz - 1, sz - 1);
    g.stroke();

    // ── 顶层：实体图标（玩家/怪物/宝箱/出口等）────────────────
    const [entityKey = 'EMPTY', entityHpText = '', occupantKey = 'EMPTY', occupantMeta = ''] = content.split(':');
    const hasEntity = entityKey !== 'EMPTY';

    // 实体图标映射（不含 EMPTY，地板由底层处理）
    const artMap: Record<string, string> = {
      PLAYER: 'pve/map/icon_player',
      MONSTER_NORMAL: 'pve/map/icon_monster_normal',
      MONSTER_ELITE: 'pve/map/icon_monster_elite',
      MONSTER_ANIMA: 'pve/map/icon_monster_anima',
      MONSTER_BOSS: 'pve/map/icon_monster_boss',
      ENTITY_CHEST: 'pve/map/icon_chest',
      ENTITY_KEY: 'pve/map/icon_key',
      ENTITY_EXIT: 'pve/map/icon_exit',
      ENTITY_PORTAL: 'pve/map/icon_portal',
      ENTITY_IDOL: 'pve/map/icon_idol',
      ENTITY_HOT_SPRING: 'pve/map/icon_hot_spring',
      ENTITY_ALTAR: 'pve/map/icon_altar',
      ENTITY_BLACKSMITH: 'pve/map/icon_blacksmith',
    };
    // 无美术时的汉字兜底（比首字母更直观）
    const glyphFallback: Record<string, string> = {
      ENTITY_PORTAL: '门',
      ENTITY_IDOL: '像',
      ENTITY_HOT_SPRING: '泉',
      ENTITY_ALTAR: '坛',
      ENTITY_BLACKSMITH: '锻',
      ENTITY_CAMP: '营',
      MONSTER_FATE_MIRROR: '镜',
    };

    const paintArt = (sprite: Sprite | undefined, glyphKey: string, boxScale: number, opacityValue = 255): void => {
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
              const typeKey = glyphKey.replace('MONSTER_', '').toLowerCase();
              frame = getCachedSprite(`pve/map/icon_monster_ch${this._chapter}_${typeKey}`);
            }
            if (!frame) frame = await loadUiSprite(artKey);
            if (this._rendered[idx]?.content !== content) return;
            if (frame) {
              const box = sz * boxScale;
              applySpriteInsideFixedBox(sprite.node, frame, box, box);
            }
          })();
        } else {
          sprite.node.active = false;
        }
      }
    };

    const occupantScale = occupantKey === 'MONSTER_BOSS'
      ? BOSS_ICON_SCALE
      : occupantKey === 'MONSTER_ELITE'
        ? ELITE_MONSTER_ICON_SCALE
        : occupantKey === 'PLAYER' && hasEntity
          ? PLAYER_ICON_SCALE
          : NORMAL_MONSTER_ICON_SCALE;
    paintArt(entityArt, entityKey, entityKey === 'ENTITY_ICE_WALL' ? 0.74 : 0.84);
    paintArt(occupantArt, occupantKey, occupantScale, occupantKey === 'PLAYER' && hasEntity ? 238 : 255);

    if (lbl) {
      const missingOccupantArt = occupantKey !== 'EMPTY' && artMap[occupantKey] === undefined;
      const missingEntityArt = entityKey !== 'EMPTY' && artMap[entityKey] === undefined;
      const glyphKey = missingOccupantArt ? occupantKey : missingEntityArt ? entityKey : 'EMPTY';
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

  refresh(floor: FloorState): void {
    this._chapter = Math.ceil(floor.floor / 5);
    if (floor.size !== this._size) this._rebuild(floor.size);
    this._refreshBackground();
    for (let y = 0; y < floor.size; y++) {
      for (let x = 0; x < floor.size; x++) {
        const idx = y * floor.size + x;
        const node = this._cells[idx];
        if (!node) continue;
        const revealed = floor.revealed[y]?.[x] ?? false;
        const content = revealed ? cellContentKey(cellRenderContent(floor, x, y)) : cellContentKey({
          entityKey: 'EMPTY',
          entityHpText: '',
          occupantKey: 'EMPTY',
          occupantMeta: '',
        });
        const prev = this._rendered[idx];
        if (prev && prev.revealed === revealed && prev.content === content) continue;
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
    const boss = floor.monsters.find((m) => m.type === 'BOSS' && m.aiState !== 'DEAD');
    const sf = this._bossIconOverlay.getComponent(Sprite);
    if (!boss || !(floor.revealed[boss.pos.y]?.[boss.pos.x] ?? false) || !sf) {
      this._bossIconOverlay.active = false;
      return;
    }
    this._bossIconOverlay.active = true;
    void loadUiSprite('pve/map/icon_monster_boss').then((frame) => {
      if (frame) sf.spriteFrame = frame;
    });
    this._bossIconOverlay.setPosition(this._cellLocalPos(boss.pos.x, boss.pos.y));
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
    this._paintAoeOverlay(g, cells, AOE_WARNING_FILL, AOE_WARNING_STROKE);
  }

  clearAoeWarning(): void {
    this._warningOverlay.getComponent(Graphics)?.clear();
  }

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

  moveBossIconTo(cell: Coord): void {
    if (!this._bossIconOverlay.active) return;
    this._bossIconOverlay.setPosition(this._cellLocalPos(cell.x, cell.y));
  }

  get node(): Node {
    return this._root;
  }

  destroy(): void {
    this._root.destroy();
  }
}
