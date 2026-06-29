const {
  CONTEST_END_ROUND,
  DEVELOPMENT_END_ROUND,
  BOARD_SIZE,
  INITIAL_HP,
  LUCKY_DUPLICATE_EQUIP_GOLD,
  NORMAL_SUPPLY_CRATE,
  LARGE_SUPPLY_CRATE,
} = require('./constants');
const { refreshShopStockOnPass, grantWeapon } = require('./ShopResolver');
const { markRegionVisited } = require('./boardRegions');

/** 0, 50, …, 500 */
const RANDOM_0_500_POOL = [];
for (let v = 0; v <= 500; v += 50) RANDOM_0_500_POOL.push(v);

/** -200, -150, …, 400 */
const RANDOM_NEG200_400_POOL = [];
for (let v = -200; v <= 400; v += 50) RANDOM_NEG200_400_POOL.push(v);

const { LUCKY_SPIN_OPTIONS } = require('./luckyRewards');
const { refreshFinalShopStock } = require('./finalShop');

const { setupEventAtCell } = require('./EventResolver');

const INTERACTION_CELL_TYPES = [
  'GOLD_SHOP',
  'LEGENDARY_SHOP',
  'FINAL_SHOP',
  'LUCKY',
];

/** 幸运格 7 项池 → AC-10（金币选项在原基础上 +100） */
const LUCKY_ENTRIES = [
  { kind: 'GOLD', amount: 200 },
  { kind: 'GOLD', amount: 300 },
  { kind: 'GOLD', amount: 400 },
  { kind: 'GOLD', amount: 600 },
  { kind: 'ITEM', item: 'trap' },
  { kind: 'ITEM', item: 'doubleDice' },
  { kind: 'EQUIP' },
];

function pickFromPool(pool, rng = Math.random) {
  return pool[Math.floor(rng() * pool.length)];
}

function ensurePlayerCombatFields(player) {
  if (player.hp == null) player.hp = INITIAL_HP;
  if (player.maxHp == null) player.maxHp = INITIAL_HP;
  if (!player.items) {
    player.items = { doubleDice: 0, trap: 0, medkit: 0 };
  }
  if (!player.shopStock) {
    player.shopStock = {
      goldShopVersion: 0,
      legendaryShopVersion: 0,
      goldShop: { SWORD: true, MARCHING_SHOES: true, DOUBLE_DICE: true, TRAP: true },
      legendaryShop: { GUN: true, MEDKIT: true },
    };
  }
}

function eliminateIfDead(player, events) {
  if (player.hp <= 0) {
    player.hp = 0;
    player.isDefeated = true;
    events.push({
      type: 'ELIMINATED',
      message: 'HP 归零，已淘汰',
      actorSeat: player.seat,
    });
    return true;
  }
  return false;
}

function survivalPhase(game) {
  const round = game.actionRoundCount || 0;
  if (round >= CONTEST_END_ROUND) return 'FINAL';
  if (round >= DEVELOPMENT_END_ROUND) return 'CONTEST';
  return 'DEVELOPMENT';
}

function claimCellStock(cell) {
  const stock = Math.max(0, Number(cell.stock || 0));
  const claimCount = Number(cell.claimCount || 0);
  if (stock <= 0 || cell.depleted) return 0;
  if (claimCount >= 2) return stock;
  return Math.max(1, Math.ceil(stock / 2));
}

function markResourceCellClaimed(cell, amount) {
  cell.stock = Math.max(0, Number(cell.stock || 0) - amount);
  cell.claimCount = Number(cell.claimCount || 0) + 1;
  if (cell.stock <= 0 || cell.claimCount >= 3) {
    cell.stock = 0;
    cell.depleted = true;
    cell.type = 'WASTE';
    delete cell.goldVariant;
  }
}

function supplyCrateLabel(crateType) {
  return crateType === 'LARGE' ? '大补给箱' : '普通补给箱';
}

function grantSupplyCrate(player, crateType, events, actorSeat) {
  if (!player.items) player.items = { doubleDice: 0, trap: 0, medkit: 0 };
  const cfg = crateType === 'LARGE' ? LARGE_SUPPLY_CRATE : NORMAL_SUPPLY_CRATE;
  player.gold = (player.gold || 0) + (cfg.gold || 0);
  player.diamond = (player.diamond || 0) + (cfg.diamond || 0);
  if (cfg.medkit) player.items.medkit += cfg.medkit;
  if (cfg.doubleDice) player.items.doubleDice += cfg.doubleDice;
  if (cfg.weapon) {
    grantWeapon(player, cfg.weapon, events, actorSeat);
  }
  const parts = [];
  if (cfg.gold) parts.push(`${cfg.gold} 金币`);
  if (cfg.diamond) parts.push(`${cfg.diamond} 钻石`);
  if (cfg.medkit) parts.push(`医疗箱×${cfg.medkit}`);
  if (cfg.doubleDice) parts.push(`双骰子×${cfg.doubleDice}`);
  if (cfg.weapon) parts.push('中距离武器');
  events.push({
    type: 'SUPPLY_CRATE',
    message: `${supplyCrateLabel(crateType)}：获得 ${parts.join('、')}`,
    actorSeat,
    crateType,
  });
}

