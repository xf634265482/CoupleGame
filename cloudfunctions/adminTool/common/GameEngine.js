const {
  BOARD_SIZE,
  TARGET_ACTION_ROUNDS,
  DICE_MAX,
  INITIAL_HP,
  TURN_TIMEOUT_MS,
  DEVELOPMENT_END_ROUND,
  CONTEST_END_ROUND,
  BOT_TURN_MAX_STEPS,
  BOT_TURN_MIN_MS,
  BOT_STEP_GAP_MS,
} = require('./constants');
const {
  applyPathCells,
  buildPathIndices,
  applyPathSegment,
  refreshSupplyCrates,
  survivalPhase,
} = require('./CellResolver');
const { forceSettle } = require('./Settlement');
const { buyShopItem: shopBuy, grantWeapon } = require('./ShopResolver');
const {
  attackPlayer: combatAttackPlayer,
  attackNeutral: combatAttackNeutral,
  ringDistance,
} = require('./CombatResolver');
const {
  computeSlowFinalIndex,
} = require('./luckySpin');
const { LUCKY_SLOW_DURATION_MS } = require('./constants');
const { botHandlePendingInteraction } = require('./BotPlayer');
const {
  resolveEvent,
  applyChosenOneTurnGold,
  tickInfection,
} = require('./EventResolver');

function ensureLuckySpin(game, openId) {
  const player = assertBoardTurn(game, openId);
  const pending = game.pendingInteraction;
  if (!pending || pending.type !== 'LUCKY' || pending.seat !== player.seat) {
    const err = new Error('NO_LUCKY_INTERACTION');
    err.code = 'NO_LUCKY_INTERACTION';
    throw err;
  }
  if (!game.luckySpin || game.luckySpin.seat !== player.seat) {
    const err = new Error('LUCKY_STATE_MISSING');
    err.code = 'LUCKY_STATE_MISSING';
    throw err;
  }
  return { player, luckySpin: game.luckySpin };
}

function luckyStart(game, openId, now = Date.now()) {
  const { luckySpin } = ensureLuckySpin(game, openId);
  if (luckySpin.phase !== 'READY') {
    const err = new Error('LUCKY_ALREADY_STARTED');
    err.code = 'LUCKY_ALREADY_STARTED';
    throw err;
  }
  luckySpin.phase = 'FAST';
  luckySpin.startedAt = now;
  game.updatedAt = now;
  return { ok: true };
}

function luckyEnd(game, openId, now = Date.now()) {
  const { luckySpin } = ensureLuckySpin(game, openId);
  if (luckySpin.phase !== 'FAST') {
    const err = new Error('LUCKY_NOT_FAST');
    err.code = 'LUCKY_NOT_FAST';
    throw err;
  }
  luckySpin.phase = 'SLOW';
  luckySpin.slowAt = now;
  luckySpin.stopAt = now + LUCKY_SLOW_DURATION_MS;
  luckySpin.finalIndex = computeSlowFinalIndex(luckySpin);
  game.updatedAt = now;
  return { ok: true };
}

function maybeSettleLucky(game, now = Date.now()) {
  const ls = game.luckySpin;
  if (!ls || ls.phase !== 'SLOW' || !ls.stopAt || !ls.options?.length) return false;
  if (now < ls.stopAt) return false;
  const idx = ls.finalIndex ?? 0;
  const seat = ls.seat;
  const p = game.players?.[seat];
  if (!p) return false;

  const label = ls.options[idx];
  const events = Array.isArray(game.lastEvents) ? game.lastEvents : [];
  const { applyLuckySpinLabel } = require('./luckyRewards');
  applyLuckySpinLabel(game, p, seat, label, events);

  game.lastEvents = events;
  game.lastEvent = { ...events[events.length - 1] };
  game.pendingInteraction = null;
  ls.phase = 'DONE';
  game.luckySpin = null;
  game.updatedAt = now;
  syncMoveTurnDeadline(game, now);
  return true;
}

function maybeSettleEventSpin() {
  return false;
}

function eliminateIfDeadSimple(game, player, events) {
  if (player.hp <= 0) {
    player.hp = 0;
    player.isDefeated = true;
    events.push({
      type: 'ELIMINATED',
      message: 'HP 归零，已淘汰',
      actorSeat: player.seat,
    });
  }
}

