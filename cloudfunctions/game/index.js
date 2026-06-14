const cloud = require('wx-server-sdk');
const { resolveOpenId, requireUser } = require('./common/auth');
const {
  getGame,
  getUserByOpenId,
  updateGameDoc,
  incrementUserDiamond,
} = require('./common/db');
const {
  rollDice,
  extraRollDice,
  continueMove,
  useItem,
  buyShopItem,
  resolveBoardEvent,
  attack,
  endTurn,
  applyTurnTimeout,
  luckyStart,
  luckyEnd,
  maybeSettleLucky,
  quitGame,
  driveBotTurns,
  toGamePatch,
} = require('./common/GameEngine');
const { applySettlementToUsers } = require('./common/Settlement');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function cloneGame(doc) {
  return JSON.parse(JSON.stringify(doc));
}

async function driveAllBots(game, _gameId, now = Date.now()) {
  return driveBotTurns(game, now);
}

function pushChat(game, openId, text) {
  const player = game.players.find((p) => p.openId === openId);
  if (!player) {
    const err = new Error('PLAYER_NOT_IN_GAME');
    err.code = 'PLAYER_NOT_IN_GAME';
    throw err;
  }
  const line = String(text || '').trim().slice(0, 40);
  if (!line) {
    const err = new Error('EMPTY_CHAT');
    err.code = 'EMPTY_CHAT';
    throw err;
  }
  if (!Array.isArray(game.chatLog)) game.chatLog = [];
  game.chatLog.push({
    ts: Date.now(),
    seat: player.seat,
    nickname: player.nickname || `座位${player.seat + 1}`,
    text: line,
  });
  if (game.chatLog.length > 30) {
    game.chatLog = game.chatLog.slice(game.chatLog.length - 30);
  }
  game.updatedAt = Date.now();
}

async function persistGame(game, gameId, current, expectedVersion) {
  await driveAllBots(game, gameId, Date.now());
  const patch = toGamePatch(game);
  await updateGameDoc(gameId, patch, expectedVersion);
  if (game.phase === 'SETTLED') {
    await applySettlementToUsers(game, incrementUserDiamond);
  }
}

async function maybeApplyTurnTimeout(game, gameId, current, expectedVersion) {
  const changed = applyTurnTimeout(game, Date.now());
  if (!changed) return expectedVersion;
  await persistGame(game, gameId, current, expectedVersion);
  return expectedVersion !== undefined ? expectedVersion + 1 : undefined;
}

async function maybeAdvanceLucky(game, gameId, current, expectedVersion) {
  const changed = maybeSettleLucky(game, Date.now());
  if (!changed) return expectedVersion;
  await persistGame(game, gameId, current, expectedVersion);
  return expectedVersion !== undefined ? expectedVersion + 1 : undefined;
}

function gameResponse(game, gameId, extra = {}) {
  return {
    ok: true,
    game: { ...game, _id: gameId },
    ...extra,
  };
}

