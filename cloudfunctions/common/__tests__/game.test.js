const {
  generateBoardCells,
  validateBoardLayout,
  createInitialGameDoc,
  LAYOUT,
} = require('../BoardGenerator');
const {
  INITIAL_HP,
  NEUTRAL_CREATURE_HP,
  GOLD_CELL_STOCK,
  DIAMOND_CELL_STOCK,
  DEVELOPMENT_END_ROUND,
  CONTEST_END_ROUND,
} = require('../constants');
const {
  resolveGoldAmount,
  RANDOM_0_500_POOL,
  RANDOM_NEG200_400_POOL,
  applyCellLanding,
  applyPathCells,
  buildPathIndices,
  refreshSupplyCrates,
} = require('../CellResolver');
const {
  rollDice,
  extraRollDice,
  useItem,
  buyShopItem,
  attack,
  endTurn,
  quitGame,
  checkGameEnd,
  computeMoveSteps,
  alivePlayers,
  driveBotTurns,
} = require('../GameEngine');
const {
  ringDistance,
  computeDamage,
  attackPlayer,
  attackNeutral,
  positionRegionIndex,
} = require('../CombatResolver');
const {
  buyShopItem: shopBuy,
  refreshShopStockOnPass,
  getPrice,
  grantWeapon,
} = require('../ShopResolver');
const {
  forceSettle,
  applySettlementToUsers,
  computeResourceValue,
} = require('../Settlement');
const {
  BOARD_SIZE,
  TARGET_ACTION_ROUNDS,
  DICE_MAX,
  LUCKY_DUPLICATE_EQUIP_GOLD,
  TURN_TIMEOUT_MS,
} = require('../constants');

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
    hp: INITIAL_HP,
    maxHp: INITIAL_HP,
    kills: 0,
    items: { doubleDice: 0, trap: 0, medkit: 0 },
    shopStock: {
      goldShopVersion: 0,
      legendaryShopVersion: 0,
      goldShop: { SWORD: true, MARCHING_SHOES: true, DOUBLE_DICE: true, TRAP: true },
      legendaryShop: { GUN: true, MEDKIT: true },
    },
    turnActions: {
      rolled: false,
      usedItem: false,
      attacked: false,
      extraRollAvailable: false,
      extraRolled: false,
    },
    doomRemainingTurns: 0,
    ...overrides,
  };
}

function makeNeutralCreatures() {
  return [0, 1, 2].map((regionIndex) => ({
    regionIndex,
    hp: NEUTRAL_CREATURE_HP,
    maxHp: NEUTRAL_CREATURE_HP,
    defeated: false,
    damageBySeat: {},
  }));
}

function makeGame(overrides = {}) {
  const { boardCells, diamondCellIndex } = generateBoardCells();
  return {
    roomId: 'r1',
    phase: 'BOARD',
    boardSize: BOARD_SIZE,
    players: [
      makePlayer({ userId: 'u1', openId: 'o1', seat: 0 }),
      makePlayer({ userId: 'u2', openId: 'o2', seat: 1 }),
    ],
    boardCells,
    diamondCellIndex,
    neutralCreatures: makeNeutralCreatures(),
    traps: [],
    pendingInteraction: null,
    lastEvents: [],
    currentSeat: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    version: 0,
    ...overrides,
  };
}