function findPlayerByOpenId(game, openId) {
  return game.players.find((p) => p.openId === openId && !p.isDefeated);
}

function findAnyPlayerByOpenId(game, openId) {
  return game.players.find((p) => p.openId === openId);
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

function alivePlayers(game) {
  return game.players.filter((p) => !p.isDefeated);
}

function ensureTurnActions(player) {
  if (!player.turnActions) {
    player.turnActions = {
      rolled: false,
      usedItem: false,
      attacked: false,
      extraRollAvailable: false,
      extraRolled: false,
    };
  }
}

function resetTurnActions(player) {
  player.turnActions = {
    rolled: false,
    usedItem: false,
    attacked: false,
    extraRollAvailable: false,
    extraRolled: false,
  };
  player.visitedRegionsThisTurn = [];
}

const {
  resetTurnDeadline,
  pauseTurnDeadline,
  resumeTurnDeadline,
  syncMoveTurnDeadline,
} = require('./turnDeadline');

function ensureSurvivalProgress(game) {
  const prev = game.survivalPhase || 'DEVELOPMENT';
  const next = survivalPhase(game);
  game.survivalPhase = next;
  if (!Array.isArray(game.lastEvents)) game.lastEvents = [];
  const events = [];

  if (!game.supplyMilestones) {
    game.supplyMilestones = {};
  }

  const round = game.actionRoundCount || 0;
  if (round >= DEVELOPMENT_END_ROUND && !game.supplyMilestones.normal) {
    refreshSupplyCrates(game, 'NORMAL', events);
    game.supplyMilestones.normal = true;
  }
  if (round >= CONTEST_END_ROUND && !game.supplyMilestones.large) {
    refreshSupplyCrates(game, 'LARGE', events);
    game.supplyMilestones.large = true;
  }
  if (prev !== next) {
    events.push({
      type: 'SURVIVAL_PHASE',
      message:
        next === 'FINAL'
          ? '进入决战阶段：废格与补给格变为燃烧格，棋盘将刷新决战商店'
          : next === 'CONTEST'
            ? '进入争夺阶段：补给争夺开始'
            : '进入发育阶段',
      survivalPhase: next,
    });
  }
  if (next === 'FINAL') {
    for (const cell of game.boardCells || []) {
      if (cell.type === 'WASTE' || cell.type === 'SUPPLY') {
        cell.type = 'BURNING';
      }
    }
    const { spawnFinalShops } = require('./finalShop');
    spawnFinalShops(game, events);
  }
  if (events.length) {
    game.lastEvents.push(...events);
    game.lastEvent = { ...events[events.length - 1] };
  }
  return events.length > 0;
}

function endTurnBySeat(game, seat, now = Date.now()) {
  const player = game.players?.[seat];
  if (!player) return { ok: false, currentSeat: game.currentSeat };

  // 若当前座位已淘汰（例如踩燃烧格/被击杀），也必须允许推进回合，否则前端会卡死无法结束回合
  const turnEvents = [];
  if (!player.isDefeated) {
    if ((player.doomRemainingTurns || 0) > 0) {
      player.doomRemainingTurns -= 1;
    }
    tickInfection(player, turnEvents);
    eliminateIfDeadSimple(game, player, turnEvents);
    markSeatEndedTurn(game, seat);
  }

  const nextSeat = nextActiveSeat(game, seat);
  game.currentSeat = nextSeat;
  const nextPlayer = game.players[nextSeat];
  if (nextPlayer && !nextPlayer.isDefeated) {
    resetTurnActions(nextPlayer);
    applyChosenOneTurnGold(nextPlayer, turnEvents);
  }
  if (turnEvents.length) {
    if (!Array.isArray(game.lastEvents)) game.lastEvents = [];
    game.lastEvents.push(...turnEvents);
    game.lastEvent = { ...turnEvents[turnEvents.length - 1] };
  }

  resetTurnDeadline(game, now);
  checkGameEnd(game);
  game.updatedAt = now;

  return { ok: true, currentSeat: game.currentSeat };
}

function applyTurnTimeout(game, now = Date.now()) {
  if (!game || game.phase !== 'BOARD') return false;
  // 移动未完成、交互中、转盘进行中：不强制结束回合
  if (game.movePause) return false;
  if (game.pendingInteraction) return false;
  if (game.luckySpin || game.eventState) return false;
  if (!game.turnDeadlineAt) {
    if (game.turnDeadlinePausedMs != null) return false;
    resetTurnDeadline(game, now);
    return false;
  }
  const cur = game.players?.[game.currentSeat];
  // 若当前座位已淘汰（尤其是 AI 被打死），必须立刻跳过，否则会卡在 isBot 分支
  if (cur?.isDefeated) {
    endTurnBySeat(game, game.currentSeat, now);
    return true;
  }
  // AI 回合由 driveBotTurns 驱动，不走统一超时
  if (cur?.isBot && !cur.isDefeated) return false;
  if (now < game.turnDeadlineAt) return false;
  // 超时：强制结束当前座位回合
  endTurnBySeat(game, game.currentSeat, now);
  return true;
}

function assertBoardTurn(game, openId) {
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
  ensureTurnActions(player);
  return player;
}

/** 行军鞋：单数 +1，双数 +2 → AC-13 */
function computeMoveSteps(dice, player, game = null) {
  let steps = dice;
  if (game && game.sandstormRound === (game.actionRoundCount || 0)) {
    steps = Math.max(1, steps - 1);
  }
  if (player.shoes === 'MARCHING_SHOES') {
    steps += dice % 2 === 1 ? 1 : 2;
  } else if (player.shoes === 'RAPID_SHOES') {
    steps += 2;
  }
  return steps;
}

function executeMove(game, player, steps, rng) {
  const oldPos = player.position;
  const fullPath = buildPathIndices(oldPos, steps, BOARD_SIZE);

  game.pendingInteraction = null;
  game.luckySpin = null;
  game.movePause = null;
  if (!Array.isArray(game.lastEvents)) game.lastEvents = [];

  const { events, paused, consumedLength } = applyPathSegment(
    game,
    player,
    fullPath,
    rng,
  );

  const walked = fullPath.slice(0, consumedLength);
  if (walked.length) {
    player.position = walked[walked.length - 1];
  }
  player.lap += Math.floor((oldPos + consumedLength) / BOARD_SIZE);

  if (paused && consumedLength < fullPath.length) {
    game.movePause = {
      seat: player.seat,
      fromPosition: oldPos,
      segmentSteps: consumedLength,
      remainingPath: fullPath.slice(consumedLength),
    };
  }

  game.lastEvents = events;
  if (events.length) {
    game.lastEvent = { ...events[events.length - 1], actorSeat: player.seat };
  }

  syncMoveTurnDeadline(game);

  return {
    steps,
    pathIndices: fullPath,
    segmentPath: walked,
    segmentSteps: walked.length,
    events,
    totalSteps: steps,
    paused: !!game.movePause,
  };
}

/**
 * 交互完成后继续走完剩余路径（可再次在中途暂停）
 */
function continueMove(game, openId, rng = Math.random) {
  const player = assertBoardTurn(game, openId);
  const pause = game.movePause;
  if (!pause || pause.seat !== player.seat) {
    const err = new Error('NO_MOVE_PAUSE');
    err.code = 'NO_MOVE_PAUSE';
    throw err;
  }

  const remaining = pause.remainingPath || [];
  game.movePause = null;
  game.pendingInteraction = null;
  game.luckySpin = null;

  if (!remaining.length) {
    game.updatedAt = Date.now();
    syncMoveTurnDeadline(game);
    return {
      ok: true,
      events: [],
      segmentPath: [],
      segmentSteps: 0,
      paused: false,
    };
  }

  if (!Array.isArray(game.lastEvents)) game.lastEvents = [];

  const oldPos = player.position;
  const { events, paused, consumedLength } = applyPathSegment(
    game,
    player,
    remaining,
    rng,
  );

  const walked = remaining.slice(0, consumedLength);
  if (walked.length) {
    player.position = walked[walked.length - 1];
  }
  player.lap += Math.floor((oldPos + consumedLength) / BOARD_SIZE);

  if (paused && consumedLength < remaining.length) {
    game.movePause = {
      seat: player.seat,
      fromPosition: oldPos,
      segmentSteps: consumedLength,
      remainingPath: remaining.slice(consumedLength),
    };
  }

  game.lastEvents = events;
  if (events.length) {
    game.lastEvent = { ...events[events.length - 1], actorSeat: player.seat };
  }

  checkGameEnd(game);
  game.updatedAt = Date.now();
  syncMoveTurnDeadline(game);

  return {
    ok: true,
    events,
    segmentPath: walked,
    segmentSteps: walked.length,
    paused: !!game.movePause,
    settled: game.phase === 'SETTLED',
  };
}

/** 本行动回合内所有存活玩家均 endTurn 后 actionRoundCount +1 */
function markSeatEndedTurn(game, seat) {
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
    ensureSurvivalProgress(game);
  }
}

