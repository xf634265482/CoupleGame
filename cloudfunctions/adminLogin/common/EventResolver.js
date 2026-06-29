const {
  BOARD_SIZE,
  INITIAL_HP,
  DICE_MAX,
} = require('./constants');
const { grantWeapon } = require('./ShopResolver');

const EVENT_POOL = [
  'BOSS_SUPPRESSION',
  'CHARITY_MERCHANT',
  'ABANDONED_CHEST',
  'SANDSTORM',
  'LUCKY_GAMBLER',
  'CHOSEN_ONE',
  'INFECTION',
  'RESOURCE_AUCTION',
  'TIME_WARP',
];

const EVENT_META = {
  BOSS_SUPPRESSION: {
    title: 'boss压制',
    description: 'BOSS突发恶疾攻击所有玩家。',
    effect: '所有玩家选择左/右躲闪；BOSS随机攻击一侧，同侧-2HP，异侧获得一次+1伤害的临时攻击。',
  },
  CHARITY_MERCHANT: {
    title: '慈善商人',
    description: '败家子又来倒卖家产了..',
    effect: '可购买：火箭筒2000金、医疗包100金、双骰子300金、剑800金。',
  },
  ABANDONED_CHEST: {
    title: '废弃宝箱',
    description: '是沧海遗珠呢？还是...',
    effect: '随机获得奖励或触发陷阱/天罚。',
  },
  SANDSTORM: {
    title: '沙尘暴',
    description: '天有不测风云...',
    effect: '所有玩家本回合骰子移动步数-1。',
  },
  LUCKY_GAMBLER: {
    title: '幸运赌徒',
    description: '路上突然冲出来一个赌徒，来吧！一决胜负',
    effect: '投入100~当前金币（不足则-1HP），50%获得投入×2，50%失去投入。',
  },
  CHOSEN_ONE: {
    title: '天选之人',
    description: '一看你就是天生的幸运儿，被财神眷顾...',
    effect: '每回合+100金币，并成为悬赏目标；击杀者可获得其全部金币钻石且永久伤害+1。',
  },
  INFECTION: {
    title: '感染',
    description: '倒霉的你被神秘病毒感染啦...',
    effect: '感染：每回合-0.5HP、伤害+0.5、攻击范围+2；造成伤害后可传染目标。',
  },
  RESOURCE_AUCTION: {
    title: '资源拍卖会',
    description: '突然莫名其妙出现一场拍卖会',
    effect: '竞拍神秘护符（伤害+0.5、范围+1、减伤1、免疫燃烧格），出价最高者获得。',
  },
  TIME_WARP: {
    title: '时空穿梭',
    description: '咦？刚刚踩到了啥..',
    effect: '前进12格。',
  },
};

const CHARITY_PRICES = {
  ROCKET: 2000,
  MEDKIT: 100,
  DOUBLE_DICE: 300,
  SWORD: 800,
};

const AUCTION_START_BID = 100;
const AUCTION_MIN_STEP = 50;

function pickEventId(rng = Math.random) {
  return EVENT_POOL[Math.floor(rng() * EVENT_POOL.length)];
}

function alivePlayers(game) {
  return (game.players || []).filter((p) => !p.isDefeated);
}

