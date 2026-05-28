/**
 * 对局结算 → AC-11, AC-12
 */

function forceSettle(game, reason) {
  if (game.phase === 'SETTLED') return game;

  const ranked = game.players
    .slice()
    .sort((a, b) => {
      if (b.diamond !== a.diamond) return b.diamond - a.diamond;
      return b.gold - a.gold;
    });

  const topActive = ranked.find((p) => !p.isDefeated) || ranked[0];
  const tieGroup = ranked.filter(
    (p) => p.diamond === topActive.diamond && p.gold === topActive.gold,
  );
  const isMultiTie = tieGroup.length > 1;

  const results = game.players.map((p) => {
    const inTie =
      isMultiTie && tieGroup.some((t) => t.seat === p.seat) && !p.isDefeated;
    const rank = inTie
      ? 1
      : ranked.findIndex((x) => x.seat === p.seat) + 1;
    return {
      userId: p.userId,
      openId: p.openId,
      seat: p.seat,
      rank,
      gold: p.gold,
      diamond: p.diamond,
      diamondEarned: p.diamond,
      isDefeated: p.isDefeated,
      ...(inTie ? { isTie: true } : {}),
    };
  });

  game.settlement = {
    reason,
    players: results,
    finishedAt: Date.now(),
  };
  game.phase = 'SETTLED';
  return game;
}

async function applySettlementToUsers(game, incrementUserDiamond) {
  if (!game.settlement) return;
  for (const row of game.settlement.players) {
    if (row.diamondEarned > 0) {
      await incrementUserDiamond(row.userId, row.diamondEarned);
    }
  }
}

module.exports = {
  forceSettle,
  applySettlementToUsers,
};
