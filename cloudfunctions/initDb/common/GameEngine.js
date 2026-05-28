const {
  BOARD_SIZE,
  TARGET_LAPS,
  TARGET_ACTION_ROUNDS,
  DICE_MAX,
} = require('./constants');
const { applyCellLanding } = require('./CellResolver');
const { forceSettle } = require('./Settlement');

function findPlayerByOpenId(game, openId) {
  return game.players.find((p) => p.openId === openId && !p.isDefeated);
}

function nextActiveSeat(game, fromSeat) {
  const n = game.players.length;
  for (let i = 1; i <= n; i++) {
    const seat = (fromSeat + i) % n;
    if (!game.players[seat].isDefeated) return seat;
  }
  return fromSeat;
}

function activeSeats(game) {
  return game.players.filter((p) => !p.isDefeated).map((p) => p.seat);
}

/** 该座位本行动回合已掷骰结束；全员各掷一次则 actionRoundCount +1 */
function markSeatRolledThisRound(game, seat) {
  const active = activeSeats(game);
  if (!active.includes(seat)) return;

  if (!Array.isArray(game.rolledSeatsThisRound)) {
    game.rolledSeatsThisRound = [];
  }
  game.rolledSeatsThisRound = game.rolledSeatsThisRound.filter((s) =>
    active.includes(s),
  );
  if (!game.rolledSeatsThisRound.includes(seat)) {
    game.rolledSeatsThisRound.push(seat);
  }

  if (
    active.length > 0 &&
    active.every((s) => game.rolledSeatsThisRound.includes(s))
  ) {
    game.actionRoundCount = (game.actionRoundCount || 0) + 1;
    game.rolledSeatsThisRound = [];
  }
}

function checkGameEnd(game) {
  if (game.phase === 'SETTLED') return false;

  if ((game.actionRoundCount || 0) >= TARGET_ACTION_ROUNDS) {
    forceSettle(game, 'ACTION_ROUNDS');
    return true;
  }

  if (game.players.some((p) => !p.isDefeated && p.lap >= TARGET_LAPS)) {
    forceSettle(game, 'LAP');
    return true;
  }

  return false;
}

/**
 * 权威掷骰 → AC-7, AC-14
 * 1～6 正常步数；7 前进 7 格且可再掷一次（不切换回合）
 * @param {object} game 可变对局文档
 * @param {string} openId
 * @param {() => number} [rng]
 */
function rollDice(game, openId, rng = Math.random) {
  if (game.phase === 'SETTLED') {
    const err = new Error('GAME_ALREADY_SETTLED');
    err.code = 'GAME_ALREADY_SETTLED';
    throw err;
  }
  if (game.phase !== 'BOARD') {
    const err = new Error('NOT_BOARD_PHASE');
    err.code = 'NOT_BOARD_PHASE';
    throw err;
  }

  const player = findPlayerByOpenId(game, openId);
  if (!player) {
    const err = new Error('PLAYER_NOT_IN_GAME');
    err.code = 'PLAYER_NOT_IN_GAME';
    throw err;
  }
  if (player.seat !== game.currentSeat) {
    const err = new Error('NOT_YOUR_TURN');
    err.code = 'NOT_YOUR_TURN';
    throw err;
  }

  const dice = 1 + Math.floor(rng() * DICE_MAX);
  game.lastDice = dice;

  const oldPos = player.position;
  const total = oldPos + dice;
  player.position = total % BOARD_SIZE;
  player.lap += Math.floor(total / BOARD_SIZE);

  const events = applyCellLanding(game, player, player.position, rng);
  if (events.length) {
    const last = events[events.length - 1];
    game.lastEvent = { ...last, actorSeat: player.seat };
  } else {
    game.lastEvent = undefined;
  }

  const extraRoll = dice === DICE_MAX;

  if (game.phase === 'BOARD' && !extraRoll) {
    if ((player.doomRemainingTurns || 0) > 0) {
      player.doomRemainingTurns -= 1;
    }
    const prevSeat = game.currentSeat;
    game.currentSeat = nextActiveSeat(game, prevSeat);
    markSeatRolledThisRound(game, player.seat);
  }

  checkGameEnd(game);
  game.updatedAt = Date.now();

  return { dice, events, settled: game.phase === 'SETTLED', extraRoll };
}

function quitGame(game, openId) {
  const player = game.players.find((p) => p.openId === openId);
  if (!player) {
    const err = new Error('PLAYER_NOT_IN_GAME');
    err.code = 'PLAYER_NOT_IN_GAME';
    throw err;
  }
  player.isDefeated = true;
  player.isOnline = false;
  forceSettle(game, 'QUIT');
  game.updatedAt = Date.now();
  return game;
}

function toGamePatch(game) {
  const patch = {
    players: game.players,
    boardCells: game.boardCells,
    diamondCellIndex: game.diamondCellIndex,
    currentSeat: game.currentSeat,
    actionRoundCount: game.actionRoundCount ?? 0,
    rolledSeatsThisRound: game.rolledSeatsThisRound ?? [],
    phase: game.phase,
    lastDice: game.lastDice,
    lastEvent: game.lastEvent,
    updatedAt: game.updatedAt,
  };
  if (game.bluffState !== undefined) {
    patch.bluffState = game.bluffState;
  }
  if (game.settlement !== undefined) patch.settlement = game.settlement;
  return patch;
}

module.exports = {
  rollDice,
  quitGame,
  findPlayerByOpenId,
  nextActiveSeat,
  checkGameEnd,
  markSeatRolledThisRound,
  activeSeats,
  toGamePatch,
};
