const { generateBoardCells, validateBoardLayout, LAYOUT } = require('../BoardGenerator');
const {
  resolveGoldAmount,
  RANDOM_0_500_POOL,
  RANDOM_NEG200_400_POOL,
  applyCellLanding,
} = require('../CellResolver');
const { rollDice, checkGameEnd } = require('../GameEngine');
const { forceSettle } = require('../Settlement');
const { BOARD_SIZE, TARGET_LAPS, TARGET_ACTION_ROUNDS, DICE_MAX } = require('../constants');

function makePlayer(overrides = {}) {
  return {
    userId: 'u1',
    openId: 'o1',
    seat: 0,
    position: 0,
    lap: 0,
    gold: 0,
    diamond: 0,
    isOnline: true,
    isDefeated: false,
    doomRemainingTurns: 0,
    ...overrides,
  };
}

function makeGame(overrides = {}) {
  const { boardCells, diamondCellIndex } = generateBoardCells();
  return {
    roomId: 'r1',
    phase: 'BOARD',
    players: [
      makePlayer({ userId: 'u1', openId: 'o1', seat: 0 }),
      makePlayer({ userId: 'u2', openId: 'o2', seat: 1 }),
    ],
    boardCells,
    diamondCellIndex,
    currentSeat: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    version: 0,
    ...overrides,
  };
}

describe('BoardGenerator', () => {
  test('58 cells with correct type counts', () => {
    const { boardCells } = generateBoardCells();
    expect(boardCells.length).toBe(BOARD_SIZE);
    expect(BOARD_SIZE).toBe(58);
    expect(validateBoardLayout(boardCells)).toBe(true);
    expect(LAYOUT.MINIGAME).toBe(25);
  });

  test('gold cells have variants', () => {
    const { boardCells } = generateBoardCells();
    const golds = boardCells.filter((c) => c.type === 'GOLD');
    expect(golds.length).toBe(20);
    golds.forEach((c) => expect(c.goldVariant).toBeTruthy());
  });
});

describe('CellResolver', () => {
  test('RANDOM_0_500 pool is 50 steps', () => {
    expect(RANDOM_0_500_POOL).toEqual([0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500]);
  });

  test('doom flips fixed gold to loss for doomed player only', () => {
    expect(resolveGoldAmount('FIXED_100', true)).toBe(-100);
    expect(resolveGoldAmount('FIXED_100', false)).toBe(100);
  });

  test('doom on RANDOM_NEG200_400 is fixed -200', () => {
    expect(resolveGoldAmount('RANDOM_NEG200_400', true)).toBe(-200);
    expect(RANDOM_NEG200_400_POOL.every((v) => v % 50 === 0)).toBe(true);
  });

  test('event doom only affects triggering player', () => {
    const game = makeGame();
    game.boardCells[5].type = 'EVENT';
    const p0 = game.players[0];
    const p1 = game.players[1];
    applyCellLanding(game, p0, 5, () => 0);
    expect(p0.doomRemainingTurns).toBe(2);
    expect(p1.doomRemainingTurns || 0).toBe(0);

    game.boardCells[6].type = 'GOLD';
    game.boardCells[6].goldVariant = 'FIXED_100';
    applyCellLanding(game, p1, 6, () => 0);
    expect(p1.gold).toBe(100);
  });

  test('relocateDiamond keeps one diamond cell', () => {
    const game = makeGame();
    const idx = game.diamondCellIndex;
    const player = game.players[0];
    applyCellLanding(game, player, idx, () => 0);
    const diamonds = game.boardCells.filter((c) => c.type === 'DIAMOND');
    expect(diamonds.length).toBe(1);
    expect(player.diamond).toBe(5);
  });
});