describe('BoardGenerator', () => {
  test('75 cells with correct type counts', () => {
    const { boardCells } = generateBoardCells();
    expect(boardCells.length).toBe(BOARD_SIZE);
    expect(BOARD_SIZE).toBe(75);
    expect(validateBoardLayout(boardCells)).toBe(true);
    expect(LAYOUT.EVENT).toBe(6);
    expect(LAYOUT.MINIGAME).toBeUndefined();
    expect(LAYOUT.GOLD_SHOP).toBe(4);
    expect(LAYOUT.LEGENDARY_SHOP).toBe(3);
    expect(LAYOUT.LUCKY).toBe(6);
    expect(LAYOUT.DIAMOND).toBe(3);
    expect(LAYOUT.SUPPLY).toBe(3);
  });

  test('shops are at least 10 cells apart on the ring', () => {
    for (let i = 0; i < 20; i++) {
      const { boardCells } = generateBoardCells();
      expect(validateBoardLayout(boardCells)).toBe(true);
      const shops = boardCells.filter(
        (c) => c.type === 'GOLD_SHOP' || c.type === 'LEGENDARY_SHOP',
      );
      expect(shops.length).toBe(LAYOUT.GOLD_SHOP + LAYOUT.LEGENDARY_SHOP);
    }
  });

  test('early zone favors resource cells over shops', () => {
    const { boardCells } = generateBoardCells();
    const early = boardCells.slice(0, 35);
    const resource = early.filter(
      (c) => c.type === 'GOLD' || c.type === 'DIAMOND' || c.type === 'LUCKY',
    ).length;
    const shops = early.filter(
      (c) => c.type === 'GOLD_SHOP' || c.type === 'LEGENDARY_SHOP',
    ).length;
    expect(resource).toBeGreaterThanOrEqual(15);
    expect(shops).toBeLessThanOrEqual(3);
  });

  test('resource cells have independent stock', () => {
    const { boardCells } = generateBoardCells();
    const golds = boardCells.filter((c) => c.type === 'GOLD');
    const diamonds = boardCells.filter((c) => c.type === 'DIAMOND');
    const supplies = boardCells.filter((c) => c.type === 'SUPPLY');
    expect(golds.length).toBe(14);
    golds.forEach((c) => {
      expect(c.goldVariant).toBeTruthy();
      expect(c.stock).toBe(GOLD_CELL_STOCK);
      expect(c.claimCount).toBe(0);
    });
    diamonds.forEach((c) => expect(c.stock).toBe(DIAMOND_CELL_STOCK));
    supplies.forEach((c) => expect(c.crate).toBeNull());
  });

  test('createInitialGameDoc picks random first seat among players', () => {
    const seats = new Set();
    for (let i = 0; i < 40; i++) {
      const doc = createInitialGameDoc({
        roomId: 'r1',
        players: [
          { userId: 'u1', openId: 'o1', nickname: 'A' },
          { userId: 'u2', openId: 'o2', nickname: 'B' },
          { userId: 'u3', openId: 'o3', nickname: 'C' },
        ],
      });
      seats.add(doc.currentSeat);
    }
    expect(seats.size).toBeGreaterThan(1);
  });

  test('createInitialGameDoc initializes combat state', () => {
    const doc = createInitialGameDoc({
      roomId: 'r1',
      players: [
        { userId: 'u1', openId: 'o1', nickname: 'A' },
        { userId: 'u2', openId: 'o2', nickname: 'B' },
      ],
    });
    expect(doc.currentSeat).toBeGreaterThanOrEqual(0);
    expect(doc.currentSeat).toBeLessThan(2);
    expect(doc.boardSize).toBe(75);
    expect(validateBoardLayout(doc.boardCells)).toBe(true);
    expect(doc.neutralCreatures).toHaveLength(3);
    doc.neutralCreatures.forEach((c, i) => {
      expect(c.regionIndex).toBe(i);
      expect(c.hp).toBe(NEUTRAL_CREATURE_HP);
      expect(c.defeated).toBe(false);
    });
    expect(doc.traps).toEqual([]);
    expect(doc.pendingInteraction).toBeNull();
    expect(doc.lastEvents).toEqual([]);
    doc.players.forEach((p) => {
      expect(p.hp).toBe(INITIAL_HP);
      expect(p.maxHp).toBe(INITIAL_HP);
      expect(p.kills).toBe(0);
      expect(p.weapon).toBeUndefined();
      expect(p.items).toEqual({ doubleDice: 0, trap: 0, medkit: 0 });
      expect(p.turnActions.rolled).toBe(false);
      expect(p.shopStock.goldShop.SWORD).toBe(true);
    });
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

  test('event cell creates EVENT pending with eventState intro', () => {
    const game = makeGame();
    const now = Date.now();
    game.turnDeadlineAt = now + 30_000;
    game.boardCells[5].type = 'EVENT';
    game.boardCells[6].type = 'NORMAL';
    const player = game.players[0];
    player.position = 4;
    applyPathCells(game, player, [5, 6], () => 0.9);
    expect(game.pendingInteraction?.type).toBe('EVENT');
    expect(game.eventState?.phase).toBe('INTRO');
    expect(game.eventState?.title).toBeTruthy();
    expect(game.movePause).toBeTruthy();
  });

  test('infection event applies infected state after ack', () => {
    const { resolveEvent } = require('../EventResolver');
    const game = makeGame();
    game.boardCells[5].type = 'EVENT';
    const p0 = game.players[0];
    applyCellLanding(game, p0, 5, () => 0);
    game.eventState = {
      id: 'INFECTION',
      title: '感染',
      description: 'test',
      effect: 'test',
      phase: 'INTRO',
      triggerSeat: 0,
      cellIndex: 5,
      data: {},
    };
    game.pendingInteraction = { seat: 0, type: 'EVENT', cellIndex: 5, eventId: 'INFECTION' };
    resolveEvent(game, 'o1', { action: 'ack' });
    expect(p0.infected).toBe(true);
    expect(game.eventState).toBeNull();
  });

  test('diamond stock is claimed without relocation', () => {
    const game = makeGame();
    const idx = game.diamondCellIndex;
    const player = game.players[0];
    applyCellLanding(game, player, idx, () => 0);
    const diamonds = game.boardCells.filter((c) => c.type === 'DIAMOND');
    expect(diamonds.length).toBe(3);
    expect(player.diamond).toBe(3);
    expect(game.boardCells[idx].stock).toBe(3);
  });

  test('applyPathCells triggers multiple gold cells on path', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
    });
    game.boardCells[1].type = 'GOLD';
    game.boardCells[1].goldVariant = 'FIXED_100';
    game.boardCells[1].stock = 200;
    game.boardCells[1].claimCount = 0;
    game.boardCells[2].type = 'GOLD';
    game.boardCells[2].goldVariant = 'FIXED_200';
    game.boardCells[2].stock = 400;
    game.boardCells[2].claimCount = 0;
    const player = game.players[0];
    const events = applyPathCells(game, player, [1, 2], () => 0);
    expect(player.gold).toBe(300);
    expect(events.filter((e) => e.type === 'GOLD').length).toBe(2);
  });

  test('resource cell depletes after three claims', () => {
    const game = makeGame();
    const cell = game.boardCells[4];
    cell.type = 'GOLD';
    cell.stock = 400;
    cell.initialStock = 400;
    cell.claimCount = 0;
    const p = game.players[0];
    applyCellLanding(game, p, 4, () => 0);
    expect(p.gold).toBe(200);
    applyCellLanding(game, p, 4, () => 0);
    expect(p.gold).toBe(300);
    applyCellLanding(game, p, 4, () => 0);
    expect(p.gold).toBe(400);
    expect(cell.type).toBe('WASTE');
    expect(cell.depleted).toBe(true);
  });

  test('supply crate grants configured rewards and clears crate', () => {
    const game = makeGame();
    const cell = game.boardCells[7];
    cell.type = 'SUPPLY';
    cell.crate = 'NORMAL';
    const p = game.players[0];
    const events = applyCellLanding(game, p, 7, () => 0);
    expect(p.gold).toBeGreaterThan(0);
    expect(p.items.medkit).toBe(1);
    expect(p.items.doubleDice).toBe(1);
    expect(cell.crate).toBeNull();
    expect(events.some((e) => e.type === 'SUPPLY_CRATE')).toBe(true);
  });

  test('time warp event advances player after ack', () => {
    const { resolveEvent } = require('../EventResolver');
    const game = makeGame();
    game.boardCells[5].type = 'EVENT';
    for (let i = 6; i <= 17; i++) {
      game.boardCells[i].type = 'NORMAL';
    }
    const p = game.players[0];
    p.position = 5;
    applyCellLanding(game, p, 5, () => 0);
    game.eventState = {
      id: 'TIME_WARP',
      title: '时空穿梭',
      description: 'test',
      effect: 'test',
      phase: 'INTRO',
      triggerSeat: 0,
      cellIndex: 5,
      data: {},
    };
    game.pendingInteraction = { seat: 0, type: 'EVENT', cellIndex: 5, eventId: 'TIME_WARP' };
    resolveEvent(game, 'o1', { action: 'ack' });
    expect(p.position).toBe(17);
    expect(game.eventState).toBeNull();
  });

  test('final phase burns waste and supply cells', () => {
    const game = makeGame({ actionRoundCount: CONTEST_END_ROUND, survivalPhase: 'FINAL' });
    game.boardCells[8].type = 'WASTE';
    game.boardCells[9].type = 'SUPPLY';
    const p = game.players[0];
    applyCellLanding(game, p, 8, () => 0);
    expect(p.hp).toBe(INITIAL_HP - 1);
    expect(game.boardCells[8].type).toBe('BURNING');
    p.hp = INITIAL_HP;
    applyCellLanding(game, p, 9, () => 0);
    expect(p.hp).toBe(INITIAL_HP - 1);
    expect(game.boardCells[9].type).toBe('BURNING');
  });

  test('trap on path damages passer not owner', () => {
    const game = makeGame();
    game.traps = [
      { id: 't1', ownerSeat: 1, cellIndex: 3, damage: 1, active: true },
    ];
    const player = game.players[0];
    applyPathCells(game, player, [3], () => 0);
    expect(player.hp).toBe(9);
    expect(game.traps[0].active).toBe(false);
  });

  test('eliminated player stops further path cells', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
    });
    game.traps = [
      { id: 't1', ownerSeat: 1, cellIndex: 1, damage: 10, active: true },
    ];
    game.boardCells[2].type = 'GOLD';
    game.boardCells[2].goldVariant = 'FIXED_100';
    const player = game.players[0];
    applyPathCells(game, player, [1, 2], () => 0);
    expect(player.isDefeated).toBe(true);
    expect(player.gold).toBe(0);
  });

  test('pendingInteraction pauses at first shop on path', () => {
    const game = makeGame();
    game.boardCells[1].type = 'GOLD_SHOP';
    game.boardCells[2].type = 'LEGENDARY_SHOP';
    const player = game.players[0];
    player.position = 0;
    applyPathCells(game, player, [1, 2], () => 0);
    expect(game.pendingInteraction.type).toBe('GOLD_SHOP');
    expect(game.movePause).toEqual({
      seat: 0,
      segmentSteps: 1,
      remainingPath: [2],
    });
    expect(player.position).toBe(1);
  });

  test('continueMove resumes path after shop pause', () => {
    const { continueMove } = require('../GameEngine');
    const game = makeGame();
    const player = game.players[0];
    player.position = 1;
    game.boardCells[2].type = 'NORMAL';
    game.movePause = { seat: 0, segmentSteps: 1, remainingPath: [2] };
    const res = continueMove(game, player.openId, () => 0);
    expect(res.segmentSteps).toBe(1);
    expect(player.position).toBe(2);
    expect(game.movePause).toBeNull();
  });

  test('buildPathIndices wraps board', () => {
    expect(buildPathIndices(74, 2, 75)).toEqual([0, 1]);
  });

  test('passing gold shop refreshes player stock', () => {
    const game = makeGame();
    game.boardCells[3].type = 'GOLD_SHOP';
    const player = game.players[0];
    player.shopStock.goldShop.SWORD = false;
    const versionBefore = player.shopStock.goldShopVersion;
    applyPathCells(game, player, [3], () => 0);
    expect(player.shopStock.goldShop.SWORD).toBe(true);
    expect(player.shopStock.goldShopVersion).toBe(versionBefore + 1);
  });

  test('lucky cell defers to pendingInteraction + luckySpin', () => {
    const game = makeGame();
    game.boardCells[5].type = 'LUCKY';
    const player = game.players[0];
    applyPathCells(game, player, [5], () => 0);
    expect(game.pendingInteraction).toEqual({ seat: 0, type: 'LUCKY' });
    expect(game.luckySpin).toBeTruthy();
    expect(game.luckySpin.seat).toBe(0);
    expect(game.luckySpin.phase).toBe('READY');
    expect(game.luckySpin.options).toHaveLength(7);
  });

  test('lucky cell becomes normal and respawns on another normal cell', () => {
    const { relocateLuckyCell } = require('../CellResolver');
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
    });
    game.boardCells[5].type = 'LUCKY';
    game.boardCells[20].type = 'LUCKY';
    relocateLuckyCell(game, 5, () => 0);
    expect(game.boardCells[5].type).toBe('NORMAL');
    const luckyCount = game.boardCells.filter((c) => c.type === 'LUCKY').length;
    expect(luckyCount).toBe(2);
    expect(game.boardCells.some((c, i) => i !== 5 && c.type === 'LUCKY')).toBe(true);
  });

  test('stepping lucky cell relocates before pending interaction', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
    });
    game.boardCells[5].type = 'LUCKY';
    game.boardCells[10].type = 'LUCKY';
    const player = game.players[0];
    applyPathCells(game, player, [5], () => 0.5);
    expect(game.boardCells[5].type).toBe('NORMAL');
    expect(game.boardCells.filter((c) => c.type === 'LUCKY').length).toBe(2);
    expect(game.pendingInteraction?.type).toBe('LUCKY');
  });

  test('luckyEnd uses deceleration and 200ms fast interval', () => {
    const { luckyStart, luckyEnd } = require('../GameEngine');
    const { computeSlowFinalIndex, fastIndexAtSlow } = require('../luckySpin');
    const game = makeGame();
    game.pendingInteraction = { seat: 0, type: 'LUCKY' };
    game.luckySpin = {
      seat: 0,
      phase: 'READY',
      options: [
        '+200 金币',
        '+300 金币',
        '+400 金币',
        '+600 金币',
        '获得陷阱',
        '获得双骰子',
        '获得随机装备',
      ],
    };
    luckyStart(game, game.players[0].openId, 1000);
    expect(game.luckySpin.phase).toBe('FAST');
    luckyEnd(game, game.players[0].openId, 1600);
    expect(game.luckySpin.phase).toBe('SLOW');
    expect(game.luckySpin.stopAt).toBe(2500);
    expect(fastIndexAtSlow(game.luckySpin)).toBe(3);
    expect(computeSlowFinalIndex(game.luckySpin)).toBe(6);
    expect(game.luckySpin.finalIndex).toBe(6);
  });

  test('lucky settles after stopAt via maybeSettleLucky', () => {
    const game = makeGame();
    game.pendingInteraction = { seat: 0, type: 'LUCKY' };
    game.luckySpin = {
      seat: 0,
      phase: 'SLOW',
      options: [
        '+200 金币',
        '+300 金币',
        '+400 金币',
        '+600 金币',
        '获得陷阱',
        '获得双骰子',
        '获得随机装备',
      ],
      stopAt: 1,
      finalIndex: 0,
    };
    const { maybeSettleLucky } = require('../GameEngine');
    const changed = maybeSettleLucky(game, 2);
    expect(changed).toBe(true);
    expect(game.pendingInteraction).toBeNull();
    expect(game.luckySpin).toBeNull();
    expect(game.players[0].gold).toBe(200);
  });
});