function checkGameEnd(game) {
  if (game.phase === 'SETTLED') return false;

  const alive = alivePlayers(game);
  if (alive.length <= 1) {
    forceSettle(game, alive.length === 1 ? 'LAST_STANDING' : 'ELIMINATION');
    return true;
  }

  if ((game.actionRoundCount || 0) >= TARGET_ACTION_ROUNDS) {
    forceSettle(game, 'ACTION_ROUNDS');
    return true;
  }

  return false;
}

/**
 * 本回合首次投骰 → AC-3, AC-13, AC-21
 */
function rollDice(game, openId, rng = Math.random) {
  const player = assertBoardTurn(game, openId);

  if (player.turnActions.rolled) {
    const err = new Error('ALREADY_ROLLED');
    err.code = 'ALREADY_ROLLED';
    throw err;
  }

  const dice = 1 + Math.floor(rng() * DICE_MAX);
  game.lastDice = dice;

  const totalSteps = computeMoveSteps(dice, player, game);
  if (player.isBot) {
    pushBotAction(
      game,
      player,
      `掷出 ${dice} 点，前进 ${totalSteps} 格`,
    );
  }
  const moveResult = executeMove(game, player, totalSteps, rng);

  player.turnActions.rolled = true;

  checkGameEnd(game);
  game.updatedAt = Date.now();

  return {
    dice,
    totalSteps,
    steps: moveResult.pathIndices,
    segmentPath: moveResult.segmentPath,
    segmentSteps: moveResult.segmentSteps,
    paused: moveResult.paused,
    events: moveResult.events,
    settled: game.phase === 'SETTLED',
    extraRoll: false,
  };
}