/** game 云函数 → AC-3～AC-21 */
exports.main = async (event = {}) => {
  try {
    const openId = resolveOpenId(cloud.getWXContext(), event);
    if (!openId) {
      return { ok: false, code: 'NO_OPENID', message: '无法获取 OPENID' };
    }

    await requireUser(openId, getUserByOpenId);
    const {
      action,
      gameId,
      itemType,
      targetCellIndex,
      shopType,
      targetType,
      targetSeat,
      regionIndex,
    } = event;
    if (!gameId) {
      return { ok: false, code: 'MISSING_GAME_ID', message: '缺少 gameId' };
    }

    const current = await getGame(gameId);
    if (!current) {
      return { ok: false, code: 'GAME_NOT_FOUND', message: '对局不存在' };
    }

    const game = cloneGame(current);
    let gameVersion = current.version;

    gameVersion = await maybeApplyTurnTimeout(game, gameId, current, gameVersion);
    gameVersion = await maybeAdvanceLucky(game, gameId, current, gameVersion);

    if (action === 'tick') {
      const changed = await driveAllBots(game, gameId, Date.now());
      if (changed) {
        await persistGame(game, gameId, current, gameVersion);
      }
      return gameResponse(game, gameId, { ok: true });
    }

    if (action === 'sendChat') {
      pushChat(game, openId, event.text);
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, { ok: true });
    }

    if (action === 'luckyStart') {
      luckyStart(game, openId);
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, { ok: true });
    }

    if (action === 'luckyEnd') {
      luckyEnd(game, openId);
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, { ok: true });
    }

    if (action === 'rollDice') {
      const result = rollDice(game, openId);
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, {
        dice: result.dice,
        totalSteps: result.totalSteps,
        steps: result.steps,
        segmentPath: result.segmentPath,
        segmentSteps: result.segmentSteps,
        paused: result.paused,
        extraRoll: result.extraRoll,
        events: result.events,
        settled: result.settled,
      });
    }

    if (action === 'continueMove') {
      const result = continueMove(game, openId);
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, {
        segmentPath: result.segmentPath,
        segmentSteps: result.segmentSteps,
        paused: result.paused,
        events: result.events,
        settled: result.settled,
      });
    }

    if (action === 'extraRollDice') {
      const result = extraRollDice(game, openId);
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, {
        dice: result.dice,
        totalSteps: result.totalSteps,
        steps: result.steps,
        segmentPath: result.segmentPath,
        segmentSteps: result.segmentSteps,
        paused: result.paused,
        events: result.events,
        settled: result.settled,
      });
    }

    if (action === 'useItem') {
      if (!itemType) {
        return { ok: false, code: 'MISSING_ITEM', message: '缺少 itemType' };
      }
      const result = useItem(
        game,
        openId,
        itemType,
        targetCellIndex != null ? Number(targetCellIndex) : undefined,
      );
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, { event: result.event });
    }

    if (action === 'resolveEvent') {
      const result = resolveBoardEvent(game, openId, event.payload || {});
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, result);
    }

    if (action === 'buyShopItem') {
      if (!shopType || !itemType) {
        return {
          ok: false,
          code: 'MISSING_SHOP_PARAMS',
          message: '缺少 shopType 或 itemType',
        };
      }
      const result = buyShopItem(game, openId, shopType, itemType);
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, {
        purchasedItem: result.purchasedItem,
        price: result.price,
        event: result.event,
      });
    }

    if (action === 'attack') {
      if (!targetType) {
        return {
          ok: false,
          code: 'MISSING_TARGET',
          message: '缺少 targetType',
        };
      }
      const result = attack(game, openId, {
        targetType,
        targetSeat: targetSeat != null ? Number(targetSeat) : undefined,
        regionIndex: regionIndex != null ? Number(regionIndex) : undefined,
      });
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, {
        damage: result.damage,
        killed: result.killed,
        targetType: result.targetType,
        targetSeat: result.targetSeat,
        regionIndex: result.regionIndex,
        targetHp: result.targetHp,
        creatureHp: result.creatureHp,
        rewards: result.rewards,
        event: result.event,
        settled: result.settled,
      });
    }

    if (action === 'endTurn') {
      const result = endTurn(game, openId);
      await persistGame(game, gameId, current, gameVersion);
      return gameResponse(game, gameId, {
        currentSeat: result.currentSeat,
        settled: game.phase === 'SETTLED',
      });
    }

    if (action === 'quit') {
      quitGame(game, openId);
      const patch = toGamePatch(game);
      await updateGameDoc(gameId, patch, gameVersion);
      if (game.phase === 'SETTLED') {
        await applySettlementToUsers(game, incrementUserDiamond);
      }
      return gameResponse(game, gameId, {
        settled: game.phase === 'SETTLED',
      });
    }

    return { ok: false, code: 'UNKNOWN_ACTION', message: `未知 action: ${action}` };
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'GAME_ERROR',
      message: err.message || String(err),
    };
  }
};