describe('ShopResolver', () => {
  function shopContext(shopType) {
    const game = makeGame();
    const player = game.players[0];
    game.pendingInteraction = {
      seat: 0,
      cellIndex: 1,
      type: shopType === 'GOLD' ? 'GOLD_SHOP' : 'LEGENDARY_SHOP',
    };
    return { game, player };
  }

  test('getPrice matches design defaults', () => {
    expect(getPrice('GOLD', 'SWORD')).toBe(1200);
    expect(getPrice('GOLD', 'TRAP')).toBe(500);
    expect(getPrice('LEGENDARY', 'GUN')).toBe(8);
    expect(getPrice('LEGENDARY', 'MEDKIT')).toBe(4);
  });

  test('buy sword deducts gold and equips weapon', () => {
    const { game, player } = shopContext('GOLD');
    player.gold = 2000;
    const result = shopBuy(game, player, 'GOLD', 'SWORD');
    expect(result.purchasedItem).toBe('SWORD');
    expect(player.gold).toBe(800);
    expect(player.weapon).toBe('SWORD');
    expect(player.shopStock.goldShop.SWORD).toBe(false);
    expect(game.pendingInteraction).toBeNull();
  });

  test('two same tier weapons auto merge upward', () => {
    const player = makePlayer();
    const events = [];
    grantWeapon(player, 'SWORD', events, 0);
    expect(player.weapon).toBe('SWORD');
    grantWeapon(player, 'SWORD', events, 0);
    expect(player.weapon).toBe('GUN');
    grantWeapon(player, 'GUN', events, 0);
    expect(player.weapon).toBe('ROCKET');
    grantWeapon(player, 'ROCKET', events, 0);
    expect(player.weaponAttackBonus).toBe(1);
    expect(events.some((e) => e.type === 'WEAPON_MERGE')).toBe(true);
  });

  test('sold out item cannot be bought again until refresh', () => {
    const { game, player } = shopContext('GOLD');
    player.gold = 5000;
    player.shopStock.goldShop.SWORD = false;
    expect(() => shopBuy(game, player, 'GOLD', 'SWORD')).toThrow(
      expect.objectContaining({ code: 'SHOP_OUT_OF_STOCK' }),
    );
    refreshShopStockOnPass(player, 'GOLD_SHOP');
    const result = shopBuy(game, player, 'GOLD', 'SWORD');
    expect(result.ok).toBe(true);
  });

  test('final shop weapon upgrade costs 2000 gold and adds bonus', () => {
    const { buyFinalShopItem } = require('../finalShop');
    const game = makeGame({ survivalPhase: 'FINAL', finalShopsSpawned: true });
    const player = game.players[0];
    player.weapon = 'SWORD';
    player.gold = 3000;
    player.shopStock.finalShop = { WEAPON_UPGRADE: true, DIVINE_STRIKE: true };
    game.pendingInteraction = { seat: 0, type: 'FINAL_SHOP' };
    buyFinalShopItem(game, player, 'WEAPON_UPGRADE');
    expect(player.weaponAttackBonus).toBe(1);
    expect(player.gold).toBe(1000);
    expect(game.pendingInteraction).toBeNull();
  });

  test('insufficient gold rejected', () => {
    const { game, player } = shopContext('GOLD');
    player.gold = 100;
    expect(() => shopBuy(game, player, 'GOLD', 'SWORD')).toThrow(
      expect.objectContaining({ code: 'INSUFFICIENT_GOLD' }),
    );
  });

  test('legendary gun costs diamonds', () => {
    const { game, player } = shopContext('LEGENDARY');
    player.diamond = 10;
    shopBuy(game, player, 'LEGENDARY', 'GUN');
    expect(player.diamond).toBe(2);
    expect(player.weapon).toBe('GUN');
    expect(player.shopStock.legendaryShop.GUN).toBe(false);
  });

  test('replacing equipment does not refund previous', () => {
    const { game, player } = shopContext('GOLD');
    player.gold = 5000;
    player.weapon = 'SWORD';
    shopBuy(game, player, 'GOLD', 'MARCHING_SHOES');
    expect(player.weapon).toBe('SWORD');
    expect(player.shoes).toBe('MARCHING_SHOES');
  });
});

