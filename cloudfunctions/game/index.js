const cloud = require('wx-server-sdk');
const { resolveOpenId, requireUser } = require('./common/auth');
const {
  getGame,
  getUserByOpenId,
  updateGameDoc,
  incrementUserDiamond,
  setBluffDice,
  getBluffDice,
  getAllBluffDiceForGame,
  clearBluffPrivateForGame,
} = require('./common/db');
const { rollDice, quitGame, toGamePatch } = require('./common/GameEngine');
const { applySettlementToUsers } = require('./common/Settlement');
const {
  bluffShake,
  bluffBid,
  bluffOpen,
  maybeBluffTimeout,
} = require('./common/BluffEngine');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function cloneGame(doc) {
  return JSON.parse(JSON.stringify(doc));
}

async function persistAndLoadDice(gameId, game) {
  const openIds = game.players.map((p) => p.openId);
  return () => getAllBluffDiceForGame(gameId, openIds);
}

/** 超时则推进回合并写库，返回新的 expectedVersion */
async function persistBluffTimeout(game, gameId, expectedVersion) {
  const bs = game.bluffState;
  if (game.phase !== 'MINIGAME_BLUFF' || !bs || bs.phase !== 'BIDDING') {
    return expectedVersion;
  }
  if (!bs.turnDeadline || Date.now() < bs.turnDeadline) {
    return expectedVersion;
  }
  const cur = game.players[bs.currentSeat];
  if (!cur?.openId) return expectedVersion;

  const phaseBefore = game.phase;
  const loadAll = await persistAndLoadDice(gameId, game);
  await maybeBluffTimeout(game, cur.openId, loadAll);

  const patch = toGamePatch(game);
  if (game.bluffState === undefined) {
    patch.bluffState = null;
  }
  await updateGameDoc(gameId, patch, expectedVersion);
  if (game.phase === 'BOARD' && phaseBefore === 'MINIGAME_BLUFF') {
    await clearBluffPrivateForGame(
      gameId,
      game.players.map((p) => p.openId),
    );
  }
  return expectedVersion !== undefined ? expectedVersion + 1 : undefined;
}

/** game 云函数 → AC-7～AC-14 */
exports.main = async (event = {}) => {
  try {
    const openId = resolveOpenId(cloud.getWXContext(), event);
    if (!openId) {
      return { ok: false, code: 'NO_OPENID', message: '无法获取 OPENID' };
    }

    await requireUser(openId, getUserByOpenId);
    const { action, gameId, count, face } = event;
    if (!gameId) {
      return { ok: false, code: 'MISSING_GAME_ID', message: '缺少 gameId' };
    }

    const current = await getGame(gameId);
    if (!current) {
      return { ok: false, code: 'GAME_NOT_FOUND', message: '对局不存在' };
    }

    const game = cloneGame(current);
    const expectedVersion = current.version;

    let gameVersion = expectedVersion;
    const timeoutActions = new Set(['bluffTick', 'bluffBid', 'bluffOpen']);
    if (timeoutActions.has(action)) {
      gameVersion = await persistBluffTimeout(game, gameId, gameVersion);
    }

    if (action === 'rollDice') {
      const phaseBefore = game.phase;
      const result = rollDice(game, openId);
      if (
        game.phase === 'MINIGAME_BLUFF' &&
        phaseBefore !== 'MINIGAME_BLUFF'
      ) {
        await clearBluffPrivateForGame(
          gameId,
          game.players.map((p) => p.openId),
        );
      }
      const patch = toGamePatch(game);
      // 吹牛结束后若库内仍残留 bluffState（含 null），用 remove 清掉
      if (
        game.phase === 'BOARD' &&
        game.bluffState === undefined &&
        current.bluffState != null
      ) {
        patch.bluffState = null;
      }
      await updateGameDoc(gameId, patch, gameVersion);

      if (game.phase === 'SETTLED') {
        await applySettlementToUsers(game, incrementUserDiamond);
      }

      return {
        ok: true,
        dice: result.dice,
        extraRoll: result.extraRoll,
        events: result.events,
        settled: result.settled,
        game: { ...game, _id: gameId },
      };
    }

    if (action === 'quit') {
      quitGame(game, openId);
      const patch = toGamePatch(game);
      if (game.bluffState === undefined) {
        patch.bluffState = null;
      }
      await updateGameDoc(gameId, patch, gameVersion);
      await clearBluffPrivateForGame(
        gameId,
        game.players.map((p) => p.openId),
      );
      await applySettlementToUsers(game, incrementUserDiamond);
      return { ok: true, settled: true, game: { ...game, _id: gameId } };
    }

    if (action === 'bluffTick') {
      return {
        ok: true,
        game: { ...game, _id: gameId },
      };
    }

    if (action === 'bluffMyDice') {
      const dice = await getBluffDice(gameId, openId);
      return { ok: true, myDice: dice || [] };
    }

    if (action === 'bluffShake') {
      const persistDice = (gid, oid, dice) => setBluffDice(gid, oid, dice);
      const result = await bluffShake(game, gameId, openId, persistDice);
      const patch = toGamePatch(game);
      await updateGameDoc(gameId, patch, gameVersion);
      return {
        ok: true,
        myDice: result.myDice,
        bluffState: result.bluffState,
        game: { ...game, _id: gameId },
      };
    }

    if (action === 'bluffBid') {
      const c = Number(count);
      const f = Number(face);
      if (!Number.isFinite(c) || c < 1 || !Number.isFinite(f) || f < 1 || f > 6) {
        return { ok: false, code: 'INVALID_BID', message: '叫点参数无效' };
      }
      const bs = game.bluffState;
      if (!bs || bs.phase !== 'BIDDING') {
        return { ok: false, code: 'BLUFF_NOT_BIDDING', message: '当前不是叫点阶段' };
      }
      const stillMyTurn = game.players[bs.currentSeat]?.openId === openId;
      if (!stillMyTurn) {
        return {
          ok: true,
          skipped: true,
          message: '回合已结束',
          game: { ...game, _id: gameId },
        };
      }
      bluffBid(game, openId, c, f);
      const patch = toGamePatch(game);
      await updateGameDoc(gameId, patch, gameVersion);
      return {
        ok: true,
        bluffState: game.bluffState,
        game: { ...game, _id: gameId },
      };
    }

    if (action === 'bluffOpen') {
      const loadAll = await persistAndLoadDice(gameId, game);
      const result = await bluffOpen(game, openId, loadAll);
      const patch = toGamePatch(game);
      if (game.bluffState === undefined) {
        patch.bluffState = null;
      }
      await updateGameDoc(gameId, patch, gameVersion);
      if (game.phase === 'BOARD') {
        await clearBluffPrivateForGame(
          gameId,
          game.players.map((p) => p.openId),
        );
      }
      return {
        ok: true,
        bluffState: result.bluffState,
        rankings: result.rankings,
        openResult: result.openResult,
        game: { ...game, _id: gameId },
      };
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