function refreshSupplyCrates(game, crateType, events = []) {
  if (!Array.isArray(game.boardCells)) return 0;
  let count = 0;
  for (const cell of game.boardCells) {
    if (cell.type !== 'SUPPLY') continue;
    cell.crate = crateType;
    count++;
  }
  if (count > 0) {
    events.push({
      type: 'SUPPLY_REFRESH',
      message: `${count} 个补给格刷新${supplyCrateLabel(crateType)}`,
      crateType,
    });
  }
  return count;
}

function airdropNormalSupply(game, events, actorSeat, rng = Math.random) {
  const supplyCells = (game.boardCells || []).filter((c) => c.type === 'SUPPLY');
  if (!supplyCells.length) {
    events.push({
      type: 'EVENT',
      message: '空投信号失效：棋盘上没有补给格',
      actorSeat,
    });
    return;
  }
  const pick = supplyCells[Math.floor(rng() * supplyCells.length)];
  pick.crate = 'NORMAL';
  events.push({
    type: 'AIRDROP',
    message: `空投抵达：格子 ${pick.index} 刷新普通补给箱`,
    actorSeat,
    cellIndex: pick.index,
    crateType: 'NORMAL',
  });
}

function applyBurningCell(player, cellIndex, events) {
  if (player.mysteriousAmulet) {
    events.push({
      type: 'BURNING',
      message: '神秘护符免疫燃烧格伤害',
      actorSeat: player.seat,
      cellIndex,
    });
    return;
  }
  player.hp = (player.hp ?? INITIAL_HP) - 1;
  events.push({
    type: 'BURNING',
    message: `燃烧格 -1 HP`,
    actorSeat: player.seat,
    cellIndex,
    hp: player.hp,
  });
  eliminateIfDead(player, events);
}

/**
 * 计算金币格数值 → AC-8
 */
function resolveGoldAmount(variant, doomActive, rng = Math.random) {
  let amount;
  switch (variant) {
    case 'FIXED_100':
      amount = 100;
      break;
    case 'FIXED_200':
      amount = 200;
      break;
    case 'FIXED_300':
      amount = 300;
      break;
    case 'RANDOM_0_500':
      amount = pickFromPool(RANDOM_0_500_POOL, rng);
      break;
    case 'RANDOM_NEG200_400':
      amount = doomActive ? -200 : pickFromPool(RANDOM_NEG200_400_POOL, rng);
      break;
    default:
      amount = 0;
  }

  if (doomActive && variant !== 'RANDOM_NEG200_400' && amount > 0) {
    amount = -amount;
  }
  return amount;
}

function applyTrapsOnCell(game, player, cellIndex, events) {
  if (!Array.isArray(game.traps)) return;

  for (const trap of game.traps) {
    if (!trap.active || trap.cellIndex !== cellIndex) continue;
    if (trap.ownerSeat === player.seat) continue;

    const damage = trap.damage != null ? trap.damage : 1;
    player.hp -= damage;
    trap.active = false;
    events.push({
      type: 'TRAP',
      message: `踩中陷阱 -${damage} HP`,
      actorSeat: player.seat,
      cellIndex,
      trapOwnerSeat: trap.ownerSeat,
    });
    eliminateIfDead(player, events);
  }
}

