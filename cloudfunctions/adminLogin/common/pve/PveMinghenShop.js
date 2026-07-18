const { MINGHEN_SOURCES, grantCopy } = require('./PveMinghen');

const STARDUST_SLOT_COUNT = 4;
const EXCHANGE_RECIPE_COUNT = 3;
const AD_REFRESH_LIMIT = 1;
const PRICE = { UNOWNED: 100, SPARE_DUP: 45, OWNED: 70 };
const COPY_REQ = { 1: 1, 2: 2, 3: 4 };

/** All theme-pool IDs are Teaching; ids outside sources (e.g. M39–M56) are General. */
function teachingIdSet() {
  const set = new Set();
  for (const ids of Object.values(MINGHEN_SOURCES)) {
    for (const id of ids) set.add(id);
  }
  return set;
}

const TEACHING_IDS = teachingIdSet();

/** General catalog ids known to cloud (keep in sync with client M39–M56 + future). */
const GENERAL_IDS = [
  'M39', 'M40', 'M41', 'M42', 'M43', 'M44', 'M45', 'M46',
  'M47', 'M48', 'M49', 'M50', 'M51', 'M52', 'M53', 'M54', 'M55', 'M56',
];

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function isTeaching(id) {
  return TEACHING_IDS.has(id);
}

function spareCopies(entry) {
  if (!entry) return 0;
  const copies = Math.max(0, Math.trunc(entry.copies || 0));
  const level = entry.level === 3 ? 3 : entry.level === 2 ? 2 : 1;
  return Math.max(0, copies - (COPY_REQ[level] || 1));
}