/**
 * 双骰子额外投骰 → AC-14
 */
function extraRollDice(game, openId, rng = Math.random) {
  const player = assertBoardTurn(game, openId);

  if (!player.turnActions.extraRollAvailable) {
    const err = new Error('NO_EXTRA_ROLL');
    err.code = 'NO_EXTRA_ROLL';
    throw err;
  }
  if (player.turnActions.extraRolled) {
    const err = new Error('ALREADY_EXTRA_ROLLED');
    err.code = 'ALREADY_EXTRA_ROLLED';
    throw err;
  }

  const dice = 1 + Math.floor(rng() * DICE_MAX);
  game.lastDice = dice;

  const totalSteps = computeMoveSteps(dice, player, game);
  const moveResult = executeMove(game, player, totalSteps, rng);

  player.turnActions.extraRolled = true;
  player.turnActions.extraRollAvailable = false;

  checkGameEnd(game);
  game.updatedAt = Date.now();

  return {
    dice,
    totalSteps,
    steps: moveResult.pathIndices,
    segmentPath: moveResult.segmentPath,
    segmentSteps: moveResult.segmentSteps,
    paused: moveResult.paused,
    events: moveResult.events,
    settled: game.phase === 'SETTLED',
  };
}

/**
 * 使用道具（首版：双骰子 / 医疗包 / 陷阱）→ AC-14, AC-15, AC-16
 */
