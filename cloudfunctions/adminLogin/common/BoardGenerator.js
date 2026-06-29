const {
  BOARD_SIZE,
  DIAMOND_CELL_STOCK,
  GOLD_CELL_STOCK,
  INITIAL_HP,
  NEUTRAL_CREATURE_HP,
  SUPPLY_CELL_COUNT,
  TURN_TIMEOUT_MS,
} = require('./constants');

/**
 * 75 格棋盘特殊格总数（全图合计，与下方 ZONE_LAYOUT 之和一致）
 *
 * | 类型            | 数量 | 说明           |
 * |-----------------|------|----------------|
 * | NORMAL          | 34   | 其余为空格     |
 * | GOLD            | 14   | 金币格         |
 * | DIAMOND         | 3    | 钻石格         |
 * | LUCKY           | 6    | 幸运格         |
 * | SUPPLY          | 3    | 补给格         |
 * | EVENT           | 6    | 事件格         |
 * | GOLD_SHOP       | 4    | 金币商店       |
 * | LEGENDARY_SHOP  | 3    | 传说商店       |
 *
 * 前 35 格（索引 0–34）偏资源；商店见 SHOP_RING_TEMPLATE。
 * 任意两商店格环形路径距离 ≥ SHOP_MIN_DISTANCE。
 * 75 格环上间距 10 最多放 7 个商店（原 9 个需减至 7）；其中前段至少 3 个。
 */
const LAYOUT = {
  DIAMOND: 3,
  GOLD: 14,
  SUPPLY: SUPPLY_CELL_COUNT,
  EVENT: 6,
  GOLD_SHOP: 4,
  LEGENDARY_SHOP: 3,
  LUCKY: 6,
};

/** 前段：索引 0 … EARLY_ZONE_SIZE-1 */
const EARLY_ZONE_SIZE = 35;

/** 商店格之间最少间隔（沿棋盘环状路径） */
const SHOP_MIN_DISTANCE = 10;

const ZONE_LAYOUT = {
  early: {
    DIAMOND: 2,
    GOLD: 10,
    LUCKY: 5,
    SUPPLY: 2,
    EVENT: 3,
  },
  late: {
    DIAMOND: 1,
    GOLD: 4,
    LUCKY: 1,
    SUPPLY: 1,
    EVENT: 3,
  },
};

const GOLD_VARIANTS = [
  'FIXED_100',
  'FIXED_200',
  'FIXED_300',
  'RANDOM_0_500',
  'RANDOM_NEG200_400',
];

