const { TURN_TIMEOUT_MS } = require('./constants');

function resetTurnDeadline(game, now = Date.now()) {
  game.turnDeadlineAt = now + TURN_TIMEOUT_MS;
  game.turnDeadlinePausedMs = null;
}

function pauseTurnDeadline(game, now = Date.now()) {
  if (!game) return;
  if (game.turnDeadlineAt == null && game.turnDeadlinePausedMs != null) return;
  if (game.turnDeadlineAt == null) return;
  game.turnDeadlinePausedMs = Math.max(0, game.turnDeadlineAt - now);
  game.turnDeadlineAt = null;
}

/** 转盘进行中或仍有格子交互时暂停；仅 movePause 续走时不暂停读秒 */
function shouldPauseTurnDeadline(game) {
  if (!game || game.phase !== 'BOARD') return false;
  if (game.luckySpin || game.eventState) return true;
  const t = game.pendingInteraction?.type;
  if (
    t === 'LUCKY' ||
    t === 'EVENT' ||
    t === 'CHARITY_SHOP' ||
    t === 'GOLD_SHOP' ||
    t === 'LEGENDARY_SHOP' ||
    t === 'FINAL_SHOP' ||
    t === 'CELL_ACK'
  ) {
    return true;
  }
  return false;
}

function syncMoveTurnDeadline(game, now = Date.now()) {
  if (!game || game.phase !== 'BOARD') return;
  if (shouldPauseTurnDeadline(game)) {
    pauseTurnDeadline(game, now);
  } else if (game.turnDeadlinePausedMs != null) {
    resumeTurnDeadline(game, now);
  }
}

function resumeTurnDeadline(game, now = Date.now()) {
  if (!game || game.phase !== 'BOARD') return;
  if (game.turnDeadlinePausedMs != null) {
    game.turnDeadlineAt = now + game.turnDeadlinePausedMs;
    game.turnDeadlinePausedMs = null;
    return;
  }
  if (!game.turnDeadlineAt) resetTurnDeadline(game, now);
}

module.exports = {
  resetTurnDeadline,
  pauseTurnDeadline,
  resumeTurnDeadline,
  shouldPauseTurnDeadline,
  syncMoveTurnDeadline,
};
