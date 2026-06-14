/**
 * 对局结算 → AC-18, AC-19
 * 存活 > HP > kills > gold + diamond*300
 */
const { RESOURCE_VALUE_DIAMOND_MULTIPLIER } = require('./constants');

function computeResourceValue(player) {
  return (
    (player.gold || 0) +
    (player.diamond || 0) * RESOURCE_VALUE_DIAMOND_MULTIPLIER
  );
}

function playerSortKey(player) {
  return [
    player.isDefeated ? 0 : 1,
    player.hp ?? 0,
    player.kills || 0,
    computeResourceValue(player),
  ];
}

function sortKeysEqual(a, b) {
  const ka = playerSortKey(a);
  const kb = playerSortKey(b);
  return ka.every((v, i) => v === kb[i]);
}

function comparePlayers(a, b) {
  const ka = playerSortKey(a);
  const kb = playerSortKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (kb[i] !== ka[i]) return kb[i] - ka[i];
  }
  return a.seat - b.seat;
}

function assignRanks(ranked) {
  const rankBySeat = new Map();
  let rank = 1;
  for (let i = 0; i < ranked.length; i++) {
    if (i > 0 && !sortKeysEqual(ranked[i], ranked[i - 1])) {
      rank = i + 1;
    }
    rankBySeat.set(ranked[i].seat, rank);
  }
  return rankBySeat;
}

function forceSettle(game, reason) {
  if (game.phase === 'SETTLED') return game;

  const ranked = game.players.slice().sort(comparePlayers);
  const rankBySeat = assignRanks(ranked);
  const topGroup = ranked.filter((p) => sortKeysEqual(p, ranked[0]));
  const isMultiTie = topGroup.length > 1;

  const soleSurvivor =
    reason === 'LAST_STANDING'
      ? game.players.find((p) => !p.isDefeated)
      : null;

  const results = game.players.map((p) => {
    const rank = rankBySeat.get(p.seat);
    const inTie = isMultiTie && topGroup.some((t) => t.seat === p.seat);
    const isWinner = soleSurvivor
      ? p.seat === soleSurvivor.seat
      : inTie
        ? rank === 1
        : rank === 1;

    return {
      userId: p.userId,
      openId: p.openId,
      seat: p.seat,
      rank,
      isWinner,
      hp: p.hp ?? 0,
      kills: p.kills || 0,
      gold: p.gold || 0,
      diamond: p.diamond || 0,
      resourceValue: computeResourceValue(p),
      diamondEarned: 0,
      isDefeated: !!p.isDefeated,
      ...(inTie ? { isTie: true } : {}),
    };
  });

  game.settlement = {
    reason,
    players: results,
    finishedAt: Date.now(),
  };
  // 对局结束清空消息
  game.chatLog = [];
  game.phase = 'SETTLED';
  return game;
}

/** 血量淘汰版默认不写局外钻石 → PD7 */
async function applySettlementToUsers(game, incrementUserDiamond) {
  if (!game.settlement) return;
  for (const row of game.settlement.players) {
    const earned = row.diamondEarned ?? 0;
    if (earned > 0) {
      await incrementUserDiamond(row.userId, earned);
    }
  }
}

module.exports = {
  forceSettle,
  applySettlementToUsers,
  computeResourceValue,
};