function dayKey(now = Date.now()) {
  const shifted = new Date(now + 8 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function unlockedGenerals(highestClearedFloor, highestUnlockedFloor) {
  // 可进远征即可刷通用池（默认 highestUnlockedFloor=1）；教学命痕仍永不作为产出。
  const unlocked = Math.max(
    Math.trunc(highestClearedFloor || 0),
    Math.trunc(highestUnlockedFloor || 0),
  );
  if (unlocked < 1) return [];
  return GENERAL_IDS.filter((id) => !isTeaching(id));
}

function priceFor(id, collection) {
  const owned = collection[id];
  if (!owned) return PRICE.UNOWNED;
  if (spareCopies(owned) > 0) return PRICE.SPARE_DUP;
  return PRICE.OWNED;
}

function pickWeighted(rng, items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.id;
  }
  return items[items.length - 1] ? items[items.length - 1].id : null;
}

function generateShop(day, seedKey, highestClearedFloor, collection, highestUnlockedFloor = 0) {
  const rng = createRng(hashSeed(`${day}:${seedKey}:minghen-shop`));
  const pool = unlockedGenerals(highestClearedFloor, highestUnlockedFloor);
  const stardustSlots = [];
  const used = new Set();
  for (let i = 0; i < STARDUST_SLOT_COUNT; i += 1) {
    const candidates = pool
      .filter((id) => !used.has(id))
      .map((id) => {
        const owned = collection[id];
        let weight = 3;
        if (!owned) weight = 10;
        else if (spareCopies(owned) > 0) weight = 6;
        return { id, weight };
      });
    const picked = pickWeighted(rng, candidates);
    if (!picked) break;
    used.add(picked);
    stardustSlots.push({
      slotId: `s${i}`,
      minghenId: picked,
      price: priceFor(picked, collection),
      purchased: false,
    });
  }

  const allIds = [];
  for (const ids of Object.values(MINGHEN_SOURCES)) allIds.push(...ids);
  allIds.push(...GENERAL_IDS);
  const uniqueAll = [...new Set(allIds)];
  const exchangeRecipes = [];
  for (let i = 0; i < EXCHANGE_RECIPE_COUNT; i += 1) {
    if (pool.length === 0) break;
    const outputId = pool[Math.floor(rng() * pool.length)];
    const inputA = uniqueAll[Math.floor(rng() * uniqueAll.length)];
    let inputB = uniqueAll[Math.floor(rng() * uniqueAll.length)];
    if (inputB === inputA) inputB = uniqueAll[(uniqueAll.indexOf(inputA) + 1) % uniqueAll.length];
    exchangeRecipes.push({
      recipeId: `r${i}`,
      inputIds: [inputA, inputB],
      outputId,
      claimed: false,
    });
  }

  return {
    dayKey: day,
    stardustSlots,
    exchangeRecipes,
    adRefreshUsed: 0,
  };
}

function ensureDailyShop(profile, seedKey, now = Date.now()) {
  const day = dayKey(now);
  const shop = profile.minghenDailyShop;
  const cleared = profile.highestClearedFloor || 0;
  const unlocked = profile.highestUnlockedFloor || 0;
  if (
    shop
    && shop.dayKey === day
    && Array.isArray(shop.stardustSlots)
    && Array.isArray(shop.exchangeRecipes)
  ) {
    const hasOffers = shop.stardustSlots.length > 0 || shop.exchangeRecipes.length > 0;
    if (hasOffers) return profile;
    // 当日曾因进度门生成空店：进度开放后补生成一次
    if (unlockedGenerals(cleared, unlocked).length === 0) return profile;
  }
  const nextShop = generateShop(
    day,
    seedKey,
    cleared,
    profile.minghenCollection || {},
    unlocked,
  );
  return { ...profile, minghenDailyShop: nextShop };
}

function spendOneCopy(collection, id) {
  const entry = collection[id];
  if (!entry || spareCopies(entry) < 1) fail('PVE_MINGHEN_NO_SPARE', `没有可用于兑换的多余${id}`);
  const copies = entry.copies - 1;
  let level = 1;
  if (copies >= 4 && entry.trialCompleted) level = 3;
  else if (copies >= 2) level = 2;
  return {
    ...collection,
    [id]: { ...entry, copies, level },
  };
}

function buyStardustSlot(profile, request, seedKey, now = Date.now()) {
  let next = ensureDailyShop(profile, seedKey, now);
  const shop = next.minghenDailyShop;
  const slot = shop.stardustSlots.find((x) => x.slotId === request.slotId);
  if (!slot) fail('PVE_SHOP_SLOT_NOT_FOUND', '商品不存在');
  if (slot.purchased) fail('PVE_SHOP_ALREADY_BOUGHT', '今日已购买该格');
  if (isTeaching(slot.minghenId)) fail('PVE_SHOP_TEACHING_FORBIDDEN', '教学命痕不可在商会购买');
  if ((next.gold || 0) < slot.price) fail('PVE_STARDUST_NOT_ENOUGH', '星尘不足');
  let collection = grantCopy(next.minghenCollection || {}, slot.minghenId);
  const stardustSlots = shop.stardustSlots.map((x) => (
    x.slotId === slot.slotId ? { ...x, purchased: true } : x
  ));
  return {
    ...next,
    gold: next.gold - slot.price,
    minghenCollection: collection,
    minghenDailyShop: { ...shop, stardustSlots },
  };
}

function claimExchangeRecipe(profile, request, seedKey, now = Date.now()) {
  let next = ensureDailyShop(profile, seedKey, now);
  const shop = next.minghenDailyShop;
  const recipe = shop.exchangeRecipes.find((x) => x.recipeId === request.recipeId);
  if (!recipe) fail('PVE_SHOP_RECIPE_NOT_FOUND', '配方不存在');
  if (recipe.claimed) fail('PVE_SHOP_ALREADY_CLAIMED', '今日已兑换该配方');
  if (isTeaching(recipe.outputId)) fail('PVE_SHOP_TEACHING_FORBIDDEN', '教学命痕不可作为兑换产出');
  let collection = { ...(next.minghenCollection || {}) };
  collection = spendOneCopy(collection, recipe.inputIds[0]);
  collection = spendOneCopy(collection, recipe.inputIds[1]);
  collection = grantCopy(collection, recipe.outputId);
  const exchangeRecipes = shop.exchangeRecipes.map((x) => (
    x.recipeId === recipe.recipeId ? { ...x, claimed: true } : x
  ));
  return {
    ...next,
    minghenCollection: collection,
    minghenDailyShop: { ...shop, exchangeRecipes },
  };
}

function refreshDailyShop(profile, request, seedKey, now = Date.now()) {
  let next = ensureDailyShop(profile, seedKey, now);
  const shop = next.minghenDailyShop;
  if ((shop.adRefreshUsed || 0) >= AD_REFRESH_LIMIT) {
    fail('PVE_SHOP_REFRESH_LIMIT', '今日刷新次数已用完');
  }
  // Ad proof is client/platform concern; cloud only enforces daily cap.
  const regenerated = generateShop(
    shop.dayKey,
    `${seedKey}:refresh:${(shop.adRefreshUsed || 0) + 1}`,
    next.highestClearedFloor || 0,
    next.minghenCollection || {},
    next.highestUnlockedFloor || 0,
  );
  return {
    ...next,
    minghenDailyShop: {
      ...regenerated,
      adRefreshUsed: (shop.adRefreshUsed || 0) + 1,
    },
  };
}

module.exports = {
  TEACHING_IDS,
  GENERAL_IDS,
  STARDUST_SLOT_COUNT,
  EXCHANGE_RECIPE_COUNT,
  AD_REFRESH_LIMIT,
  spareCopies,
  dayKey,
  generateShop,
  ensureDailyShop,
  buyStardustSlot,
  claimExchangeRecipe,
  refreshDailyShop,
  isTeaching,
};
