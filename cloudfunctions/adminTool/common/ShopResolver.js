const {
  GOLD_SHOP_PRICES,
  LEGENDARY_SHOP_PRICES,
  RAPID_SHOES_MERGE_COUNT,
} = require('./constants');

const GOLD_SHOP_ITEMS = ['SWORD', 'MARCHING_SHOES', 'DOUBLE_DICE', 'TRAP', 'IMMUNITY_POTION'];
const LEGENDARY_SHOP_ITEMS = ['GUN', 'MEDKIT'];

const DEFAULT_GOLD_SHOP = {
  SWORD: true,
  MARCHING_SHOES: true,
  DOUBLE_DICE: true,
  TRAP: true,
  IMMUNITY_POTION: true,
};

const DEFAULT_LEGENDARY_SHOP = {
  GUN: true,
  MEDKIT: true,
};

function ensureShopStock(player) {
  if (!player.items) {
    player.items = { doubleDice: 0, trap: 0, medkit: 0 };
  }
  if (!player.weaponInventory) {
    player.weaponInventory = {};
  }
  if (player.shoesCount == null) {
    player.shoesCount = player.shoes ? 1 : 0;
  }
  if (player.weaponAttackBonus == null) {
    player.weaponAttackBonus = 0;
  }
  if (!player.shopStock) {
    player.shopStock = {
      goldShopVersion: 0,
      legendaryShopVersion: 0,
      goldShop: { ...DEFAULT_GOLD_SHOP },
      legendaryShop: { ...DEFAULT_LEGENDARY_SHOP },
    };
  }
}

function weaponLabel(weapon) {
  if (weapon === 'SWORD') return '近距离武器';
  if (weapon === 'GUN') return '中距离武器';
  if (weapon === 'ROCKET') return '远距离武器';
  return weapon;
}

function setWeaponByTier(player, weapon) {
  player.weapon = weapon;
}

function grantWeapon(player, weapon, events = [], actorSeat = player.seat) {
  ensureShopStock(player);
  const inv = player.weaponInventory;
  inv[weapon] = (inv[weapon] || 0) + 1;
  let finalWeapon = weapon;
  const messages = [];

  const tryMerge = (from, to) => {
    while ((inv[from] || 0) >= 2) {
      inv[from] -= 2;
      inv[to] = (inv[to] || 0) + 1;
      finalWeapon = to;
      messages.push(`${weaponLabel(from)} ×2 自动合成为${weaponLabel(to)}`);
    }
  };

  tryMerge('SWORD', 'GUN');
  tryMerge('GUN', 'ROCKET');

  while ((inv.ROCKET || 0) >= 2) {
    inv.ROCKET -= 2;
    player.weaponAttackBonus = (player.weaponAttackBonus || 0) + 1;
    finalWeapon = 'ROCKET';
    messages.push(`远距离武器 ×2 转化为攻击力 +1（当前 +${player.weaponAttackBonus}）`);
  }

  if ((inv.ROCKET || 0) > 0) setWeaponByTier(player, 'ROCKET');
  else if ((inv.GUN || 0) > 0) setWeaponByTier(player, 'GUN');
  else if ((inv.SWORD || 0) > 0) setWeaponByTier(player, 'SWORD');
  else if (!player.weapon && finalWeapon) setWeaponByTier(player, finalWeapon);

  for (const message of messages) {
    events.push({
      type: 'WEAPON_MERGE',
      message,
      actorSeat,
      weapon: player.weapon,
      weaponAttackBonus: player.weaponAttackBonus || 0,
    });
  }

  return { weapon: player.weapon, mergeMessages: messages };
}

/** 路过商店时刷新该玩家独立库存 → AC-7, AC-9 */
function refreshShopStockOnPass(player, cellType) {
  ensureShopStock(player);
  if (cellType === 'FINAL_SHOP') {
    const { refreshFinalShopStock } = require('./finalShop');
    refreshFinalShopStock(player);
  } else if (cellType === 'GOLD_SHOP') {
    player.shopStock.goldShopVersion =
      (player.shopStock.goldShopVersion || 0) + 1;
    player.shopStock.goldShop = { ...DEFAULT_GOLD_SHOP };
  } else if (cellType === 'LEGENDARY_SHOP') {
    player.shopStock.legendaryShopVersion =
      (player.shopStock.legendaryShopVersion || 0) + 1;
    player.shopStock.legendaryShop = { ...DEFAULT_LEGENDARY_SHOP };
  }
}

function getShopStockMap(player, shopType) {
  ensureShopStock(player);
  return shopType === 'GOLD'
    ? player.shopStock.goldShop
    : player.shopStock.legendaryShop;
}

function getPrice(shopType, itemType) {
  if (shopType === 'GOLD') {
    if (!GOLD_SHOP_ITEMS.includes(itemType)) return null;
    return GOLD_SHOP_PRICES[itemType];
  }
  if (shopType === 'LEGENDARY') {
    if (!LEGENDARY_SHOP_ITEMS.includes(itemType)) return null;
    return LEGENDARY_SHOP_PRICES[itemType];
  }
  return null;
}

function isItemInShop(shopType, itemType) {
  return getPrice(shopType, itemType) != null;
}