const ALL_CELL_TYPES = [
  'NORMAL',
  'GOLD',
  'DIAMOND',
  'SUPPLY',
  'WASTE',
  'BURNING',
  'EVENT',
  'MINIGAME',
  'GOLD_SHOP',
  'LEGENDARY_SHOP',
  'LUCKY',
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ringDistance(a, b, size = BOARD_SIZE) {
  const d = Math.abs(a - b);
  return Math.min(d, size - d);
}

/**
 * 7 个商店固定索引（两两环形间距 ≥10）。
 * 前段 3 个尽量靠后（9/19/34），后段 4 个均匀分布。
 */
const SHOP_RING_TEMPLATE = [9, 19, 34, 44, 54, 64, 74];

const LEGENDARY_SHOP_INDICES = [34, 54, 74];

/**
 * @typedef {object} BoardCell
 * @property {number} index
 * @property {string} type
 * @property {number} [initialStock]
 * @property {number} [stock]
 * @property {number} [claimCount]
 * @property {boolean} [depleted]
 * @property {string} [goldVariant]
 * @property {string | null} [crate]
 */

function placeShopIndices() {
  const goldShopIdxs = SHOP_RING_TEMPLATE.filter(
    (i) => !LEGENDARY_SHOP_INDICES.includes(i),
  );
  const legendaryShopIdxs = LEGENDARY_SHOP_INDICES.slice();

  if (
    goldShopIdxs.length !== LAYOUT.GOLD_SHOP ||
    legendaryShopIdxs.length !== LAYOUT.LEGENDARY_SHOP
  ) {
    throw new Error('[BoardGenerator] shop placement failed');
  }
  return { goldShopIdxs, legendaryShopIdxs };
}

function pickZoneIndices(zoneName, type, occupied) {
  const count = ZONE_LAYOUT[zoneName][type];
  if (!count) return [];
  const from =
    zoneName === 'early'
      ? Array.from({ length: EARLY_ZONE_SIZE }, (_, i) => i)
      : Array.from(
          { length: BOARD_SIZE - EARLY_ZONE_SIZE },
          (_, i) => i + EARLY_ZONE_SIZE,
        );
  const pool = from.filter((i) => !occupied.includes(i));
  return shuffle(pool).slice(0, count);
}

function pickGoldVariant() {
  return GOLD_VARIANTS[Math.floor(Math.random() * GOLD_VARIANTS.length)];
}

function createDefaultItems() {
  return { doubleDice: 0, trap: 0, medkit: 0 };
}

function createDefaultShopStock() {
  return {
    goldShopVersion: 0,
    legendaryShopVersion: 0,
    goldShop: {
      SWORD: true,
      MARCHING_SHOES: true,
      DOUBLE_DICE: true,
      TRAP: true,
    },
    legendaryShop: {
      GUN: true,
      MEDKIT: true,
    },
    finalShop: {
      WEAPON_UPGRADE: true,
      DIVINE_STRIKE: true,
    },
  };
}

function createDefaultTurnActions() {
  return {
    rolled: false,
    usedItem: false,
    attacked: false,
    extraRollAvailable: false,
    extraRolled: false,
  };
}

function createNeutralCreatures() {
  return [0, 1, 2].map((regionIndex) => ({
    regionIndex,
    hp: NEUTRAL_CREATURE_HP,
    maxHp: NEUTRAL_CREATURE_HP,
    defeated: false,
    damageBySeat: {},
  }));
}

function expectedNormalCount() {
  return (
    BOARD_SIZE -
    LAYOUT.DIAMOND -
    LAYOUT.GOLD -
    LAYOUT.SUPPLY -
    LAYOUT.EVENT -
    LAYOUT.GOLD_SHOP -
    LAYOUT.LEGENDARY_SHOP -
    LAYOUT.LUCKY
  );
}

/** 分区随机 75 格布局 → AC-1, AC-5 */
function generateBoardCells() {
  const { goldShopIdxs, legendaryShopIdxs } = placeShopIndices();
  let occupied = goldShopIdxs.concat(legendaryShopIdxs);

  const diamondIdxs = pickZoneIndices('early', 'DIAMOND', occupied)
    .concat(pickZoneIndices('late', 'DIAMOND', occupied));
  occupied = occupied.concat(diamondIdxs);

  const goldIdxs = pickZoneIndices('early', 'GOLD', occupied).concat(
    pickZoneIndices('late', 'GOLD', occupied),
  );
  occupied = occupied.concat(goldIdxs);

  const luckyIdxs = pickZoneIndices('early', 'LUCKY', occupied).concat(
    pickZoneIndices('late', 'LUCKY', occupied),
  );
  occupied = occupied.concat(luckyIdxs);

  const supplyIdxs = pickZoneIndices('early', 'SUPPLY', occupied).concat(
    pickZoneIndices('late', 'SUPPLY', occupied),
  );
  occupied = occupied.concat(supplyIdxs);

  const eventIdxs = pickZoneIndices('early', 'EVENT', occupied).concat(
    pickZoneIndices('late', 'EVENT', occupied),
  );
  occupied = occupied.concat(eventIdxs);


  /** @type {BoardCell[]} */
  const cells = Array.from({ length: BOARD_SIZE }, (_, index) => ({
    index,
    type: 'NORMAL',
  }));

  diamondIdxs.forEach((i) => {
    cells[i].type = 'DIAMOND';
    cells[i].initialStock = DIAMOND_CELL_STOCK;
    cells[i].stock = DIAMOND_CELL_STOCK;
    cells[i].claimCount = 0;
    cells[i].depleted = false;
  });
  goldIdxs.forEach((i) => {
    cells[i].type = 'GOLD';
    cells[i].goldVariant = pickGoldVariant();
    cells[i].initialStock = GOLD_CELL_STOCK;
    cells[i].stock = GOLD_CELL_STOCK;
    cells[i].claimCount = 0;
    cells[i].depleted = false;
  });
  supplyIdxs.forEach((i) => {
    cells[i].type = 'SUPPLY';
    cells[i].crate = null;
  });
  eventIdxs.forEach((i) => {
    cells[i].type = 'EVENT';
  });
  goldShopIdxs.forEach((i) => {
    cells[i].type = 'GOLD_SHOP';
  });
  legendaryShopIdxs.forEach((i) => {
    cells[i].type = 'LEGENDARY_SHOP';
  });
  luckyIdxs.forEach((i) => {
    cells[i].type = 'LUCKY';
  });

  return { boardCells: cells, diamondCellIndex: diamondIdxs[0] };
}

function countCellTypes(boardCells) {
  const counts = {};
  ALL_CELL_TYPES.forEach((t) => {
    counts[t] = 0;
  });
  boardCells.forEach((c) => {
    counts[c.type] = (counts[c.type] || 0) + 1;
  });
  return counts;
}

function minShopDistance(boardCells) {
  const shops = boardCells
    .map((c, index) => ({ index, type: c.type }))
    .filter((c) => c.type === 'GOLD_SHOP' || c.type === 'LEGENDARY_SHOP');
  if (shops.length < 2) return BOARD_SIZE;
  let min = BOARD_SIZE;
  for (let i = 0; i < shops.length; i++) {
    for (let j = i + 1; j < shops.length; j++) {
      min = Math.min(min, ringDistance(shops[i].index, shops[j].index));
    }
  }
  return min;
}

function validateBoardLayout(boardCells) {
  const counts = countCellTypes(boardCells);
  return (
    boardCells.length === BOARD_SIZE &&
    counts.DIAMOND === LAYOUT.DIAMOND &&
    counts.GOLD === LAYOUT.GOLD &&
    counts.SUPPLY === LAYOUT.SUPPLY &&
    counts.EVENT === LAYOUT.EVENT &&
    (counts.MINIGAME || 0) === 0 &&
    counts.GOLD_SHOP === LAYOUT.GOLD_SHOP &&
    counts.LEGENDARY_SHOP === LAYOUT.LEGENDARY_SHOP &&
    counts.LUCKY === LAYOUT.LUCKY &&
    counts.NORMAL === expectedNormalCount() &&
    minShopDistance(boardCells) >= SHOP_MIN_DISTANCE
  );
}

function pickRandomFirstSeat(playerCount) {
  if (playerCount <= 1) return 0;
  return Math.floor(Math.random() * playerCount);
}

function createInitialGameDoc({ gameId, roomId, players, gameName }) {
  const { boardCells, diamondCellIndex } = generateBoardCells();
  const now = Date.now();
  const firstSeat = pickRandomFirstSeat(players.length);

  return {
    roomId,
    gameName: gameName || '玩家的房间',
    phase: 'BOARD',
    survivalPhase: 'DEVELOPMENT',
    boardSize: BOARD_SIZE,
    players: players.map((p, seat) => ({
      userId: p.userId,
      openId: p.openId,
      nickname: p.nickname || `玩家${seat + 1}`,
      isBot: !!p.isBot,
      seat,
      position: 0,
      lap: 0,
      gold: 0,
      diamond: 0,
      isOnline: true,
      isDefeated: false,
      hp: INITIAL_HP,
      maxHp: INITIAL_HP,
      kills: 0,
      weaponAttackBonus: 0,
      weaponInventory: {},
      items: createDefaultItems(),
      shopStock: createDefaultShopStock(),
      turnActions: createDefaultTurnActions(),
      visitedRegionsThisTurn: [],
      doomRemainingTurns: 0,
      vampireStone: false,
    })),
    boardCells,
    diamondCellIndex,
    neutralCreatures: createNeutralCreatures(),
    traps: [],
    pendingInteraction: null,
    movePause: null,
    luckySpin: null,
    finalShopsSpawned: false,
    lastEvents: [],
    currentSeat: firstSeat,
    turnDeadlineAt: now + TURN_TIMEOUT_MS,
    actionRoundCount: 0,
    rolledSeatsThisRound: [],
    startedAt: now,
    updatedAt: now,
    version: 0,
  };
}

module.exports = {
  generateBoardCells,
  createInitialGameDoc,
  countCellTypes,
  validateBoardLayout,
  minShopDistance,
  createDefaultItems,
  createDefaultShopStock,
  createDefaultTurnActions,
  createNeutralCreatures,
  LAYOUT,
  ZONE_LAYOUT,
  EARLY_ZONE_SIZE,
  SHOP_MIN_DISTANCE,
};
