const { BOARD_SIZE, DIAMOND_CELL_REWARD } = require('./constants');

const LAYOUT = {
  DIAMOND: 1,
  GOLD: 20,
  EVENT: 5,
  MINIGAME: 25,
};

const GOLD_VARIANTS = [
  'FIXED_100',
  'FIXED_200',
  'FIXED_300',
  'RANDOM_0_500',
  'RANDOM_NEG200_400',
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickGoldVariant() {
  return GOLD_VARIANTS[Math.floor(Math.random() * GOLD_VARIANTS.length)];
}

/** 随机 58 格布局 → AC-6（开局用） */
function generateBoardCells() {
  const indices = shuffle(Array.from({ length: BOARD_SIZE }, (_, i) => i));
  let cursor = 0;
  const diamondIdx = indices[cursor++];
  const goldIdxs = indices.slice(cursor, (cursor += LAYOUT.GOLD));
  const eventIdxs = indices.slice(cursor, (cursor += LAYOUT.EVENT));
  const miniIdxs = indices.slice(cursor, (cursor += LAYOUT.MINIGAME));

  const cells = Array.from({ length: BOARD_SIZE }, (_, index) => ({
    index,
    type: 'NORMAL',
  }));

  cells[diamondIdx].type = 'DIAMOND';
  goldIdxs.forEach((i) => {
    cells[i].type = 'GOLD';
    cells[i].goldVariant = pickGoldVariant();
  });
  eventIdxs.forEach((i) => {
    cells[i].type = 'EVENT';
  });
  miniIdxs.forEach((i) => {
    cells[i].type = 'MINIGAME';
  });

  return { boardCells: cells, diamondCellIndex: diamondIdx };
}

function countCellTypes(boardCells) {
  const counts = { NORMAL: 0, GOLD: 0, DIAMOND: 0, EVENT: 0, MINIGAME: 0 };
  boardCells.forEach((c) => {
    counts[c.type] = (counts[c.type] || 0) + 1;
  });
  return counts;
}

function validateBoardLayout(boardCells) {
  const counts = countCellTypes(boardCells);
  const expectedNormal =
    BOARD_SIZE -
    LAYOUT.DIAMOND -
    LAYOUT.GOLD -
    LAYOUT.EVENT -
    LAYOUT.MINIGAME;
  return (
    counts.DIAMOND === LAYOUT.DIAMOND &&
    counts.GOLD === LAYOUT.GOLD &&
    counts.EVENT === LAYOUT.EVENT &&
    counts.MINIGAME === LAYOUT.MINIGAME &&
    counts.NORMAL === expectedNormal
  );
}

function createInitialGameDoc({ gameId, roomId, players }) {
  const { boardCells, diamondCellIndex } = generateBoardCells();
  const now = Date.now();

  return {
    roomId,
    phase: 'BOARD',
    players: players.map((p, seat) => ({
      userId: p.userId,
      openId: p.openId,
      nickname: p.nickname || `玩家${seat + 1}`,
      seat,
      position: 0,
      lap: 0,
      gold: 0,
      diamond: 0,
      isOnline: true,
      isDefeated: false,
      doomRemainingTurns: 0,
    })),
    boardCells,
    diamondCellIndex,
    currentSeat: 0,
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
  DIAMOND_CELL_REWARD,
  LAYOUT,
};