function grantShopItem(player, itemType) {
  ensureShopStock(player);
  switch (itemType) {
    case 'SWORD':
    case 'GUN':
      grantWeapon(player, itemType);
      break;
    case 'MARCHING_SHOES':
      // 3 个行军鞋自动合成神速鞋（+2 步）
      player.shoesCount = (player.shoesCount || 0) + 1;
      if (player.shoesCount >= RAPID_SHOES_MERGE_COUNT) {
        player.shoes = 'RAPID_SHOES';
      } else {
        player.shoes = 'MARCHING_SHOES';
      }
      break;
    case 'DOUBLE_DICE':
      player.items.doubleDice += 1;
      break;
    case 'TRAP':
      player.items.trap += 1;
      break;
    case 'MEDKIT':
      player.items.medkit += 1;
      break;
    case 'IMMUNITY_POTION':
      player.infected = false;
      break;
    case 'ROCKET':
      grantWeapon(player, 'ROCKET');
      break;
    default:
      break;
  }
}

function expectedPendingType(shopType) {
  return shopType === 'GOLD' ? 'GOLD_SHOP' : 'LEGENDARY_SHOP';
}

/**
 * 购买商店商品 → AC-6～AC-9
 * @param {object} game
 * @param {object} player
 * @param {string} itemType
 */
function buyCharityItem(game, player, itemType) {
  const { CHARITY_PRICES } = require('./EventResolver');
  const pending = game.pendingInteraction;
  if (!pending || pending.type !== 'CHARITY_SHOP' || pending.seat !== player.seat) {
    const err = new Error('NO_SHOP_INTERACTION');
    err.code = 'NO_SHOP_INTERACTION';
    throw err;
  }
  const price = CHARITY_PRICES[itemType];
  if (price == null) {
    const err = new Error('INVALID_SHOP_ITEM');
    err.code = 'INVALID_SHOP_ITEM';
    throw err;
  }
  if ((player.gold || 0) < price) {
    const err = new Error('INSUFFICIENT_GOLD');
    err.code = 'INSUFFICIENT_GOLD';
    throw err;
  }
  player.gold -= price;
  const grantEvents = [];
  if (itemType === 'SWORD' || itemType === 'ROCKET') {
    grantWeapon(player, itemType, grantEvents, player.seat);
  } else {
    grantShopItem(player, itemType === 'MEDKIT' ? 'MEDKIT' : itemType);
  }
  const event = {
    type: 'SHOP_PURCHASE',
    message: `慈善商人：购买${itemType}`,
    actorSeat: player.seat,
    shopType: 'CHARITY',
    itemType,
    price,
  };
  if (!Array.isArray(game.lastEvents)) game.lastEvents = [];
  game.lastEvents.push(event, ...grantEvents);
  game.lastEvent = { ...event };
  return { ok: true, purchasedItem: itemType, shopType: 'CHARITY', price, event };
}

function buyShopItem(game, player, shopType, itemType, rng = Math.random) {
  if (shopType === 'CHARITY') {
    return buyCharityItem(game, player, itemType);
  }
  if (shopType === 'FINAL') {
    const { buyFinalShopItem } = require('./finalShop');
    return buyFinalShopItem(game, player, itemType, rng);
  }
  ensureShopStock(player);

  if (!isItemInShop(shopType, itemType)) {
    const err = new Error('INVALID_SHOP_ITEM');
    err.code = 'INVALID_SHOP_ITEM';
    throw err;
  }

  const pending = game.pendingInteraction;
  const expectedType = expectedPendingType(shopType);
  if (
    !pending ||
    pending.seat !== player.seat ||
    pending.type !== expectedType
  ) {
    const err = new Error('NO_SHOP_INTERACTION');
    err.code = 'NO_SHOP_INTERACTION';
    throw err;
  }

  const stock = getShopStockMap(player, shopType);
  if (!stock[itemType]) {
    const err = new Error('SHOP_OUT_OF_STOCK');
    err.code = 'SHOP_OUT_OF_STOCK';
    throw err;
  }

  const price = getPrice(shopType, itemType);

  if (shopType === 'GOLD') {
    if ((player.gold || 0) < price) {
      const err = new Error('INSUFFICIENT_GOLD');
      err.code = 'INSUFFICIENT_GOLD';
      throw err;
    }
    player.gold -= price;
  } else {
    if ((player.diamond || 0) < price) {
      const err = new Error('INSUFFICIENT_DIAMOND');
      err.code = 'INSUFFICIENT_DIAMOND';
      throw err;
    }
    player.diamond -= price;
  }

  stock[itemType] = false;
  const grantEvents = [];
  if (itemType === 'SWORD' || itemType === 'GUN') {
    grantWeapon(player, itemType, grantEvents, player.seat);
  } else {
    grantShopItem(player, itemType);
  }
  game.pendingInteraction = null;

  const event = {
    type: 'SHOP_PURCHASE',
    // 购买细节不在消息里展示（客户端只显示“某某玩家购买了道具”）
    message: '购买了道具',
    actorSeat: player.seat,
    shopType,
    itemType,
    price,
  };

  if (!Array.isArray(game.lastEvents)) game.lastEvents = [];
  game.lastEvents.push(event);
  game.lastEvents.push(...grantEvents);
  game.lastEvent = { ...event };
  if (grantEvents.length) {
    game.lastEvent = { ...grantEvents[grantEvents.length - 1] };
  }

  return {
    ok: true,
    purchasedItem: itemType,
    shopType,
    price,
    event,
  };
}

module.exports = {
  GOLD_SHOP_ITEMS,
  LEGENDARY_SHOP_ITEMS,
  DEFAULT_GOLD_SHOP,
  DEFAULT_LEGENDARY_SHOP,
  ensureShopStock,
  refreshShopStockOnPass,
  getShopStockMap,
  getPrice,
  buyShopItem,
  buyCharityItem,
  grantShopItem,
  grantWeapon,
};