describe('CombatResolver', () => {
  test('ringDistance uses shortest path on ring board', () => {
    expect(ringDistance(74, 1, 75)).toBe(2);
    expect(ringDistance(0, 2, 75)).toBe(2);
  });

  test('positionRegionIndex assigns 75 cells to 3 geographic bands', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 75; i++) {
      counts[positionRegionIndex(i)] += 1;
    }
    expect(counts[0] + counts[1] + counts[2]).toBe(75);
    expect(counts.every((c) => c > 0)).toBe(true);
  });

  test('no weapon rejects attack', () => {
    const game = makeGame();
    const attacker = game.players[0];
    const target = game.players[1];
    attacker.position = 0;
    target.position = 1;
    expect(() => attackPlayer(game, attacker, 1)).toThrow(
      expect.objectContaining({ code: 'NO_WEAPON' }),
    );
  });

  test('sword out of range beyond 2 cells', () => {
    const game = makeGame();
    const attacker = game.players[0];
    const target = game.players[1];
    attacker.weapon = 'SWORD';
    attacker.position = 0;
    target.position = 4;
    expect(ringDistance(0, 4)).toBe(4);
    expect(() => attackPlayer(game, attacker, 1)).toThrow(
      expect.objectContaining({ code: 'OUT_OF_RANGE' }),
    );
  });

  test('helmet reduces sword damage to minimum 0.5', () => {
    const attacker = makePlayer({ weapon: 'SWORD' });
    const defender = makePlayer({ armor: 'HELMET' });
    expect(computeDamage(attacker, defender)).toBe(0.5);
  });

  test('gun deals 1.5 damage at range 4', () => {
    const game = makeGame();
    const attacker = game.players[0];
    const target = game.players[1];
    attacker.weapon = 'GUN';
    attacker.position = 0;
    target.position = 3;
    const result = attackPlayer(game, attacker, 1);
    expect(result.damage).toBe(1.5);
    expect(target.hp).toBe(8.5);
  });

  test('armor reduces damage to minimum 0.5', () => {
    const game = makeGame();
    const attacker = game.players[0];
    const target = game.players[1];
    attacker.weapon = 'GUN';
    attacker.position = 0;
    target.position = 1;
    target.armor = 'ARMOR';
    const result = attackPlayer(game, attacker, 1);
    expect(result.damage).toBe(0.5);
    expect(target.hp).toBe(9.5);
  });

  test('killing player increments attacker kills', () => {
    const game = makeGame();
    const attacker = game.players[0];
    const target = game.players[1];
    attacker.weapon = 'ROCKET';
    attacker.position = 0;
    target.position = 1;
    target.hp = 1;
    target.gold = 1000;
    target.diamond = 6;
    const result = attackPlayer(game, attacker, 1);
    expect(result.killed).toBe(true);
    expect(target.isDefeated).toBe(true);
    expect(attacker.kills).toBe(1);
    expect(attacker.gold).toBe(1000);
    expect(attacker.diamond).toBe(5);
    expect(target.gold).toBe(500);
    expect(target.diamond).toBe(3);
    expect(result.rewards.goldReward).toBe(1000);
  });

  test('neutral kill grants gold item and rocket on lucky rng', () => {
    const game = makeGame();
    const attacker = game.players[0];
    attacker.weapon = 'GUN';
    attacker.position = 0;
    attacker.visitedRegionsThisTurn = [0];
    const creature = game.neutralCreatures[0];
    creature.hp = 1;
    const rng = jest
      .fn()
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);
    const result = attackNeutral(game, attacker, 0, rng);
    expect(result.killed).toBe(true);
    expect(creature.defeated).toBe(true);
    expect(attacker.gold).toBe(2000);
    expect(attacker.items.trap).toBe(1);
    expect(attacker.weapon).toBe('ROCKET');
    expect(result.rewards.vampireStoneGranted).toBe(false);
  });

  test('neutral kill can drop vampire stone (15%)', () => {
    const game = makeGame();
    const attacker = game.players[0];
    attacker.weapon = 'GUN';
    attacker.position = 0;
    attacker.visitedRegionsThisTurn = [0];
    game.neutralCreatures[0].hp = 1;
    const rng = jest
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.99);
    const result = attackNeutral(game, attacker, 0, rng);
    expect(result.killed).toBe(true);
    expect(attacker.vampireStone).toBe(true);
    expect(result.rewards.vampireStoneGranted).toBe(true);
    expect(result.event.message).toContain('吸血石');
  });

  test('vampire stone heals half damage dealt', () => {
    const game = makeGame();
    const attacker = game.players[0];
    const target = game.players[1];
    attacker.weapon = 'GUN';
    attacker.vampireStone = true;
    attacker.hp = 5;
    attacker.position = 0;
    target.position = 1;
    const result = attackPlayer(game, attacker, 1);
    expect(result.damage).toBe(1.5);
    expect(attacker.hp).toBe(5.75);
    expect(result.event.lifesteal).toBe(0.75);
  });

  test('cannot attack neutral without visiting its region this turn', () => {
    const game = makeGame();
    const attacker = game.players[0];
    attacker.weapon = 'SWORD';
    attacker.position = 30;
    attacker.visitedRegionsThisTurn = [1];
    expect(() => attackNeutral(game, attacker, 0)).toThrow(
      expect.objectContaining({ code: 'NOT_IN_REGION' }),
    );
  });

  test('can attack neutral in visited region even when standing elsewhere', () => {
    const game = makeGame();
    const attacker = game.players[0];
    attacker.weapon = 'GUN';
    attacker.position = 10;
    attacker.visitedRegionsThisTurn = [2];
    const creature = game.neutralCreatures[2];
    creature.hp = 6;
    const result = attackNeutral(game, attacker, 2);
    expect(result.ok).toBe(true);
    expect(creature.hp).toBeLessThan(6);
  });
});

