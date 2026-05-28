const {
  BLUFF_TURN_TIMEOUT_MS,
  BLUFF_GOLD_REWARDS,
} = require('./constants');
const { nextActiveSeat } = require('./GameEngine');

const DICE_PER_PLAYER = 5;

function activeBluffSeats(game, bluffState) {
  return game.players
    .map((p) => p.seat)
    .filter((seat) => !bluffState.eliminatedSeats.includes(seat));
}

function findPlayerByOpenId(game, openId) {
  return game.players.find((p) => p.openId === openId && !p.isDefeated);
}

function rollDiceArray(rng = Math.random) {
  const dice = [];
  for (let i = 0; i < DICE_PER_PLAYER; i++) {
    dice.push(1 + Math.floor(rng() * 6));
  }
  return dice;
}

/** 统计全场骰子是否满足叫点（1 为赖子，叫 1 时仅计 1） */
function countDiceForBid(allDiceArrays, face) {
  return countDiceBreakdown(allDiceArrays, face).total;
}

/** @returns {{ total: number, faceOnly: number, wildOnes: number }} */
function countDiceBreakdown(allDiceArrays, face) {
  let faceOnly = 0;
  let wildOnes = 0;
  for (const arr of allDiceArrays) {
    for (const d of arr) {
      if (face === 1) {
        if (d === 1) faceOnly += 1;
      } else if (d === face) {
        faceOnly += 1;
      } else if (d === 1) {
        wildOnes += 1;
      }
    }
  }
  return { total: faceOnly + wildOnes, faceOnly, wildOnes };
}

function isValidBid(lastBid, count, face) {
  if (face < 1 || face > 6 || count < 1) return false;
  if (!lastBid) return true;
  if (count > lastBid.count) return true;
  if (count === lastBid.count && face > lastBid.face) return true;
  return false;
}

function nextBluffSeat(game, bluffState, fromSeat) {
  const active = activeBluffSeats(game, bluffState);
  if (!active.length) return fromSeat;
  const n = game.players.length;
  for (let i = 1; i <= n; i++) {
    const seat = (fromSeat + i) % n;
    if (active.includes(seat)) return seat;
  }
  return fromSeat;
}

function getRewardForRank(playerCount, rank) {
  const table = BLUFF_GOLD_REWARDS[playerCount] || [];
  return table[rank - 1] || 0;
}

function buildRankings(winnerSeat, eliminationOrder, playerCount) {
  const ranked = [{ seat: winnerSeat, rank: 1 }];
  const reversed = [...eliminationOrder].reverse();
  reversed.forEach((seat, i) => {
    ranked.push({ seat, rank: i + 2 });
  });
  ranked.forEach((r) => {
    r.goldReward = getRewardForRank(playerCount, r.rank);
  });
  return ranked;
}

function applyBluffGoldRewards(game, rankings) {
  rankings.forEach((r) => {
    const p = game.players[r.seat];
    if (p && r.goldReward) {
      p.gold += r.goldReward;
    }
  });
}

function finishBluff(game, bluffState) {
  const active = activeBluffSeats(game, bluffState);
  const winnerSeat = active[0];
  const elim = bluffState.eliminationOrder || [];
  const rankings = buildRankings(winnerSeat, elim, game.players.length);
  applyBluffGoldRewards(game, rankings);

  bluffState.phase = 'DONE';
  bluffState.rankings = rankings;
  const rankLines = rankings.map((r) => {
    const p = game.players[r.seat];
    const label = p?.nickname || `座位${r.seat + 1}`;
    return `${label} 第${r.rank}名 +${r.goldReward} 金`;
  });
  const lastOpenResult = bluffState.lastOpenResult
    ? JSON.parse(JSON.stringify(bluffState.lastOpenResult))
    : undefined;
  game.lastEvent = {
    type: 'BLUFF_END',
    message: `吹牛结束\n${rankLines.join('\n')}`,
    lastOpenResult,
  };

  game.phase = 'BOARD';
  let seat = bluffState.triggerSeat;
  if (bluffState.eliminatedSeats.includes(seat)) {
    seat = winnerSeat;
  }
  game.currentSeat = seat;
  game.updatedAt = Date.now();
  return rankings;
}

