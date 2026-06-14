const {
  BOARD_SIZE,
  WEAPON_STATS,
  ARMOR_REDUCTION,
  MIN_ATTACK_DAMAGE,
  INITIAL_HP,
  NEUTRAL_KILL_GOLD,
  NEUTRAL_VAMPIRE_STONE_CHANCE,
  ROCKET_DROP_CHANCE,
  KILL_REWARD_GOLD_FLAT,
  KILL_REWARD_DIAMOND_FLAT,
} = require('./constants');
const { grantWeapon } = require('./ShopResolver');
const {
  positionRegionIndex,
  canAttackNeutralRegion,
} = require('./boardRegions');

const NEUTRAL_ITEM_POOL = ['trap', 'doubleDice', 'medkit'];

function ringDistance(posA, posB, boardSize = BOARD_SIZE) {
  const diff = Math.abs(posA - posB);
  return Math.min(diff, boardSize - diff);
}

function getWeaponStats(attacker) {
  if (!attacker.weapon) return null;
  const base = WEAPON_STATS[attacker.weapon];
  if (!base) return null;
  let range = base.range;
  let damage = base.damage;
  if (attacker.infected) {
    range += 2;
    damage += 0.5;
  }
  if (attacker.mysteriousAmulet) {
    range += 1;
    damage += 0.5;
  }
  return { range, damage };
}

function getArmorReduction(defender) {
  if (!defender.armor) return 0;
  return ARMOR_REDUCTION[defender.armor] || 0;
}

function computeDamage(attacker, defender) {
  const weapon = getWeaponStats(attacker);
  let baseDamage = 0;
  if (weapon) {
    baseDamage = weapon.damage;
  } else if ((attacker.tempAttackBonus || 0) > 0) {
    baseDamage = 1;
  } else {
    const err = new Error('NO_WEAPON');
    err.code = 'NO_WEAPON';
    throw err;
  }
  const reduction = defender ? getArmorReduction(defender) : 0;
  let defenderReduction = 0;
  if (defender?.mysteriousAmulet) defenderReduction += 1;
  const bonus = (attacker.weaponAttackBonus || 0) + (attacker.permanentDamageBonus || 0);
  const temp = attacker.tempAttackBonus || 0;
  return Math.max(MIN_ATTACK_DAMAGE, baseDamage + bonus + temp - reduction - defenderReduction);
}

function ensureNeutralCreatures(game) {
  if (!Array.isArray(game.neutralCreatures) || game.neutralCreatures.length < 3) {
    game.neutralCreatures = [0, 1, 2].map((regionIndex) => ({
      regionIndex,
      hp: 6,
      maxHp: 6,
      defeated: false,
      damageBySeat: {},
    }));
  }
}

function findNeutralCreature(game, regionIndex) {
  ensureNeutralCreatures(game);
  const creature = game.neutralCreatures.find(
    (c) => c.regionIndex === regionIndex,
  );
  if (!creature) {
    const err = new Error('CREATURE_NOT_FOUND');
    err.code = 'CREATURE_NOT_FOUND';
    throw err;
  }
  return creature;
}

function ensurePlayerItems(player) {
  if (!player.items) {
    player.items = { doubleDice: 0, trap: 0, medkit: 0 };
  }
}

const NEUTRAL_ITEM_LABELS = {
  trap: '陷阱',
  doubleDice: '双骰子',
  medkit: '医疗包',
};

function applyVampireLifesteal(attacker, damage) {
  if (!attacker.vampireStone || damage <= 0) return 0;
  const maxHp = attacker.maxHp || INITIAL_HP;
  const heal = damage / 2;
  attacker.hp = Math.min(maxHp, (attacker.hp || 0) + heal);
  return heal;
}

function formatNeutralKillRewards(rewards) {
  const parts = [`${rewards.goldReward} 金币`];
  if (rewards.vampireStoneGranted) parts.push('吸血石');
  if (rewards.rocketDropped) parts.push('远距离武器');
  else if (rewards.itemGranted) {
    parts.push(NEUTRAL_ITEM_LABELS[rewards.itemGranted] || rewards.itemGranted);
  }
  return parts.join('、');
}

