const { DIAMOND_CELL_REWARD } = require('./constants');

/** 0, 50, …, 500 */
const RANDOM_0_500_POOL = [];
for (let v = 0; v <= 500; v += 50) RANDOM_0_500_POOL.push(v);

/** -200, -150, …, 400 */
const RANDOM_NEG200_400_POOL = [];
for (let v = -200; v <= 400; v += 50) RANDOM_NEG200_400_POOL.push(v);

function pickFromPool(pool, rng = Math.random) {
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * 计算金币格数值 → AC-8
 * @param {string} variant
 * @param {boolean} doomActive
 * @param {() => number} [rng]
 */
function resolveGoldAmount(variant, doomActive, rng = Math.random) {
  let amount;
  switch (variant) {
    case 'FIXED_100':
      amount = 100;
      break;
    case 'FIXED_200':
      amount = 200;
      break;
    case 'FIXED_300':
      amount = 300;
      break;
    case 'RANDOM_0_500':
      amount = pickFromPool(RANDOM_0_500_POOL, rng);
      break;
    case 'RANDOM_NEG200_400':
      amount = doomActive ? -200 : pickFromPool(RANDOM_NEG200_400_POOL, rng);
      break;
    default:
      amount = 0;
  }

  if (doomActive && variant !== 'RANDOM_NEG200_400' && amount > 0) {
    amount = -amount;
  }
  return amount;
}

/**
 * 应用落点效果（不含移动）
 * @returns {{ type: string, message: string, goldDelta?: number, diamondDelta?: number }[]}
 */
function applyCellLanding(game, player, cellIndex, rng = Math.random) {
  const cell = game.boardCells[cellIndex];
  if (!cell) return [];

  const doomActive = (player.doomRemainingTurns || 0) > 0;
  const events = [];
  const actorSeat = player.seat;

  if (cell.type === 'GOLD') {
    const delta = resolveGoldAmount(cell.goldVariant, doomActive, rng);
    player.gold += delta;
    events.push({
      type: 'GOLD',
      message: `金币 ${delta >= 0 ? '+' : ''}${delta}`,
      goldDelta: delta,
      actorSeat,
    });
  } else if (cell.type === 'DIAMOND') {
    player.diamond += DIAMOND_CELL_REWARD;
    relocateDiamond(game, cellIndex, rng);
    events.push({
      type: 'DIAMOND',
      message: `+${DIAMOND_CELL_REWARD} 钻石`,
      diamondDelta: DIAMOND_CELL_REWARD,
      actorSeat,
    });
  } else if (cell.type === 'EVENT') {
    player.doomRemainingTurns = 2;
    events.push({
      type: 'EVENT',
      message: '厄运降临！接下来 2 回合内金币收益变损失',
      actorSeat,
    });
  } else if (cell.type === 'NORMAL') {
    events.push({
      type: 'NORMAL',
      message: '普通格，本格无额外效果',
      actorSeat,
    });
  } else if (cell.type === 'MINIGAME') {
    game.phase = 'MINIGAME_BLUFF';
    game.bluffState = {
      phase: 'SHAKING',
      triggerSeat: player.seat,
      currentSeat: player.seat,
      eliminatedSeats: [],
      eliminationOrder: [],
      shakenSeats: [],
    };
    events.push({
      type: 'MINIGAME',
      message: '踩中小游戏格，进入吹牛',
      actorSeat,
    });
  }

  return events;
}

/** 钻石格被踩后变普通，在普通格随机重生 → AC-9 */
function relocateDiamond(game, fromIndex, rng = Math.random) {
  const from = game.boardCells[fromIndex];
  if (!from) return;

  from.type = 'NORMAL';
  delete from.goldVariant;

  const normals = game.boardCells.filter((c) => c.type === 'NORMAL');
  if (!normals.length) return;

  const pick = normals[Math.floor(rng() * normals.length)];
  pick.type = 'DIAMOND';
  game.diamondCellIndex = pick.index;
}

module.exports = {
  RANDOM_0_500_POOL,
  RANDOM_NEG200_400_POOL,
  resolveGoldAmount,
  applyCellLanding,
  relocateDiamond,
  pickFromPool,
};