function ensureBluffPhase(game) {
  if (game.phase !== 'MINIGAME_BLUFF' || !game.bluffState) {
    const err = new Error('NOT_BLUFF_PHASE');
    err.code = 'NOT_BLUFF_PHASE';
    throw err;
  }
}

function ensureCurrentBluffPlayer(game, openId) {
  const player = findPlayerByOpenId(game, openId);
  if (!player) {
    const err = new Error('PLAYER_NOT_IN_GAME');
    err.code = 'PLAYER_NOT_IN_GAME';
    throw err;
  }
  if (player.seat !== game.bluffState.currentSeat) {
    const err = new Error('NOT_YOUR_TURN');
    err.code = 'NOT_YOUR_TURN';
    throw err;
  }
  if (game.bluffState.eliminatedSeats.includes(player.seat)) {
    const err = new Error('PLAYER_ELIMINATED');
    err.code = 'PLAYER_ELIMINATED';
    throw err;
  }
  return player;
}

function allActiveShaken(game, bluffState) {
  const active = activeBluffSeats(game, bluffState);
  return active.every((seat) => bluffState.shakenSeats.includes(seat));
}

function clearLastBid(bluffState) {
  if (bluffState.lastBid != null) {
    delete bluffState.lastBid;
  }
}

function startBiddingPhase(game, bluffState) {
  bluffState.phase = 'BIDDING';
  clearLastBid(bluffState);
  let start = bluffState.triggerSeat;
  if (bluffState.eliminatedSeats.includes(start)) {
    start = nextBluffSeat(game, bluffState, start);
  }
  bluffState.currentSeat = start;
  bluffState.turnDeadline = Date.now() + BLUFF_TURN_TIMEOUT_MS;
}

/**
 * 摇骰 → 私有骰子不入 games 文档
 * @param {object} game
 * @param {string} openId
 * @param {(gameId: string, openId: string, dice: number[]) => Promise<void>} persistDice
 * @param {() => number} [rng]
 */
async function bluffShake(game, gameId, openId, persistDice, rng = Math.random) {
  ensureBluffPhase(game);
  const bs = game.bluffState;
  if (bs.phase !== 'SHAKING') {
    const err = new Error('BLUFF_NOT_SHAKING');
    err.code = 'BLUFF_NOT_SHAKING';
    throw err;
  }

  const player = findPlayerByOpenId(game, openId);
  if (!player) {
    const err = new Error('PLAYER_NOT_IN_GAME');
    err.code = 'PLAYER_NOT_IN_GAME';
    throw err;
  }
  if (bs.eliminatedSeats.includes(player.seat)) {
    const err = new Error('PLAYER_ELIMINATED');
    err.code = 'PLAYER_ELIMINATED';
    throw err;
  }
  if (bs.shakenSeats.includes(player.seat)) {
    const err = new Error('ALREADY_SHAKEN');
    err.code = 'ALREADY_SHAKEN';
    throw err;
  }

  const myDice = rollDiceArray(rng);
  await persistDice(gameId, openId, myDice);

  bs.shakenSeats.push(player.seat);
  if (allActiveShaken(game, bs)) {
    startBiddingPhase(game, bs);
  }
  game.updatedAt = Date.now();
  return { myDice, bluffState: bs, game };
}

/**
 * 叫点
 */
function bluffBid(game, openId, count, face) {
  ensureBluffPhase(game);
  const bs = game.bluffState;
  if (bs.phase !== 'BIDDING') {
    const err = new Error('BLUFF_NOT_BIDDING');
    err.code = 'BLUFF_NOT_BIDDING';
    throw err;
  }

  ensureCurrentBluffPlayer(game, openId);
  if (!isValidBid(bs.lastBid, count, face)) {
    const err = new Error('INVALID_BID');
    err.code = 'INVALID_BID';
    throw err;
  }

  const player = findPlayerByOpenId(game, openId);
  bs.lastBid = { count, face, seat: player.seat };
  bs.currentSeat = nextBluffSeat(game, bs, player.seat);
  bs.turnDeadline = Date.now() + BLUFF_TURN_TIMEOUT_MS;
  game.updatedAt = Date.now();
  return { bluffState: bs };
}

/**
 * 开牌判定
 * @param {() => Promise<Record<string, number[]>>} loadAllDice openId -> dice
 */