function grantRandomNeutralItem(player, rng) {
  ensurePlayerItems(player);
  const pick =
    NEUTRAL_ITEM_POOL[Math.floor(rng() * NEUTRAL_ITEM_POOL.length)];
  if (pick === 'trap') player.items.trap += 1;
  else if (pick === 'doubleDice') player.items.doubleDice += 1;
  else player.items.medkit += 1;
  return pick;
}

function applyNeutralKillRewards(player, rng) {
  ensurePlayerItems(player);
  player.gold = (player.gold || 0) + NEUTRAL_KILL_GOLD;
  let vampireStoneGranted = false;
  if (rng() < NEUTRAL_VAMPIRE_STONE_CHANCE) {
    player.vampireStone = true;
    vampireStoneGranted = true;
  }
  const itemGranted = grantRandomNeutralItem(player, rng);
  let rocketDropped = false;
  if (rng() < ROCKET_DROP_CHANCE) {
    grantWeapon(player, 'ROCKET');
    rocketDropped = true;
  }
  return {
    itemGranted,
    rocketDropped,
    goldReward: NEUTRAL_KILL_GOLD,
    vampireStoneGranted,
  };
}

function applyPlayerKillRewards(attacker, target) {
  const stolenGold = Math.floor((target.gold || 0) / 2);
  const stolenDiamond = Math.floor((target.diamond || 0) / 2);
  const goldReward = KILL_REWARD_GOLD_FLAT + stolenGold;
  const diamondReward = KILL_REWARD_DIAMOND_FLAT + stolenDiamond;

  attacker.gold = (attacker.gold || 0) + goldReward;
  attacker.diamond = (attacker.diamond || 0) + diamondReward;
  target.gold = Math.max(0, (target.gold || 0) - stolenGold);
  target.diamond = Math.max(0, (target.diamond || 0) - stolenDiamond);

  return {
    goldReward,
    diamondReward,
    stolenGold,
    stolenDiamond,
  };
}

function pushCombatEvent(game, event) {
  if (!Array.isArray(game.lastEvents)) game.lastEvents = [];
  game.lastEvents.push(event);
  game.lastEvent = { ...event };
}

/**
 * 攻击玩家 → AC-2, AC-11, AC-12, AC-18
 */
function attackPlayer(game, attacker, targetSeat) {
  const weapon = getWeaponStats(attacker);
  if (!weapon && !(attacker.tempAttackBonus > 0)) {
    const err = new Error('NO_WEAPON');
    err.code = 'NO_WEAPON';
    throw err;
  }

  const target = game.players.find((p) => p.seat === targetSeat);
  if (!target) {
    const err = new Error('TARGET_NOT_FOUND');
    err.code = 'TARGET_NOT_FOUND';
    throw err;
  }
  if (target.isDefeated) {
    const err = new Error('TARGET_DEFEATED');
    err.code = 'TARGET_DEFEATED';
    throw err;
  }
  if (target.seat === attacker.seat) {
    const err = new Error('INVALID_TARGET');
    err.code = 'INVALID_TARGET';
    throw err;
  }

  const distance = ringDistance(attacker.position, target.position);
  const range = weapon ? weapon.range : 2;
  if (distance > range) {
    const err = new Error('OUT_OF_RANGE');
    err.code = 'OUT_OF_RANGE';
    throw err;
  }

  const damage = computeDamage(attacker, target);
  if (attacker.tempAttackBonus > 0) attacker.tempAttackBonus = 0;
  target.hp -= damage;
  const lifesteal = applyVampireLifesteal(attacker, damage);
  let killed = false;
  let rewards = null;

  if (damage > 0 && attacker.infected && !target.infected) {
    target.infected = true;
    pushCombatEvent(game, {
      type: 'STATUS',
      message: `${target.nickname || `玩家${targetSeat + 1}`} 被传染感染`,
      actorSeat: attacker.seat,
      targetSeat,
    });
  }

  if (target.hp <= 0) {
    target.hp = 0;
    target.isDefeated = true;
    attacker.kills = (attacker.kills || 0) + 1;
    killed = true;
    if (game.bountySeat === target.seat) {
      attacker.gold = (attacker.gold || 0) + (target.gold || 0);
      attacker.diamond = (attacker.diamond || 0) + (target.diamond || 0);
      attacker.permanentDamageBonus = (attacker.permanentDamageBonus || 0) + 1;
      target.gold = 0;
      target.diamond = 0;
      target.chosenOne = false;
      game.bountySeat = null;
      rewards = {
        goldReward: attacker.gold,
        diamondReward: attacker.diamond,
        bounty: true,
      };
    } else {
      rewards = applyPlayerKillRewards(attacker, target);
    }
  }

  const lsHint =
    lifesteal > 0 ? `，吸血回复 ${lifesteal % 1 === 0 ? lifesteal : lifesteal.toFixed(1)} HP` : '';
  const event = {
    type: 'ATTACK_PLAYER',
    message: killed
      ? `攻击了 ${target.nickname || `玩家${targetSeat + 1}`}，造成 ${damage} 伤害并淘汰，获得 ${rewards.goldReward} 金币、${rewards.diamondReward} 钻石${lsHint}`
      : `攻击了 ${target.nickname || `玩家${targetSeat + 1}`}，造成 ${damage} 伤害${lsHint}`,
    actorSeat: attacker.seat,
    targetSeat,
    damage,
    killed,
    targetHp: target.hp,
    lifesteal,
    ...(rewards ? { rewards } : {}),
  };
  pushCombatEvent(game, event);

  return {
    ok: true,
    targetType: 'PLAYER',
    targetSeat,
    damage,
    killed,
    targetHp: target.hp,
    rewards,
    event,
  };
}