function pushEvent(game, event) {
  if (!Array.isArray(game.lastEvents)) game.lastEvents = [];
  game.lastEvents.push(event);
  game.lastEvent = { ...event };
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

function ensurePlayerFields(player) {
  if (!player.items) player.items = { doubleDice: 0, trap: 0, medkit: 0 };
  if (player.weaponAttackBonus == null) player.weaponAttackBonus = 0;
  if (player.permanentDamageBonus == null) player.permanentDamageBonus = 0;
}

function applyInfection(player) {
  ensurePlayerFields(player);
  player.infected = true;
}

function cureInfection(player) {
  player.infected = false;
}

function grantMysteriousAmulet(player) {
  player.mysteriousAmulet = true;
}

function setupEventAtCell(game, player, cellIndex, events, rng = Math.random) {
  const eventId = pickEventId(rng);
  const meta = EVENT_META[eventId];
  game.pendingInteraction = {
    seat: player.seat,
    type: 'EVENT',
    cellIndex,
    eventId,
  };
  game.eventState = {
    id: eventId,
    title: meta.title,
    description: meta.description,
    effect: meta.effect,
    phase: 'INTRO',
    triggerSeat: player.seat,
    cellIndex,
    data: {},
  };
  events.push({
    type: 'EVENT',
    message: `事件格：${meta.title} — ${meta.description}`,
    actorSeat: player.seat,
    cellIndex,
    eventId,
  });
}

function startEventPhase(game, eventState) {
  const id = eventState.id;
  if (id === 'BOSS_SUPPRESSION') {
    eventState.phase = 'CHOICE';
    eventState.data.choices = {};
    eventState.data.bossSide = Math.random() < 0.5 ? 'LEFT' : 'RIGHT';
    game.pendingInteraction = {
      seat: eventState.triggerSeat,
      type: 'EVENT',
      eventId: id,
      cellIndex: eventState.cellIndex,
      allPlayers: true,
    };
    return;
  }
  if (id === 'LUCKY_GAMBLER') {
    eventState.phase = 'BET';
    return;
  }
  if (id === 'RESOURCE_AUCTION') {
    eventState.phase = 'AUCTION';
    eventState.data.highestBid = 0;
    eventState.data.highestBidder = null;
    eventState.data.currentBidder = alivePlayers(game)[0]?.seat ?? 0;
    eventState.data.passed = {};
    return;
  }
  if (id === 'CHARITY_MERCHANT') {
    game.pendingInteraction.type = 'CHARITY_SHOP';
    eventState.phase = 'SHOP';
    return;
  }
  eventState.phase = 'RESOLVING';
}

function applyBossSuppression(game, eventState, events) {
  const bossSide = eventState.data.bossSide;
  const choices = eventState.data.choices || {};
  for (const p of alivePlayers(game)) {
    const choice = choices[p.seat] || 'LEFT';
    if (choice === bossSide) {
      p.hp = (p.hp ?? INITIAL_HP) - 2;
      events.push({
        type: 'EVENT',
        message: `${p.nickname || `玩家${p.seat + 1}`} 与BOSS同侧，-2 HP`,
        actorSeat: p.seat,
        eventId: 'BOSS_SUPPRESSION',
      });
      eliminateIfDead(p, events);
    } else {
      p.tempAttackBonus = (p.tempAttackBonus || 0) + 1;
      events.push({
        type: 'EVENT',
        message: `${p.nickname || `玩家${p.seat + 1}`} 躲开攻击，下次攻击+1伤害`,
        actorSeat: p.seat,
        eventId: 'BOSS_SUPPRESSION',
      });
    }
  }
  events.push({
    type: 'EVENT',
    message: `BOSS压制：攻击${bossSide === 'LEFT' ? '左侧' : '右侧'}`,
    actorSeat: eventState.triggerSeat,
    eventId: 'BOSS_SUPPRESSION',
  });
}

function applyAbandonedChestOnGame(game, player, events, rng = Math.random) {
  ensurePlayerFields(player);
  const roll = rng();
  if (roll < 0.05) {
    player.vampireStone = true;
    events.push({ type: 'EVENT', message: '废弃宝箱：获得吸血石', actorSeat: player.seat, eventId: 'ABANDONED_CHEST' });
    return;
  }
  if (roll < 0.15) {
    player.items.medkit += 5;
    events.push({ type: 'EVENT', message: '废弃宝箱：医疗包×5', actorSeat: player.seat, eventId: 'ABANDONED_CHEST' });
    return;
  }
  if (roll < 0.3) {
    const others = alivePlayers(game).filter((p) => p.seat !== player.seat);
    if (others.length) {
      const victim = others[Math.floor(rng() * others.length)];
      victim.hp = (victim.hp ?? INITIAL_HP) - 2;
      events.push({
        type: 'EVENT',
        message: `废弃宝箱天罚：${victim.nickname || `玩家${victim.seat + 1}`} -2 HP`,
        actorSeat: player.seat,
        targetSeat: victim.seat,
        eventId: 'ABANDONED_CHEST',
      });
      eliminateIfDead(victim, events);
    }
    return;
  }
  if (roll < 0.5) {
    player.gold = (player.gold || 0) + 1000;
    events.push({ type: 'EVENT', message: '废弃宝箱：+1000 金币', actorSeat: player.seat, eventId: 'ABANDONED_CHEST' });
    return;
  }
  if (roll < 0.75) {
    player.hp = (player.hp ?? INITIAL_HP) - 1;
    events.push({ type: 'EVENT', message: '废弃宝箱：踩中陷阱 -1 HP', actorSeat: player.seat, eventId: 'ABANDONED_CHEST' });
    eliminateIfDead(player, events);
    return;
  }
  player.gold = (player.gold || 0) + 700;
  events.push({ type: 'EVENT', message: '废弃宝箱：+700 金币', actorSeat: player.seat, eventId: 'ABANDONED_CHEST' });
}

function applySandstorm(game, events, actorSeat) {
  game.sandstormRound = game.actionRoundCount || 0;
  events.push({
    type: 'EVENT',
    message: '沙尘暴：本回合所有玩家骰子步数-1',
    actorSeat,
    eventId: 'SANDSTORM',
  });
}

function applyChosenOne(game, player, events) {
  ensurePlayerFields(player);
  player.chosenOne = true;
  game.bountySeat = player.seat;
  events.push({
    type: 'EVENT',
    message: `${player.nickname || `玩家${player.seat + 1}`} 成为天选之人（悬赏目标），每回合+100金币`,
    actorSeat: player.seat,
    eventId: 'CHOSEN_ONE',
  });
}

function applyInfectionEvent(player, events) {
  applyInfection(player);
  events.push({
    type: 'EVENT',
    message: '感染：每回合-0.5HP，伤害+0.5，攻击范围+2，可传染',
    actorSeat: player.seat,
    eventId: 'INFECTION',
  });
}

function applyTimeWarp(game, player, events, rng = Math.random) {
  const { buildPathIndices, applyPathSegment } = require('./CellResolver');
  const path = buildPathIndices(player.position, 12, BOARD_SIZE);
  const { events: moveEvents, paused, consumedLength } = applyPathSegment(
    game,
    player,
    path,
    rng,
  );
  if (path.length) {
    player.position = path[Math.min(consumedLength, path.length) - 1] ?? player.position;
  }
  events.push({
    type: 'EVENT',
    message: '时空穿梭：前进12格',
    actorSeat: player.seat,
    eventId: 'TIME_WARP',
    paused,
  });
  events.push(...moveEvents);
}

function applyLuckyGambler(player, bet, events, rng = Math.random) {
  ensurePlayerFields(player);
  const gold = player.gold || 0;
  if (gold < 100) {
    player.hp = (player.hp ?? INITIAL_HP) - 1;
    events.push({
      type: 'EVENT',
      message: '幸运赌徒：金币不足，被揍一顿 -1 HP',
      actorSeat: player.seat,
      eventId: 'LUCKY_GAMBLER',
    });
    eliminateIfDead(player, events);
    return;
  }
  const amount = Math.max(100, Math.min(gold, Math.floor(bet || gold)));
  if (rng() < 0.5) {
    player.gold += amount;
    events.push({
      type: 'EVENT',
      message: `幸运赌徒：赢得 ${amount * 2} 金币（投入${amount}）`,
      actorSeat: player.seat,
      eventId: 'LUCKY_GAMBLER',
    });
  } else {
    player.gold -= amount;
    events.push({
      type: 'EVENT',
      message: `幸运赌徒：输掉 ${amount} 金币`,
      actorSeat: player.seat,
      eventId: 'LUCKY_GAMBLER',
    });
  }
}

function finishAuction(game, eventState, events) {
  const winnerSeat = eventState.data.highestBidder;
  const bid = eventState.data.highestBid || 0;
  if (winnerSeat == null || bid <= 0) {
    events.push({
      type: 'EVENT',
      message: '资源拍卖会：无人中标',
      actorSeat: eventState.triggerSeat,
      eventId: 'RESOURCE_AUCTION',
    });
    return;
  }
  const winner = game.players[winnerSeat];
  if (!winner || winner.isDefeated) return;
  winner.gold = (winner.gold || 0) - bid;
  grantMysteriousAmulet(winner);
  events.push({
    type: 'EVENT',
    message: `${winner.nickname || `玩家${winnerSeat + 1}`} 以 ${bid} 金币拍得神秘护符`,
    actorSeat: winnerSeat,
    eventId: 'RESOURCE_AUCTION',
  });
}

function advanceAuctionTurn(game, eventState) {
  const alive = alivePlayers(game);
  const passed = eventState.data.passed || {};
  const active = alive.filter((p) => !passed[p.seat]);
  if (active.length <= 1) {
    eventState.phase = 'RESOLVING';
    return true;
  }
  const cur = eventState.data.currentBidder;
  const idx = active.findIndex((p) => p.seat === cur);
  const next = active[(idx + 1) % active.length];
  eventState.data.currentBidder = next.seat;
  return false;
}

function resolveInstantEvent(game, player, eventState, events, rng = Math.random) {
  const id = eventState.id;
  if (id === 'ABANDONED_CHEST') applyAbandonedChestOnGame(game, player, events, rng);
  else if (id === 'SANDSTORM') applySandstorm(game, events, player.seat);
  else if (id === 'CHOSEN_ONE') applyChosenOne(game, player, events);
  else if (id === 'INFECTION') applyInfectionEvent(player, events);
  else if (id === 'TIME_WARP') applyTimeWarp(game, player, events, rng);
  else if (id === 'BOSS_SUPPRESSION') applyBossSuppression(game, eventState, events);
  else if (id === 'RESOURCE_AUCTION') finishAuction(game, eventState, events);
}

function clearEventState(game) {
  game.pendingInteraction = null;
  game.eventState = null;
}

/**
 * 玩家响应事件格：确认 / 选择 / 出价 / 下注
 */
function resolveEvent(game, openId, payload = {}, rng = Math.random) {
  const player = game.players.find((p) => p.openId === openId && !p.isDefeated);
  if (!player) {
    const err = new Error('PLAYER_NOT_IN_GAME');
    err.code = 'PLAYER_NOT_IN_GAME';
    throw err;
  }
  const pending = game.pendingInteraction;
  const es = game.eventState;
  if (!es) {
    const err = new Error('NO_EVENT_INTERACTION');
    err.code = 'NO_EVENT_INTERACTION';
    throw err;
  }
  if (
    pending &&
    pending.type !== 'EVENT' &&
    pending.type !== 'CHARITY_SHOP' &&
    !(es.id === 'BOSS_SUPPRESSION' && es.phase === 'CHOICE')
  ) {
    const err = new Error('NO_EVENT_INTERACTION');
    err.code = 'NO_EVENT_INTERACTION';
    throw err;
  }

  const events = Array.isArray(game.lastEvents) ? game.lastEvents : [];
  const action = payload.action || 'ack';

  if (
    es.id === 'BOSS_SUPPRESSION' &&
    es.phase === 'CHOICE' &&
    action === 'choice'
  ) {
    const side = payload.value === 'RIGHT' ? 'RIGHT' : 'LEFT';
    es.data.choices[player.seat] = side;
    const alive = alivePlayers(game);
    const allChosen = alive.every((p) => es.data.choices[p.seat]);
    if (allChosen) {
      applyBossSuppression(game, es, events);
      clearEventState(game);
    } else {
      pushEvent(game, {
        type: 'EVENT',
        message: `${player.nickname || `玩家${player.seat + 1}`} 选择${side === 'LEFT' ? '左' : '右'}侧躲闪`,
        actorSeat: player.seat,
        eventId: 'BOSS_SUPPRESSION',
      });
    }
    game.lastEvents = events;
    if (events.length) game.lastEvent = { ...events[events.length - 1] };
    game.updatedAt = Date.now();
    return { ok: true, eventState: es };
  }

  if (!pending) {
    const err = new Error('NO_EVENT_INTERACTION');
    err.code = 'NO_EVENT_INTERACTION';
    throw err;
  }

  if (es.phase === 'INTRO' && action === 'ack') {
    startEventPhase(game, es);
    if (es.phase === 'RESOLVING') {
      resolveInstantEvent(game, player, es, events, rng);
      clearEventState(game);
    } else if (es.id === 'CHARITY_MERCHANT') {
      pushEvent(game, {
        type: 'EVENT',
        message: '慈善商人：请选择购买或离开',
        actorSeat: player.seat,
        eventId: 'CHARITY_MERCHANT',
      });
    }
    game.lastEvents = events;
    if (events.length) game.lastEvent = { ...events[events.length - 1] };
    game.updatedAt = Date.now();
    return { ok: true, eventState: es };
  }

  if (es.id === 'LUCKY_GAMBLER' && es.phase === 'BET' && action === 'bet') {
    applyLuckyGambler(player, Number(payload.value) || player.gold, events, rng);
    clearEventState(game);
    game.lastEvents = events;
    if (events.length) game.lastEvent = { ...events[events.length - 1] };
    game.updatedAt = Date.now();
    return { ok: true };
  }

  if (es.id === 'RESOURCE_AUCTION' && es.phase === 'AUCTION') {
    if (es.data.currentBidder !== player.seat) {
      const err = new Error('NOT_YOUR_AUCTION_TURN');
      err.code = 'NOT_YOUR_AUCTION_TURN';
      throw err;
    }
    if (action === 'pass') {
      es.data.passed[player.seat] = true;
    } else if (action === 'bid') {
      const bid = Math.floor(Number(payload.value) || 0);
      const minBid = Math.max(
        AUCTION_START_BID,
        (es.data.highestBid || 0) + AUCTION_MIN_STEP,
      );
      if (bid > (player.gold || 0)) {
        const err = new Error('INSUFFICIENT_GOLD');
        err.code = 'INSUFFICIENT_GOLD';
        throw err;
      }
      if (bid < minBid) {
        const err = new Error('BID_TOO_LOW');
        err.code = 'BID_TOO_LOW';
        throw err;
      }
      es.data.highestBid = bid;
      es.data.highestBidder = player.seat;
    }
    const done = advanceAuctionTurn(game, es);
    if (done) {
      finishAuction(game, es, events);
      clearEventState(game);
    }
    game.lastEvents = events;
    if (events.length) game.lastEvent = { ...events[events.length - 1] };
    game.updatedAt = Date.now();
    return { ok: true, eventState: es };
  }

  if (action === 'leave' && pending.type === 'CHARITY_SHOP') {
    clearEventState(game);
    pushEvent(game, {
      type: 'EVENT',
      message: '离开慈善商人',
      actorSeat: player.seat,
      eventId: 'CHARITY_MERCHANT',
    });
    game.updatedAt = Date.now();
    return { ok: true };
  }

  const err = new Error('INVALID_EVENT_ACTION');
  err.code = 'INVALID_EVENT_ACTION';
  throw err;
}

function applyChosenOneTurnGold(player, events) {
  if (!player.chosenOne || player.isDefeated) return;
  player.gold = (player.gold || 0) + 100;
  events.push({
    type: 'EVENT',
    message: '天选之人：+100 金币',
    actorSeat: player.seat,
    eventId: 'CHOSEN_ONE',
  });
}

function tickInfection(player, events) {
  if (!player.infected || player.isDefeated) return;
  player.hp = (player.hp ?? INITIAL_HP) - 0.5;
  events.push({
    type: 'STATUS',
    message: '感染：-0.5 HP',
    actorSeat: player.seat,
  });
}

module.exports = {
  EVENT_POOL,
  EVENT_META,
  CHARITY_PRICES,
  setupEventAtCell,
  resolveEvent,
  applyInfection,
  cureInfection,
  grantMysteriousAmulet,
  applyChosenOneTurnGold,
  tickInfection,
  pickEventId,
};
