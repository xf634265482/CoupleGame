const {
  FINAL_WEAPON_UPGRADE_GOLD,
  FINAL_DIVINE_STRIKE_DIAMOND,
} = require('./constants');
const {
  GOLD_SHOP_ITEMS,
  LEGENDARY_SHOP_ITEMS,
  buyShopItem: shopBuy,
  getPrice,
  getShopStockMap,
} = require('./ShopResolver');
const GOLD_BUY_PRIORITY = ['SWORD', 'MARCHING_SHOES', 'DOUBLE_DICE', 'TRAP'];
const LEGENDARY_BUY_PRIORITY = ['GUN', 'MEDKIT'];

function botPickFinalShopItem(player) {
  const stock = player.shopStock?.finalShop;
  if (!stock) return null;
  if (
    stock.WEAPON_UPGRADE &&
    player.weapon &&
    (player.gold || 0) >= FINAL_WEAPON_UPGRADE_GOLD
  ) {
    return 'WEAPON_UPGRADE';
  }
  if (
    stock.DIVINE_STRIKE &&
    (player.diamond || 0) >= FINAL_DIVINE_STRIKE_DIAMOND
  ) {
    return 'DIVINE_STRIKE';
  }
  return null;
}

function botPickShopItem(player, shopType) {
  const stock = getShopStockMap(player, shopType);
  const balance =
    shopType === 'GOLD' ? player.gold || 0 : player.diamond || 0;
  const order =
    shopType === 'GOLD' ? GOLD_BUY_PRIORITY : LEGENDARY_BUY_PRIORITY;
  for (const item of order) {
    if (!stock[item]) continue;
    const price = getPrice(shopType, item);
    if (price != null && balance >= price) return item;
  }
  return null;
}

/**
 * 处理 BOARD 阶段 pendingInteraction（替代“自动跳过”）
 * @returns {boolean} 是否执行了一步操作
 */
function botHandlePendingInteraction(game, bot, now, rng, hooks) {
  const { pushBotAction, luckyStart, luckyEnd, maybeSettleLucky, resolveBoardEvent } =
    hooks;
  const pending = game.pendingInteraction;
  if (!pending || pending.seat !== bot.seat) return false;

  const type = pending.type || pending.cellType;

  if (type === 'CELL_ACK') {
    game.pendingInteraction = null;
    pushBotAction(game, bot, '确认事件格效果');
    return true;
  }

  if (type === 'EVENT' || type === 'CHARITY_SHOP') {
    const es = game.eventState;
    if (!es) {
      game.pendingInteraction = null;
      return true;
    }
    if (es.phase === 'INTRO') {
      resolveBoardEvent(game, bot.openId, { action: 'ack' });
      pushBotAction(game, bot, `事件：${es.title || '随机事件'}`);
      return true;
    }
    if (es.id === 'BOSS_SUPPRESSION' && es.phase === 'CHOICE') {
      resolveBoardEvent(game, bot.openId, {
        action: 'choice',
        value: rng() < 0.5 ? 'LEFT' : 'RIGHT',
      });
      pushBotAction(game, bot, 'BOSS压制：选择躲闪方向');
      return true;
    }
    if (es.id === 'LUCKY_GAMBLER' && es.phase === 'BET') {
      resolveBoardEvent(game, bot.openId, {
        action: 'bet',
        value: Math.max(100, Math.min(bot.gold || 0, 300)),
      });
      pushBotAction(game, bot, '幸运赌徒：下注');
      return true;
    }
    if (es.id === 'RESOURCE_AUCTION' && es.phase === 'AUCTION' && es.data?.currentBidder === bot.seat) {
      if (rng() < 0.35) {
        resolveBoardEvent(game, bot.openId, { action: 'pass' });
      } else {
        const bid = Math.min(
          bot.gold || 0,
          Math.max(100, (es.data.highestBid || 0) + 50),
        );
        resolveBoardEvent(game, bot.openId, { action: 'bid', value: bid });
      }
      pushBotAction(game, bot, '资源拍卖会：出价');
      return true;
    }
    if (type === 'CHARITY_SHOP') {
      const items = ['MEDKIT', 'DOUBLE_DICE', 'SWORD'];
      const pick = items[Math.floor(rng() * items.length)];
      if ((bot.gold || 0) >= 100) {
        const { buyCharityItem } = require('./ShopResolver');
        buyCharityItem(game, bot, pick);
      } else {
        resolveBoardEvent(game, bot.openId, { action: 'leave' });
      }
      pushBotAction(game, bot, '慈善商人交互');
      return true;
    }
    return false;
  }

  if (type === 'GOLD_SHOP' || type === 'LEGENDARY_SHOP' || type === 'FINAL_SHOP') {
    const shopType =
      type === 'GOLD_SHOP' ? 'GOLD' : type === 'LEGENDARY_SHOP' ? 'LEGENDARY' : 'FINAL';
    const item =
      shopType === 'FINAL'
        ? botPickFinalShopItem(bot)
        : botPickShopItem(bot, shopType);
    if (item) {
      shopBuy(game, bot, shopType, item);
      pushBotAction(game, bot, '购买了道具');
    } else {
      game.pendingInteraction = null;
      pushBotAction(game, bot, '离开商店');
    }
    return true;
  }

  if (type === 'LUCKY') {
    const ls = game.luckySpin;
    if (!ls || ls.seat !== bot.seat) return false;

    if (ls.phase === 'READY') {
      luckyStart(game, bot.openId, now);
      pushBotAction(game, bot, '启动幸运转盘');
      return true;
    }
    if (ls.phase === 'FAST') {
      luckyEnd(game, bot.openId, now);
      pushBotAction(game, bot, '停止幸运转盘');
      return true;
    }
    if (ls.phase === 'SLOW') {
      if (now < (ls.stopAt || 0)) {
        game.botNextStepAt = ls.stopAt;
        return false;
      }
      maybeSettleLucky(game, now);
      const label = ls.options?.[ls.finalIndex ?? 0] || '奖励';
      pushBotAction(game, bot, `幸运格结果：${label}`);
      return true;
    }
    return false;
  }

  return false;
}

module.exports = {
  botHandlePendingInteraction,
  botPickShopItem,
};