describe('GameEngine', () => {
  test('rollDice does not auto-advance seat', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
    });
    const res = rollDice(game, 'o1', () => 0.5);
    expect(res.dice).toBeGreaterThanOrEqual(1);
    expect(res.dice).toBeLessThanOrEqual(DICE_MAX);
    expect(game.currentSeat).toBe(0);
    expect(game.players[0].turnActions.rolled).toBe(true);
  });

  test('rollDice returns path steps with marching shoes bonus', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
    });
    game.players[0].shoes = 'MARCHING_SHOES';
    const res = rollDice(game, 'o1', () => 0.99);
    expect(res.dice).toBe(9);
    expect(res.totalSteps).toBe(10);
    expect(res.steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('cannot roll twice in same turn', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
    });
    rollDice(game, 'o1', () => 0.5);
    expect(() => rollDice(game, 'o1', () => 0.5)).toThrow(
      expect.objectContaining({ code: 'ALREADY_ROLLED' }),
    );
  });

  test('endTurn advances to next player and resets turnActions', () => {
    const game = makeGame();
    endTurn(game, 'o1');
    expect(game.currentSeat).toBe(1);
    expect(game.players[1].turnActions.rolled).toBe(false);
    expect(game.rolledSeatsThisRound).toContain(0);
  });

  test('both players endTurn completes one action round', () => {
    const game = makeGame();
    endTurn(game, 'o1');
    expect(game.actionRoundCount || 0).toBe(0);
    endTurn(game, 'o2');
    expect(game.actionRoundCount).toBe(1);
    expect(game.rolledSeatsThisRound).toEqual([]);
  });

  test('round 10 and 18 refresh supply crates and final phase', () => {
    const game = makeGame({
      currentSeat: 1,
      actionRoundCount: DEVELOPMENT_END_ROUND - 1,
      rolledSeatsThisRound: [0],
    });
    endTurn(game, 'o2');
    expect(game.actionRoundCount).toBe(DEVELOPMENT_END_ROUND);
    expect(game.survivalPhase).toBe('CONTEST');
    expect(
      game.boardCells.filter((c) => c.type === 'SUPPLY' && c.crate === 'NORMAL').length,
    ).toBe(3);

    game.currentSeat = 1;
    game.actionRoundCount = CONTEST_END_ROUND - 1;
    game.rolledSeatsThisRound = [0];
    endTurn(game, 'o2');
    expect(game.survivalPhase).toBe('FINAL');
    expect(
      game.lastEvents.some((e) => e.type === 'SUPPLY_REFRESH' && e.crateType === 'LARGE'),
    ).toBe(true);
    expect(
      game.boardCells.filter((c) => c.type === 'BURNING').length,
    ).toBeGreaterThanOrEqual(3);
    expect(game.finalShopsSpawned).toBe(true);
    expect(game.boardCells.filter((c) => c.type === 'FINAL_SHOP').length).toBe(3);
    expect(
      game.lastEvents.some((e) => e.type === 'SURVIVAL_PHASE' && e.message.includes('决战')),
    ).toBe(true);
  });

  test('medkit cannot be used at full HP', () => {
    const game = makeGame();
    game.players[0].items.medkit = 1;
    game.players[0].hp = game.players[0].maxHp;
    expect(() => useItem(game, 'o1', 'MEDKIT')).toThrow(
      expect.objectContaining({ code: 'HP_FULL' }),
    );
  });

  test('medkit heals 2 HP capped at maxHp', () => {
    const game = makeGame();
    game.players[0].items.medkit = 1;
    game.players[0].hp = 8;
    useItem(game, 'o1', 'MEDKIT');
    expect(game.players[0].hp).toBe(10);
    expect(game.players[0].items.medkit).toBe(0);
    expect(game.players[0].turnActions.usedItem).toBe(true);
  });

  test('bot plays lucky spin instead of skipping', () => {
    const {
      botHandlePendingInteraction,
    } = require('../BotPlayer');
    const {
      pushBotAction,
      luckyStart,
      luckyEnd,
      maybeSettleLucky,
      resolveBoardEvent,
    } = require('../GameEngine');
    const game = makeGame({
      currentSeat: 1,
      players: [
        makePlayer({ userId: 'u1', openId: 'o1', seat: 0 }),
        makePlayer({
          userId: 'bot1',
          openId: 'bot1',
          seat: 1,
          isBot: true,
          nickname: '小橘',
        }),
      ],
    });
    game.pendingInteraction = { seat: 1, type: 'LUCKY' };
    game.luckySpin = {
      seat: 1,
      phase: 'READY',
      options: ['+200 金币', '+300 金币'],
    };
    const hooks = {
      pushBotAction,
      luckyStart,
      luckyEnd,
      maybeSettleLucky,
      resolveBoardEvent,
    };
    const t0 = 2_000_000;
    expect(
      botHandlePendingInteraction(game, game.players[1], t0, () => 0, hooks),
    ).toBe(true);
    expect(game.luckySpin.phase).toBe('FAST');
    expect(
      botHandlePendingInteraction(game, game.players[1], t0 + 100, () => 0, hooks),
    ).toBe(true);
    expect(game.luckySpin.phase).toBe('SLOW');
    expect(
      botHandlePendingInteraction(
        game,
        game.players[1],
        t0 + 100 + 2500,
        () => 0,
        hooks,
      ),
    ).toBe(true);
    expect(game.pendingInteraction).toBeNull();
    expect(game.luckySpin).toBeNull();
  });

  test('bot turn driver rolls and passes control back', () => {
    const game = makeGame({
      currentSeat: 1,
      players: [
        makePlayer({ userId: 'u1', openId: 'o1', seat: 0 }),
        makePlayer({ userId: 'bot1', openId: 'bot1', seat: 1, isBot: true, nickname: 'AI-2' }),
      ],
    });
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
      delete c.crate;
    });
    const t0 = 1_000_000;
    const changed1 = driveBotTurns(game, t0, () => 0);
    expect(changed1).toBe(true);
    expect(game.currentSeat).toBe(1);
    expect(game.players[1].turnActions.rolled).toBe(true);

    const changed2 = driveBotTurns(game, t0 + 8000, () => 0);
    expect(changed2).toBe(true);
    expect(game.currentSeat).toBe(0);
  });

  test('trap item places trap on current cell', () => {
    const game = makeGame();
    game.players[0].items.trap = 1;
    game.players[0].position = 7;
    useItem(game, 'o1', 'TRAP');
    expect(game.traps).toHaveLength(1);
    expect(game.traps[0].cellIndex).toBe(7);
    expect(game.traps[0].ownerSeat).toBe(0);
    expect(game.traps[0].active).toBe(true);
    expect(game.players[0].items.trap).toBe(0);
  });

  test('attack marks turnActions.attacked and damages target', () => {
    const game = makeGame();
    game.players[0].weapon = 'SWORD';
    game.players[0].position = 0;
    game.players[1].position = 1;
    const result = attack(game, 'o1', {
      targetType: 'PLAYER',
      targetSeat: 1,
    });
    expect(result.damage).toBe(1);
    expect(game.players[1].hp).toBe(9);
    expect(game.players[0].turnActions.attacked).toBe(true);
  });

  test('cannot attack twice in same turn', () => {
    const game = makeGame();
    game.players[0].weapon = 'SWORD';
    game.players[0].position = 0;
    game.players[1].position = 1;
    attack(game, 'o1', { targetType: 'PLAYER', targetSeat: 1 });
    expect(() =>
      attack(game, 'o1', { targetType: 'PLAYER', targetSeat: 1 }),
    ).toThrow(expect.objectContaining({ code: 'ALREADY_ATTACKED' }));
  });

  test('player kill triggers LAST_STANDING settle in 1v1', () => {
    const game = makeGame();
    game.players[0].weapon = 'ROCKET';
    game.players[0].position = 0;
    game.players[1].position = 1;
    game.players[1].hp = 1;
    const result = attack(game, 'o1', {
      targetType: 'PLAYER',
      targetSeat: 1,
    });
    expect(result.killed).toBe(true);
    expect(game.phase).toBe('SETTLED');
    expect(game.settlement.reason).toBe('LAST_STANDING');
  });

  test('buyShopItem via GameEngine requires pending shop', () => {
    const game = makeGame();
    game.players[0].gold = 2000;
    game.pendingInteraction = {
      seat: 0,
      cellIndex: 2,
      type: 'GOLD_SHOP',
    };
    buyShopItem(game, 'o1', 'GOLD', 'SWORD');
    expect(game.players[0].weapon).toBe('SWORD');
    expect(game.players[0].gold).toBe(800);
  });

  test('extraRollDice after using double dice item', () => {
    const game = makeGame();
    game.boardCells.forEach((c) => {
      c.type = 'NORMAL';
      delete c.goldVariant;
    });
    game.players[0].items.doubleDice = 1;
    useItem(game, 'o1', 'DOUBLE_DICE');
    rollDice(game, 'o1', () => 0);
    const before = game.players[0].position;
    const res = extraRollDice(game, 'o1', () => 0);
    expect(res.dice).toBe(1);
    expect(game.players[0].position).toBe(before + 1);
    expect(game.players[0].turnActions.extraRolled).toBe(true);
  });

  test('marching shoes odd dice adds one step', () => {
    const player = makePlayer({ shoes: 'MARCHING_SHOES' });
    expect(computeMoveSteps(3, player)).toBe(4);
    expect(computeMoveSteps(4, player)).toBe(6);
  });

  test('last survivor triggers LAST_STANDING settle', () => {
    const game = makeGame();
    game.players[1].isDefeated = true;
    game.players[1].hp = 0;
    checkGameEnd(game);
    expect(game.phase).toBe('SETTLED');
    expect(game.settlement.reason).toBe('LAST_STANDING');
  });

  test('10 action rounds triggers settle', () => {
    const game = makeGame({ actionRoundCount: TARGET_ACTION_ROUNDS });
    checkGameEnd(game);
    expect(game.phase).toBe('SETTLED');
    expect(game.settlement.reason).toBe('ACTION_ROUNDS');
  });

  test('quit eliminates player without settling when others remain', () => {
    const game = makeGame({
      players: [
        makePlayer({ userId: 'u1', openId: 'o1', seat: 0 }),
        makePlayer({ userId: 'u2', openId: 'o2', seat: 1 }),
        makePlayer({ userId: 'u3', openId: 'o3', seat: 2 }),
      ],
    });
    quitGame(game, 'o1');
    expect(game.players[0].isDefeated).toBe(true);
    expect(game.phase).toBe('BOARD');
    expect(alivePlayers(game).length).toBe(2);
  });

  test('quit with one survivor settles', () => {
    const game = makeGame();
    quitGame(game, 'o2');
    expect(game.phase).toBe('SETTLED');
    expect(game.settlement.reason).toBe('LAST_STANDING');
  });

  test('doom decrements when endTurn', () => {
    const game = makeGame();
    game.players[0].doomRemainingTurns = 2;
    endTurn(game, 'o1');
    expect(game.players[0].doomRemainingTurns).toBe(1);
  });

  test('applyTurnTimeout does not end turn while move paused', () => {
    const { applyTurnTimeout } = require('../GameEngine');
    const game = makeGame();
    game.turnDeadlineAt = Date.now() - 1000;
    game.movePause = {
      seat: 0,
      fromPosition: 0,
      segmentSteps: 2,
      remainingPath: [3, 4, 5],
    };
    expect(applyTurnTimeout(game)).toBe(false);
    expect(game.currentSeat).toBe(0);
  });

  test('lucky spin during move pause keeps turn deadline frozen', () => {
    const { rollDice } = require('../GameEngine');
    const game = makeGame();
    const now = Date.now();
    game.turnDeadlineAt = now + 30_000;
    game.boardCells[1].type = 'LUCKY';
    game.boardCells[2].type = 'NORMAL';
    rollDice(game, 'o1', () => 0.2);
    expect(game.movePause).toBeTruthy();
    expect(game.luckySpin).toBeTruthy();
    expect(game.turnDeadlineAt).toBeNull();
    expect(game.turnDeadlinePausedMs).toBeGreaterThan(25_000);
  });

  test('continueMove after lucky resumes turn deadline when path completes', () => {
    const { rollDice, continueMove, maybeSettleLucky } = require('../GameEngine');
    const game = makeGame();
    const player = game.players[0];
    const now = Date.now();
    game.turnDeadlineAt = now + 30_000;
    game.boardCells[1].type = 'LUCKY';
    game.boardCells[2].type = 'NORMAL';
    rollDice(game, 'o1', () => 0.2);
    game.luckySpin.phase = 'SLOW';
    game.luckySpin.stopAt = now - 1;
    game.luckySpin.finalIndex = 0;
    maybeSettleLucky(game, now);
    expect(game.pendingInteraction).toBeNull();
    expect(game.movePause).toBeTruthy();
    expect(game.turnDeadlinePausedMs).toBeNull();
    expect(game.turnDeadlineAt).toBeGreaterThan(now + 20_000);
    continueMove(game, player.openId, () => 0);
    expect(game.movePause).toBeNull();
    expect(game.turnDeadlinePausedMs).toBeNull();
    expect(game.turnDeadlineAt).toBeGreaterThan(now + 20_000);
  });

  test('TURN_TIMEOUT_MS is 35 seconds', () => {
    expect(TURN_TIMEOUT_MS).toBe(35 * 1000);
  });

});