function applyLuckyCell(player, events, rng) {
  const entry = LUCKY_ENTRIES[Math.floor(rng() * LUCKY_ENTRIES.length)];
  const actorSeat = player.seat;

  if (entry.kind === 'GOLD') {
    player.gold += entry.amount;
    events.push({
      type: 'LUCKY',
      message: `幸运格 +${entry.amount} 金币`,
      goldDelta: entry.amount,
      actorSeat,
    });
    return;
  }

  if (entry.kind === 'ITEM') {
    if (entry.item === 'trap') {
      player.items.trap += 1;
      events.push({
        type: 'LUCKY',
        message: '幸运格获得陷阱',
        actorSeat,
      });
    } else {
      player.items.doubleDice += 1;
      events.push({
        type: 'LUCKY',
        message: '幸运格获得双骰子',
        actorSeat,
      });
    }
    return;
  }

  const equip = rng() < 0.5 ? 'SWORD' : 'MARCHING_SHOES';
  if (equip === 'SWORD' && player.weapon === 'SWORD') {
    player.gold += LUCKY_DUPLICATE_EQUIP_GOLD;
    events.push({
      type: 'LUCKY',
      message: `已有剑，转化为 +${LUCKY_DUPLICATE_EQUIP_GOLD} 金币`,
      goldDelta: LUCKY_DUPLICATE_EQUIP_GOLD,
      actorSeat,
    });
    return;
  }
  if (equip === 'MARCHING_SHOES' && player.shoes === 'MARCHING_SHOES') {
    player.gold += LUCKY_DUPLICATE_EQUIP_GOLD;
    events.push({
      type: 'LUCKY',
      message: `已有行军鞋，转化为 +${LUCKY_DUPLICATE_EQUIP_GOLD} 金币`,
      goldDelta: LUCKY_DUPLICATE_EQUIP_GOLD,
      actorSeat,
    });
    return;
  }

  if (equip === 'SWORD') {
    grantWeapon(player, 'SWORD', events, actorSeat);
    events.push({ type: 'LUCKY', message: '幸运格获得剑', actorSeat });
  } else {
    player.shoes = 'MARCHING_SHOES';
    events.push({ type: 'LUCKY', message: '幸运格获得行军鞋', actorSeat });
  }
}

function applyInstantCell(game, player, cellIndex, rng) {
  const cell = game.boardCells[cellIndex];
  if (!cell) return [];

  const doomActive = (player.doomRemainingTurns || 0) > 0;
  const events = [];
  const actorSeat = player.seat;

  switch (cell.type) {
    case 'GOLD': {
      const base = claimCellStock(cell);
      const delta = doomActive ? -base : base;
      player.gold += delta;
      markResourceCellClaimed(cell, base);
      events.push({
        type: 'GOLD',
        message: cell.depleted
          ? `金币 ${delta >= 0 ? '+' : ''}${delta}，该格资源枯竭`
          : `金币 ${delta >= 0 ? '+' : ''}${delta}（库存剩余 ${cell.stock}）`,
        goldDelta: delta,
        actorSeat,
        cellIndex,
        stockLeft: cell.stock,
        depleted: !!cell.depleted,
      });
      break;
    }
    case 'DIAMOND': {
      const delta = claimCellStock(cell);
      player.diamond += delta;
      markResourceCellClaimed(cell, delta);
      events.push({
        type: 'DIAMOND',
        message: cell.depleted
          ? `+${delta} 钻石，该格资源枯竭`
          : `+${delta} 钻石（库存剩余 ${cell.stock}）`,
        diamondDelta: delta,
        actorSeat,
        cellIndex,
        stockLeft: cell.stock,
        depleted: !!cell.depleted,
      });
      break;
    }
    case 'SUPPLY':
      if (cell.crate) {
        const crateType = cell.crate;
        cell.crate = null;
        grantSupplyCrate(player, crateType, events, actorSeat);
      }
      break;
    case 'EVENT':
      break;
    case 'LUCKY':
      break;
    default:
      break;
  }

  return events;
}

function mapCellTypeToPendingType(cellType) {
  if (cellType === 'GOLD_SHOP') return 'GOLD_SHOP';
  if (cellType === 'LEGENDARY_SHOP') return 'LEGENDARY_SHOP';
  if (cellType === 'FINAL_SHOP') return 'FINAL_SHOP';
  if (cellType === 'LUCKY') return 'LUCKY';
  return null;
}

function setupPendingAtCell(game, player, cellIndex, pendingType, events) {
  game.pendingInteraction = {
    seat: player.seat,
    type: pendingType,
  };

  if (pendingType === 'LUCKY') {
    game.luckySpin = {
      seat: player.seat,
      phase: 'READY',
      options: [...LUCKY_SPIN_OPTIONS],
    };
  }

  const label =
    pendingType === 'GOLD_SHOP'
      ? '金币商店'
      : pendingType === 'LEGENDARY_SHOP'
        ? '传说商店'
        : pendingType === 'FINAL_SHOP'
          ? '决战商店'
          : pendingType === 'LUCKY'
            ? '幸运格'
            : '交互格';
  events.push({
    type: 'PENDING_INTERACTION',
    message: `可在${label}交互`,
    actorSeat: player.seat,
    cellIndex,
  });
}

/**
 * 沿路径逐格处理，遇到首个需交互格（商店/小游戏/幸运/事件）即暂停
 * @returns {{ events: object[], paused: boolean, consumedLength: number }}
 */