async function bluffOpen(game, openId, loadAllDice, isAuto = false) {
  ensureBluffPhase(game);
  const bs = game.bluffState;
  if (bs.phase !== 'BIDDING') {
    const err = new Error('BLUFF_NOT_BIDDING');
    err.code = 'BLUFF_NOT_BIDDING';
    throw err;
  }

  if (!bs.lastBid) {
    const err = new Error('NO_BID_TO_OPEN');
    err.code = 'NO_BID_TO_OPEN';
    throw err;
  }

  if (!isAuto) {
    ensureCurrentBluffPlayer(game, openId);
    const opener = findPlayerByOpenId(game, openId);
    if (bs.lastBid.seat === opener.seat) {
      const err = new Error('CANNOT_OPEN_OWN_BID');
      err.code = 'CANNOT_OPEN_OWN_BID';
      throw err;
    }
  } else {
    const cur = game.players[bs.currentSeat];
    if (!cur || cur.openId !== openId) {
      const err = new Error('NOT_YOUR_TURN');
      err.code = 'NOT_YOUR_TURN';
      throw err;
    }
  }

  const allDiceMap = await loadAllDice();
  const active = activeBluffSeats(game, bs);
  const diceArrays = active
    .filter((seat) => bs.shakenSeats.includes(seat))
    .map((seat) => {
      const p = game.players[seat];
      const dice = allDiceMap[p.openId];
      if (!dice || !dice.length) {
        const err = new Error('BLUFF_DICE_MISSING');
        err.code = 'BLUFF_DICE_MISSING';
        throw err;
      }
      return dice;
    });

  if (diceArrays.length !== active.filter((s) => bs.shakenSeats.includes(s)).length) {
    const err = new Error('BLUFF_NOT_ALL_SHAKEN');
    err.code = 'BLUFF_NOT_ALL_SHAKEN';
    throw err;
  }

  const breakdown = countDiceBreakdown(diceArrays, bs.lastBid.face);
  const actual = breakdown.total;
  const bidderWins = actual >= bs.lastBid.count;
  const loserSeat = bidderWins ? bs.currentSeat : bs.lastBid.seat;

  if (!bs.eliminationOrder) bs.eliminationOrder = [];
  if (!bs.eliminationOrder.includes(loserSeat)) {
    bs.eliminationOrder.push(loserSeat);
  }
  if (!bs.eliminatedSeats.includes(loserSeat)) {
    bs.eliminatedSeats.push(loserSeat);
  }

  bs.lastOpenResult = {
    actual,
    faceOnly: breakdown.faceOnly,
    wildOnes: breakdown.wildOnes,
    bid: { ...bs.lastBid },
    loserSeat,
    openerSeat: bs.currentSeat,
  };
  clearLastBid(bs);

  const remaining = activeBluffSeats(game, bs);
  let rankings = null;
  if (remaining.length <= 1) {
    rankings = finishBluff(game, bs);
    game.bluffState = undefined;
  } else {
    bs.currentSeat = nextBluffSeat(game, bs, loserSeat);
    bs.turnDeadline = Date.now() + BLUFF_TURN_TIMEOUT_MS;
  }

  game.updatedAt = Date.now();
  return { bluffState: bs, rankings, openResult: bs.lastOpenResult };
}

/** 30s 超时：有叫点则自动开，否则当前玩家自动叫 1 个 2 点 */
async function maybeBluffTimeout(game, openId, loadAllDice) {
  const bs = game.bluffState;
  if (!bs || game.phase !== 'MINIGAME_BLUFF') return null;
  if (bs.phase !== 'BIDDING') return null;
  if (!bs.turnDeadline || Date.now() < bs.turnDeadline) return null;

  const cur = game.players[bs.currentSeat];
  if (!cur) return null;

  if (bs.lastBid) {
    await bluffOpen(game, cur.openId, loadAllDice, true);
    return { bluffState: bs, game };
  }

  bluffBid(game, cur.openId, 1, 2);
  return { bluffState: bs, game };
}

module.exports = {
  bluffShake,
  bluffBid,
  bluffOpen,
  maybeBluffTimeout,
  countDiceForBid,
  countDiceBreakdown,
  isValidBid,
  rollDiceArray,
  finishBluff,
  activeBluffSeats,
  getRewardForRank,
};