describe('GameEngine', () => {
  test('rollDice moves and returns dice 1-7', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
    });
    const res = rollDice(game, 'o1', () => 0.5);
    expect(res.dice).toBeGreaterThanOrEqual(1);
    expect(res.dice).toBeLessThanOrEqual(DICE_MAX);
    expect(game.currentSeat).toBe(1);
  });

  test('rolling 7 grants extra roll without advancing seat', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
    });
    const res = rollDice(game, 'o1', () => 0.99);
    expect(res.dice).toBe(7);
    expect(res.extraRoll).toBe(true);
    expect(game.currentSeat).toBe(0);
  });

  test('lap>=2 triggers settle', () => {
    const game = makeGame();
    game.players[0].lap = TARGET_LAPS;
    checkGameEnd(game);
    expect(game.phase).toBe('SETTLED');
    expect(game.settlement.reason).toBe('LAP');
  });

  test('10 action rounds triggers settle', () => {
    const game = makeGame({ actionRoundCount: TARGET_ACTION_ROUNDS });
    checkGameEnd(game);
    expect(game.phase).toBe('SETTLED');
    expect(game.settlement.reason).toBe('ACTION_ROUNDS');
  });

  test('both players rolling completes one action round', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
    });
    rollDice(game, 'o1', () => 0.5);
    expect(game.actionRoundCount || 0).toBe(0);
    expect(game.rolledSeatsThisRound).toContain(0);
    rollDice(game, 'o2', () => 0.5);
    expect(game.actionRoundCount).toBe(1);
    expect(game.rolledSeatsThisRound).toEqual([]);
  });

  test('doom decrements for player when their turn ends', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
    });
    game.players[1].doomRemainingTurns = 2;
    game.currentSeat = 1;
    rollDice(game, 'o2', () => 0.5);
    expect(game.players[1].doomRemainingTurns).toBe(1);
  });
});

describe('Settlement', () => {
  test('ranks by diamond then gold', () => {
    const game = makeGame();
    game.players[0].diamond = 10;
    game.players[0].gold = 100;
    game.players[1].diamond = 5;
    forceSettle(game, 'NORMAL');
    expect(game.settlement.players.find((p) => p.seat === 0).rank).toBe(1);
  });

  test('equal diamond and gold is tie with shared rank 1', () => {
    const game = makeGame();
    game.players[0].diamond = 0;
    game.players[0].gold = 1100;
    game.players[1].diamond = 0;
    game.players[1].gold = 1100;
    forceSettle(game, 'ACTION_ROUNDS');
    const rows = game.settlement.players;
    expect(rows.every((p) => p.rank === 1)).toBe(true);
    expect(rows.every((p) => p.isTie)).toBe(true);
  });
});

describe('BluffEngine', () => {
  const gameId = 'g-bluff';

  function makeBluffGame(playerCount = 2) {
    const game = makeGame({
      phase: 'MINIGAME_BLUFF',
      bluffState: {
        phase: 'SHAKING',
        triggerSeat: 0,
        currentSeat: 0,
        eliminatedSeats: [],
        eliminationOrder: [],
        shakenSeats: [],
      },
    });
    if (playerCount === 3) {
      game.players.push(
        makePlayer({
          userId: 'u3',
          openId: 'o3',
          seat: 2,
        }),
      );
    }
    return game;
  }

  test('countDiceForBid treats 1 as wild', () => {
    const { countDiceForBid, countDiceBreakdown } = require('../BluffEngine');
    expect(countDiceForBid([[1, 2, 2, 4, 5], [2, 2, 3, 4, 5]], 2)).toBe(5);
    expect(countDiceForBid([[1, 1, 3, 4, 5]], 1)).toBe(2);
    expect(countDiceBreakdown([[2, 2, 2, 2], [3, 4, 5, 6]], 2)).toEqual({
      total: 4,
      faceOnly: 4,
      wildOnes: 0,
    });
    expect(countDiceBreakdown([[1, 2, 2, 4, 5], [2, 2, 3, 4, 5]], 2)).toEqual({
      total: 5,
      faceOnly: 4,
      wildOnes: 1,
    });
  });

  test('2-player bluff rewards 800 / 0', async () => {
    const { bluffShake, bluffBid, bluffOpen, getRewardForRank } = require('../BluffEngine');
    const store = {};
    const persist = async (gid, oid, dice) => {
      store[`${gid}_${oid}`] = dice;
    };
    const loadAll = async () => {
      const g = makeBluffGame(2);
      const out = {};
      g.players.forEach((p) => {
        out[p.openId] = store[`${gameId}_${p.openId}`] || [2, 2, 2, 2, 2];
      });
      return out;
    };

    const game = makeBluffGame(2);
    let seq = 0;
    const rng = () => [0.1, 0.2, 0.3, 0.4, 0.5][seq++ % 5];

    await bluffShake(game, gameId, 'o1', persist, rng);
    await bluffShake(game, gameId, 'o2', persist, rng);
    expect(game.bluffState.phase).toBe('BIDDING');

    bluffBid(game, 'o1', 3, 2);
    store[`${gameId}_o1`] = [2, 2, 2, 1, 1];
    store[`${gameId}_o2`] = [1, 1, 1, 1, 1];
    const res = await bluffOpen(game, 'o2', loadAll);
    expect(res.openResult.actual).toBeGreaterThanOrEqual(3);
    expect(getRewardForRank(2, 1)).toBe(800);
    expect(getRewardForRank(2, 2)).toBe(0);
  });
});
