const {
  FINAL_SHOP_COUNT,
  FINAL_WEAPON_UPGRADE_GOLD,
  FINAL_DIVINE_STRIKE_DIAMOND,
  FINAL_DIVINE_STRIKE_DAMAGE,
} = require('./constants');

const FINAL_SHOP_ITEMS = ['WEAPON_UPGRADE', 'DIVINE_STRIKE'];

function pickRandomIndices(candidates, count, rng = Math.random) {
  const pool = [...candidates];
  const picked = [];
  while (picked.length < count && pool.length) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

/** 决战阶段在棋盘上刷新决战商店格 */
function spawnFinalShops(game, events, rng = Math.random) {
  if (game.finalShopsSpawned) return [];
  const candidates = [];
  (game.boardCells || []).forEach((cell, index) => {
    if (cell && (cell.type === 'NORMAL' || cell.type === 'WASTE')) {
      candidates.push(index);
    }
  });
  const indices = pickRandomIndices(candidates, FINAL_SHOP_COUNT, rng);
  indices.forEach((i) => {
    if (game.boardCells[i]) game.boardCells[i].type = 'FINAL_SHOP';
  });
  game.finalShopsSpawned = true;
  if (indices.length && Array.isArray(events)) {
    events.push({
      type: 'SURVIVAL_PHASE',
      message: `决战商店已在棋盘上刷新 ${indices.length} 处（武器升级 / 天罚）`,
      survivalPhase: 'FINAL',
    });
  }
  return indices;
}

function ensureFinalShopStock(player) {
  if (!player.shopStock) {
    player.shopStock = {
      goldShopVersion: 0,
      legendaryShopVersion: 0,
      goldShop: {},
      legendaryShop: {},
    };
  }
  if (!player.shopStock.finalShop) {
    player.shopStock.finalShop = {
      WEAPON_UPGRADE: true,
      DIVINE_STRIKE: true,
    };
  }
}

function refreshFinalShopStock(player) {
  player.shopStock.finalShop = {
    WEAPON_UPGRADE: true,
    DIVINE_STRIKE: true,
  };
}

function getFinalPrice(itemType) {
  if (itemType === 'WEAPON_UPGRADE') return { gold: FINAL_WEAPON_UPGRADE_GOLD };
  if (itemType === 'DIVINE_STRIKE') return { diamond: FINAL_DIVINE_STRIKE_DIAMOND };
  return null;
}

function applyDivineStrike(game, attacker, events, rng = Math.random) {
  const targets = game.players.filter(
    (p) => !p.isDefeated && p.seat !== attacker.seat,
  );
  if (!targets.length) {
    const err = new Error('NO_VALID_TARGET');
    err.code = 'NO_VALID_TARGET';
    throw err;
  }
  const target = targets[Math.floor(rng() * targets.length)];
  target.hp = Math.max(0, (target.hp || 0) - FINAL_DIVINE_STRIKE_DAMAGE);
  const killed = target.hp <= 0;
  if (killed) {
    target.hp = 0;
    target.isDefeated = true;
    attacker.kills = (attacker.kills || 0) + 1;
  }
  events.push({
    type: 'FINAL_SHOP',
    message: killed
      ? `天罚击中 ${target.nickname || `玩家${target.seat + 1}`}，造成 ${FINAL_DIVINE_STRIKE_DAMAGE} 伤害并淘汰`
      : `天罚击中 ${target.nickname || `玩家${target.seat + 1}`}，造成 ${FINAL_DIVINE_STRIKE_DAMAGE} 伤害`,
    actorSeat: attacker.seat,
    targetSeat: target.seat,
    damage: FINAL_DIVINE_STRIKE_DAMAGE,
    killed,
  });
  return { target, killed };
}

function buyFinalShopItem(game, player, itemType, rng = Math.random) {
  if (!FINAL_SHOP_ITEMS.includes(itemType)) {
    const err = new Error('INVALID_SHOP_ITEM');
    err.code = 'INVALID_SHOP_ITEM';
    throw err;
  }
  const pending = game.pendingInteraction;
  if (!pending || pending.type !== 'FINAL_SHOP' || pending.seat !== player.seat) {
    const err = new Error('NO_SHOP_INTERACTION');
    err.code = 'NO_SHOP_INTERACTION';
    throw err;
  }
  ensureFinalShopStock(player);
  const stock = player.shopStock.finalShop;
  if (!stock[itemType]) {
    const err = new Error('SHOP_OUT_OF_STOCK');
    err.code = 'SHOP_OUT_OF_STOCK';
    throw err;
  }
  const price = getFinalPrice(itemType);
  const events = [];
  if (itemType === 'WEAPON_UPGRADE') {
    if (!player.weapon) {
      const err = new Error('NO_WEAPON');
      err.code = 'NO_WEAPON';
      throw err;
    }
    if ((player.gold || 0) < price.gold) {
      const err = new Error('INSUFFICIENT_GOLD');
      err.code = 'INSUFFICIENT_GOLD';
      throw err;
    }
    player.gold -= price.gold;
    player.weaponAttackBonus = (player.weaponAttackBonus || 0) + 1;
    stock.WEAPON_UPGRADE = false;
    events.push({
      type: 'FINAL_SHOP',
      message: `购买了武器升级（-${price.gold} 金），攻击力 +1（当前 +${player.weaponAttackBonus}）`,
      actorSeat: player.seat,
      itemType,
    });
  } else {
    if ((player.diamond || 0) < price.diamond) {
      const err = new Error('INSUFFICIENT_DIAMOND');
      err.code = 'INSUFFICIENT_DIAMOND';
      throw err;
    }
    player.diamond -= price.diamond;
    stock.DIVINE_STRIKE = false;
    applyDivineStrike(game, player, events, rng);
    if (events.length) {
      events[events.length - 1].message = `发动天罚（-${price.diamond} 钻）：${events[events.length - 1].message}`;
    }
  }
  game.pendingInteraction = null;
  game.updatedAt = Date.now();
  if (events.length) {
    if (!Array.isArray(game.lastEvents)) game.lastEvents = [];
    game.lastEvents.push(...events);
    game.lastEvent = { ...events[events.length - 1] };
  }
  return { ok: true, events, event: events[events.length - 1] };
}

module.exports = {
  FINAL_SHOP_ITEMS,
  spawnFinalShops,
  refreshFinalShopStock,
  buyFinalShopItem,
};