function useItem(game, openId, itemType, targetCellIndex, rng = Math.random) {
  const player = assertBoardTurn(game, openId);

  if (player.turnActions.usedItem) {
    const err = new Error('ALREADY_USED_ITEM');
    err.code = 'ALREADY_USED_ITEM';
    throw err;
  }

  if (!Array.isArray(game.traps)) game.traps = [];

  let event = { type: 'USE_ITEM', message: '', actorSeat: player.seat };

  if (itemType === 'DOUBLE_DICE') {
    if ((player.items?.doubleDice || 0) < 1) {
      const err = new Error('NO_ITEM');
      err.code = 'NO_ITEM';
      throw err;
    }
    player.items.doubleDice -= 1;
    player.turnActions.extraRollAvailable = true;
    event.message = '使用双骰子，可额外投骰一次';
  } else if (itemType === 'MEDKIT') {
    if ((player.items?.medkit || 0) < 1) {
      const err = new Error('NO_ITEM');
      err.code = 'NO_ITEM';
      throw err;
    }
    if (player.hp >= player.maxHp) {
      const err = new Error('HP_FULL');
      err.code = 'HP_FULL';
      throw err;
    }
    player.items.medkit -= 1;
    player.hp = Math.min(player.maxHp, player.hp + 2);
    event.message = '使用医疗包，回复 2 HP';
  } else if (itemType === 'TRAP') {
    if ((player.items?.trap || 0) < 1) {
      const err = new Error('NO_ITEM');
      err.code = 'NO_ITEM';
      throw err;
    }
    const cell =
      targetCellIndex != null ? targetCellIndex : player.position;
    player.items.trap -= 1;
    game.traps.push({
      id: `trap_${Date.now()}_${player.seat}`,
      ownerSeat: player.seat,
      cellIndex: cell,
      damage: 1,
      active: true,
    });
    event.message = `在格子 ${cell} 放置陷阱`;
    event.cellIndex = cell;
  } else {
    const err = new Error('INVALID_ITEM');
    err.code = 'INVALID_ITEM';
    throw err;
  }

  player.turnActions.usedItem = true;
  game.updatedAt = Date.now();

  return { ok: true, event };
}

/** 商店购买 → AC-6～AC-9 */
function buyShopItem(game, openId, shopType, itemType) {
  const player = assertBoardTurn(game, openId);
  const result = shopBuy(game, player, shopType, itemType);
  checkGameEnd(game);
  game.updatedAt = Date.now();
  syncMoveTurnDeadline(game);
  return result;
}

function resolveBoardEvent(game, openId, payload = {}, rng = Math.random) {
  return resolveEvent(game, openId, payload, rng);
}

/** 攻击玩家或中立生物 → AC-2, AC-11, AC-12, AC-17, AC-18 */
function attack(game, openId, params = {}, rng = Math.random) {
  const player = assertBoardTurn(game, openId);

  if (player.turnActions.attacked) {
    const err = new Error('ALREADY_ATTACKED');
    err.code = 'ALREADY_ATTACKED';
    throw err;
  }

  const { targetType, targetSeat, regionIndex } = params;
  let result;

  if (targetType === 'PLAYER') {
    if (targetSeat == null) {
      const err = new Error('MISSING_TARGET_SEAT');
      err.code = 'MISSING_TARGET_SEAT';
      throw err;
    }
    result = combatAttackPlayer(game, player, Number(targetSeat));
  } else if (targetType === 'NEUTRAL_CREATURE') {
    if (regionIndex == null) {
      const err = new Error('MISSING_REGION');
      err.code = 'MISSING_REGION';
      throw err;
    }
    result = combatAttackNeutral(game, player, regionIndex, rng);
  } else {
    const err = new Error('INVALID_TARGET');
    err.code = 'INVALID_TARGET';
    throw err;
  }

  player.turnActions.attacked = true;
  checkGameEnd(game);
  game.updatedAt = Date.now();

  return {
    ...result,
    settled: game.phase === 'SETTLED',
  };
}

/**
 * 主动结束回合 → AC-3
 */
function endTurn(game, openId) {
  const player = assertBoardTurn(game, openId);

  return endTurnBySeat(game, player.seat, Date.now());
}

function isBotTurn(game) {
  if (!game || game.phase !== 'BOARD') return false;
  const player = game.players?.[game.currentSeat];
  return !!player && !!player.isBot && !player.isDefeated;
}