describe('Settlement', () => {
  test('LAST_STANDING marks sole survivor as winner', () => {
    const game = makeGame();
    game.players[1].isDefeated = true;
    game.players[1].hp = 0;
    forceSettle(game, 'LAST_STANDING');
    const p0 = game.settlement.players.find((p) => p.seat === 0);
    const p1 = game.settlement.players.find((p) => p.seat === 1);
    expect(p0.isWinner).toBe(true);
    expect(p0.rank).toBe(1);
    expect(p1.isWinner).toBe(false);
    expect(p1.isDefeated).toBe(true);
    expect(game.settlement.reason).toBe('LAST_STANDING');
  });

  test('ACTION_ROUNDS ranks alive over defeated regardless of gold', () => {
    const game = makeGame();
    game.players[0].hp = 5;
    game.players[0].gold = 100;
    game.players[1].isDefeated = true;
    game.players[1].hp = 0;
    game.players[1].gold = 99999;
    game.players[1].diamond = 99;
    forceSettle(game, 'ACTION_ROUNDS');
    expect(game.settlement.players.find((p) => p.seat === 0).rank).toBe(1);
    expect(game.settlement.players.find((p) => p.seat === 1).rank).toBe(2);
  });

  test('timeout tie-break: hp then kills then resource value', () => {
    const game = makeGame();
    game.players[0].hp = 8;
    game.players[0].kills = 2;
    game.players[0].gold = 100;
    game.players[1].hp = 8;
    game.players[1].kills = 1;
    game.players[1].gold = 5000;
    forceSettle(game, 'ACTION_ROUNDS');
    expect(game.settlement.players.find((p) => p.seat === 0).rank).toBe(1);
    expect(game.settlement.players.find((p) => p.seat === 1).rank).toBe(2);
  });

  test('equal sort keys share rank 1 with isTie', () => {
    const game = makeGame();
    game.players[0].hp = 10;
    game.players[0].gold = 1100;
    game.players[1].hp = 10;
    game.players[1].gold = 1100;
    forceSettle(game, 'ACTION_ROUNDS');
    const rows = game.settlement.players;
    expect(rows.every((p) => p.rank === 1)).toBe(true);
    expect(rows.every((p) => p.isTie)).toBe(true);
  });

  test('computeResourceValue uses gold + diamond * 300', () => {
    expect(computeResourceValue({ gold: 100, diamond: 2 })).toBe(700);
  });

  test('applySettlementToUsers skips when diamondEarned is 0', async () => {
    const game = makeGame();
    forceSettle(game, 'LAST_STANDING');
    const increment = jest.fn();
    await applySettlementToUsers(game, increment);
    expect(increment).not.toHaveBeenCalled();
  });
});
