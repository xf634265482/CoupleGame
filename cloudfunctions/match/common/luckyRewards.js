const { LUCKY_DUPLICATE_EQUIP_GOLD } = require('./constants');
const { grantWeapon } = require('./ShopResolver');

/** 幸运转盘展示文案（与结算一致） */
const LUCKY_SPIN_OPTIONS = [
  '+200 金币',
  '+300 金币',
  '+400 金币',
  '+600 金币',
  '获得陷阱',
  '获得双骰子',
  '获得随机装备',
];

/**
 * 按转盘选项结算奖励（服务端权威）
 */
function applyLuckySpinLabel(game, player, seat, label, events, rng = Math.random) {
  const goldMatch = label && label.match(/\+(\d+)\s*金币/);
  if (goldMatch) {
    const delta = Number(goldMatch[1]);
    player.gold = (player.gold || 0) + delta;
    events.push({
      type: 'LUCKY',
      message: `幸运格：+${delta} 金币`,
      goldDelta: delta,
      actorSeat: seat,
    });
    return;
  }
  if (label.includes('陷阱')) {
    if (!player.items) player.items = { doubleDice: 0, trap: 0, medkit: 0 };
    player.items.trap += 1;
    events.push({ type: 'LUCKY', message: '幸运格：获得陷阱', actorSeat: seat });
    return;
  }
  if (label.includes('双骰子')) {
    if (!player.items) player.items = { doubleDice: 0, trap: 0, medkit: 0 };
    player.items.doubleDice += 1;
    events.push({ type: 'LUCKY', message: '幸运格：获得双骰子', actorSeat: seat });
    return;
  }
  const equip = rng() < 0.5 ? 'SWORD' : 'MARCHING_SHOES';
  if (equip === 'MARCHING_SHOES' && player.shoes === 'MARCHING_SHOES') {
    player.gold = (player.gold || 0) + LUCKY_DUPLICATE_EQUIP_GOLD;
    events.push({
      type: 'LUCKY',
      message: `幸运格：已有行军鞋，转化为 +${LUCKY_DUPLICATE_EQUIP_GOLD} 金币`,
      goldDelta: LUCKY_DUPLICATE_EQUIP_GOLD,
      actorSeat: seat,
    });
    return;
  }
  if (equip === 'SWORD') {
    grantWeapon(player, 'SWORD', events, seat);
    events.push({ type: 'LUCKY', message: '幸运格：获得剑', actorSeat: seat });
  } else {
    player.shoes = 'MARCHING_SHOES';
    events.push({ type: 'LUCKY', message: '幸运格：获得行军鞋', actorSeat: seat });
  }
}

module.exports = {
  LUCKY_SPIN_OPTIONS,
  applyLuckySpinLabel,
};