function applyPathSegment(game, player, pathIndices, rng = Math.random) {
  if (!player || player.isDefeated || !pathIndices.length) {
    return { events: [], paused: false, consumedLength: 0 };
  }

  ensurePlayerCombatFields(player);
  if (!Array.isArray(game.traps)) game.traps = [];
  const events = [];
  game.survivalPhase = survivalPhase(game);

  for (let i = 0; i < pathIndices.length; i++) {
    const cellIndex = pathIndices[i];
    if (player.isDefeated) break;

    markRegionVisited(player, cellIndex);

    applyTrapsOnCell(game, player, cellIndex, events);
    if (player.isDefeated) {
      return { events, paused: false, consumedLength: i + 1 };
    }

    const cell = game.boardCells[cellIndex];
    if (!cell) continue;

    if (
      game.survivalPhase === 'FINAL' &&
      (cell.type === 'WASTE' || cell.type === 'SUPPLY' || cell.type === 'BURNING')
    ) {
      if (cell.type !== 'BURNING') cell.type = 'BURNING';
      applyBurningCell(player, cellIndex, events);
      if (player.isDefeated) {
        return { events, paused: false, consumedLength: i + 1 };
      }
      continue;
    }

    if (INTERACTION_CELL_TYPES.includes(cell.type)) {
      refreshShopStockOnPass(player, cell.type);
      const cellType = cell.type;
      const pendingType = mapCellTypeToPendingType(cellType);
      if (pendingType) {
        if (cellType === 'LUCKY') {
          relocateLuckyCell(game, cellIndex, rng);
        }
        setupPendingAtCell(game, player, cellIndex, pendingType, events);
        return { events, paused: true, consumedLength: i + 1 };
      }
    }

    if (cell.type === 'EVENT') {
      setupEventAtCell(game, player, cellIndex, events, rng);
      return { events, paused: true, consumedLength: i + 1 };
    }

    const instant = applyInstantCell(game, player, cellIndex, rng);
    events.push(...instant);

    if (player.isDefeated) {
      return { events, paused: false, consumedLength: i + 1 };
    }
  }

  return { events, paused: false, consumedLength: pathIndices.length };
}

/**
 * 沿路径依次触发格子（单段；多段续走由 movePause + continueMove）
 */
function applyPathCells(game, player, pathIndices, rng = Math.random) {
  game.pendingInteraction = null;
  game.luckySpin = null;
  game.movePause = null;

  const { events, paused, consumedLength } = applyPathSegment(
    game,
    player,
    pathIndices,
    rng,
  );

  const walked = pathIndices.slice(0, consumedLength);
  if (walked.length) {
    player.position = walked[walked.length - 1];
  }

  if (paused && consumedLength < pathIndices.length) {
    game.movePause = {
      seat: player.seat,
      segmentSteps: consumedLength,
      remainingPath: pathIndices.slice(consumedLength),
    };
  }

  game.lastEvents = events;
  if (events.length) {
    game.lastEvent = { ...events[events.length - 1], actorSeat: player.seat };
  }

  return events;
}

/** 构建移动路径（不含起点，含每一步落点） */
function buildPathIndices(fromPos, stepCount, boardSize = BOARD_SIZE) {
  const path = [];
  for (let s = 1; s <= stepCount; s++) {
    path.push((fromPos + s) % boardSize);
  }
  return path;
}

/** 兼容单格落点（测试与旧调用） */
function applyCellLanding(game, player, cellIndex, rng = Math.random) {
  return applyPathCells(game, player, [cellIndex], rng);
}

/** 幸运格被踩后变普通，在其它普通格随机重生（总数不变） */
function relocateLuckyCell(game, fromIndex, rng = Math.random) {
  const from = game.boardCells[fromIndex];
  if (!from || from.type !== 'LUCKY') return;

  from.type = 'NORMAL';
  const normals = game.boardCells.filter(
    (c, i) => i !== fromIndex && c.type === 'NORMAL',
  );
  if (!normals.length) return;

  const pick = normals[Math.floor(rng() * normals.length)];
  pick.type = 'LUCKY';
}

/** 钻石格被踩后变普通，在普通格随机重生 → AC-9 */
function relocateDiamond(game, fromIndex, rng = Math.random) {
  const from = game.boardCells[fromIndex];
  if (!from) return;

  from.type = 'NORMAL';
  delete from.goldVariant;

  const normals = game.boardCells.filter((c) => c.type === 'NORMAL');
  if (!normals.length) return;

  const pick = normals[Math.floor(rng() * normals.length)];
  pick.type = 'DIAMOND';
  game.diamondCellIndex = pick.index;
}

module.exports = {
  RANDOM_0_500_POOL,
  RANDOM_NEG200_400_POOL,
  resolveGoldAmount,
  applyCellLanding,
  applyPathCells,
  applyPathSegment,
  buildPathIndices,
  relocateDiamond,
  relocateLuckyCell,
  pickFromPool,
  LUCKY_ENTRIES,
  grantSupplyCrate,
  refreshSupplyCrates,
  survivalPhase,
  airdropNormalSupply,
};