function clearBotTurnClock(game) {
  game.botTurnSeat = null;
  game.botTurnStartedAt = null;
  game.botNextStepAt = null;
}

function ensureBotTurnClock(game, bot, now) {
  if (game.botTurnSeat !== bot.seat) {
    game.botTurnSeat = bot.seat;
    game.botTurnStartedAt = now;
    game.botNextStepAt = now;
    return true;
  }
  return false;
}

function canBotEndTurn(game, now) {
  const started = game.botTurnStartedAt ?? now;
  return now >= started + BOT_TURN_MIN_MS;
}

function scheduleBotStep(game, now) {
  game.botNextStepAt = now + BOT_STEP_GAP_MS;
}

function pushBotAction(game, bot, message) {
  const events = Array.isArray(game.lastEvents) ? game.lastEvents : [];
  events.push({
    type: 'BOT_ACTION',
    message,
    actorSeat: bot.seat,
  });
  game.lastEvents = events;
  game.lastEvent = { ...events[events.length - 1], actorSeat: bot.seat };
}

function findBotAttackTarget(game, bot) {
  if (!bot.weapon) return null;
  const weaponStats = require('./constants').WEAPON_STATS[bot.weapon];
  if (!weaponStats) return null;
  const targets = (game.players || [])
    .filter((p) => !p.isDefeated && p.seat !== bot.seat)
    .filter((p) => ringDistance(bot.position, p.position) <= weaponStats.range)
    .sort((a, b) => (a.hp || INITIAL_HP) - (b.hp || INITIAL_HP));
  return targets[0] || null;
}

function driveBotTurns(game, now = Date.now(), rng = Math.random) {
  if (!isBotTurn(game)) {
    if (game.botTurnSeat != null) clearBotTurnClock(game);
    return false;
  }

  const bot = game.players[game.currentSeat];
  ensureTurnActions(bot);
  // 第一次进入 AI 回合时也要落库 botTurnClock，否则下一次 tick 会重置 startedAt 导致永远不结束回合
  let changed = ensureBotTurnClock(game, bot, now);

  // 兜底：AI 若异常卡住，强制结束回合，避免倒计时归零不换人
  const started = game.botTurnStartedAt ?? now;
  const hardLimit = BOT_TURN_MIN_MS + 8000;
  if (now - started > hardLimit) {
    endTurnBySeat(game, bot.seat, now);
    clearBotTurnClock(game);
    game.updatedAt = now;
    return true;
  }

  if (game.botNextStepAt != null && now < game.botNextStepAt) {
    return false;
  }

  // changed 已用于 botTurnClock 初始化

  const pendingHandled = botHandlePendingInteraction(game, bot, now, rng, {
    pushBotAction,
    luckyStart,
    luckyEnd,
    maybeSettleLucky,
    maybeSettleEventSpin,
    resolveBoardEvent,
  });
  if (pendingHandled) {
    changed = true;
    scheduleBotStep(game, now);
    if (game.movePause?.seat === bot.seat) {
      return changed;
    }
    return changed;
  }
  if (
    game.pendingInteraction?.seat === bot.seat &&
    game.luckySpin?.phase === 'SLOW' &&
    now < (game.luckySpin.stopAt || 0)
  ) {
    return false;
  }

  if (game.movePause?.seat === bot.seat) {
    continueMove(game, bot.openId, rng);
    changed = true;
    scheduleBotStep(game, now);
    if (changed) game.updatedAt = now;
    return changed;
  }

  if (
    !bot.turnActions.usedItem &&
    (bot.items?.medkit || 0) > 0 &&
    (bot.hp || INITIAL_HP) <= (bot.maxHp || INITIAL_HP) - 2
  ) {
    try {
      useItem(game, bot.openId, 'MEDKIT');
      pushBotAction(game, bot, '使用了急救包');
      changed = true;
      scheduleBotStep(game, now);
      if (changed) game.updatedAt = now;
      return changed;
    } catch {
      /* fall through */
    }
  }

  const target = !bot.turnActions.attacked ? findBotAttackTarget(game, bot) : null;
  if (target) {
    try {
      const atkRes = attack(
        game,
        bot.openId,
        { targetType: 'PLAYER', targetSeat: target.seat },
        rng,
      );
      if (atkRes?.event?.message) {
        pushBotAction(game, bot, atkRes.event.message);
      }
      changed = true;
      scheduleBotStep(game, now);
      if (changed) game.updatedAt = now;
      return changed;
    } catch {
      /* fall through */
    }
  }

  if (!bot.turnActions.rolled) {
    rollDice(game, bot.openId, rng);
    changed = true;
    scheduleBotStep(game, now);
    if (changed) game.updatedAt = now;
    return changed;
  }

  if (!canBotEndTurn(game, now)) {
    game.botNextStepAt = (game.botTurnStartedAt ?? now) + BOT_TURN_MIN_MS;
    return false;
  }

  endTurnBySeat(game, bot.seat, now);
  clearBotTurnClock(game);
  changed = true;

  if (changed) {
    game.updatedAt = now;
  }
  return changed;
}