/**
 * 攻击中立生物 → AC-17
 */
function attackNeutral(game, attacker, regionIndex, rng = Math.random) {
  const weapon = getWeaponStats(attacker);
  if (!weapon) {
    const err = new Error('NO_WEAPON');
    err.code = 'NO_WEAPON';
    throw err;
  }

  const region = Number(regionIndex);
  if (!Number.isFinite(region) || region < 0 || region > 2) {
    const err = new Error('INVALID_REGION');
    err.code = 'INVALID_REGION';
    throw err;
  }

  if (!canAttackNeutralRegion(attacker, region)) {
    const err = new Error('NOT_IN_REGION');
    err.code = 'NOT_IN_REGION';
    throw err;
  }

  const creature = findNeutralCreature(game, region);
  if (creature.defeated || creature.hp <= 0) {
    const err = new Error('CREATURE_DEFEATED');
    err.code = 'CREATURE_DEFEATED';
    throw err;
  }

  const damage = computeDamage(attacker, null);
  creature.hp -= damage;
  const lifesteal = applyVampireLifesteal(attacker, damage);
  if (!creature.damageBySeat) creature.damageBySeat = {};
  creature.damageBySeat[attacker.seat] =
    (creature.damageBySeat[attacker.seat] || 0) + damage;

  let killed = false;
  let rewards = null;

  if (creature.hp <= 0) {
    creature.hp = 0;
    creature.defeated = true;
    killed = true;
    rewards = applyNeutralKillRewards(attacker, rng);
  }

  const lsHint =
    lifesteal > 0 ? `，吸血回复 ${lifesteal % 1 === 0 ? lifesteal : lifesteal.toFixed(1)} HP` : '';
  const event = {
    type: 'ATTACK_NEUTRAL',
    message: killed
      ? `击败 区域${region + 1}中立生物，造成 ${damage} 伤害并击杀，获得 ${formatNeutralKillRewards(rewards)}${lsHint}`
      : `攻击了 区域${region + 1}中立生物，造成 ${damage} 伤害${lsHint}`,
    actorSeat: attacker.seat,
    regionIndex: region,
    damage,
    killed,
    creatureHp: creature.hp,
    lifesteal,
    ...(rewards
      ? {
          goldReward: rewards.goldReward,
          itemGranted: rewards.itemGranted,
          rocketDropped: rewards.rocketDropped,
          vampireStoneGranted: rewards.vampireStoneGranted,
        }
      : {}),
  };
  pushCombatEvent(game, event);

  return {
    ok: true,
    targetType: 'NEUTRAL_CREATURE',
    regionIndex: region,
    damage,
    killed,
    creatureHp: creature.hp,
    rewards,
    event,
  };
}

module.exports = {
  ringDistance,
  positionRegionIndex,
  computeDamage,
  attackPlayer,
  attackNeutral,
  grantRandomNeutralItem,
};