function quitGame(game, openId) {
  const player = findAnyPlayerByOpenId(game, openId);
  if (!player) {
    const err = new Error('PLAYER_NOT_IN_GAME');
    err.code = 'PLAYER_NOT_IN_GAME';
    throw err;
  }
  player.isDefeated = true;
  player.isOnline = false;
  player.hp = 0;

  const alive = alivePlayers(game);
  if (alive.length <= 1) {
    forceSettle(game, alive.length === 1 ? 'LAST_STANDING' : 'QUIT');
  }

  game.updatedAt = Date.now();
  return game;
}

const LAST_EVENTS_MAX = 48;

function trimLastEvents(game) {
  if (!Array.isArray(game.lastEvents)) return;
  if (game.lastEvents.length > LAST_EVENTS_MAX) {
    game.lastEvents = game.lastEvents.slice(-LAST_EVENTS_MAX);
  }
}

function toGamePatch(game) {
  trimLastEvents(game);
  const patch = {
    players: game.players,
    boardCells: game.boardCells,
    boardSize: game.boardSize,
    diamondCellIndex: game.diamondCellIndex,
    currentSeat: game.currentSeat,
    turnDeadlineAt: game.turnDeadlineAt,
    actionRoundCount: game.actionRoundCount ?? 0,
    rolledSeatsThisRound: game.rolledSeatsThisRound ?? [],
    survivalPhase: game.survivalPhase ?? survivalPhase(game),
    supplyMilestones: game.supplyMilestones ?? {},
    finalShopsSpawned: !!game.finalShopsSpawned,
    phase: game.phase,
    lastDice: game.lastDice,
    lastEvent: game.lastEvent,
    lastEvents: game.lastEvents,
    pendingInteraction: game.pendingInteraction ?? null,
    movePause: game.movePause ?? null,
    luckySpin: game.luckySpin ?? null,
    eventState: game.eventState ?? null,
    bountySeat: game.bountySeat ?? null,
    sandstormRound: game.sandstormRound ?? null,
    botTurnSeat: game.botTurnSeat ?? null,
    botTurnStartedAt: game.botTurnStartedAt ?? null,
    botNextStepAt: game.botNextStepAt ?? null,
    turnDeadlinePausedMs: game.turnDeadlinePausedMs ?? null,
    traps: game.traps ?? [],
    neutralCreatures: game.neutralCreatures,
    chatLog: game.chatLog ?? [],
    updatedAt: game.updatedAt,
  };
  if (game.settlement !== undefined) patch.settlement = game.settlement;
  return patch;
}

module.exports = {
  rollDice,
  extraRollDice,
  continueMove,
  useItem,
  buyShopItem,
  resolveBoardEvent,
  attack,
  endTurn,
  luckyStart,
  luckyEnd,
  maybeSettleLucky,
  maybeSettleEventSpin,
  applyTurnTimeout,
  pauseTurnDeadline,
  resumeTurnDeadline,
  syncMoveTurnDeadline,
  quitGame,
  findPlayerByOpenId,
  nextActiveSeat,
  checkGameEnd,
  markSeatEndedTurn,
  activeSeats,
  alivePlayers,
  computeMoveSteps,
  resetTurnActions,
  endTurnBySeat,
  driveBotTurns,
  pushBotAction,
  // chat/equip helpers exported for cloudfunction/game
  toGamePatch,
};
