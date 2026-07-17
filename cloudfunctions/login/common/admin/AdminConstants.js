const cloud = require('wx-server-sdk');

// Add production CloudBase envIds here after you confirm them.
// Until configured, every environment is treated as "test" by default.
const PRODUCTION_ENV_IDS = new Set([]);

const ADMIN_ACTIONS = {
  GET_PLAYER: 'getPlayer',
  LIST_PLAYERS: 'listPlayers',
  LIST_BALANCE_CONFIGS: 'listBalanceConfigs',
  GET_BALANCE_CONFIG: 'getBalanceConfig',
  GET_BALANCE_CONFIG_DETAIL: 'getBalanceConfigDetail',
  SAVE_BALANCE_CONFIG: 'saveBalanceConfig',
  RESET_BALANCE_CONFIG: 'resetBalanceConfig',
  REMOVE_BALANCE_FIELD_OVERRIDE: 'removeBalanceFieldOverride',
  REMOVE_BALANCE_SECTION_OVERRIDE: 'removeBalanceSectionOverride',
  SYNC_BALANCE_DOCS_PREVIEW: 'syncBalanceDocsPreview',
  SYNC_BALANCE_DOCS_LOG: 'syncBalanceDocsLog',
  ADJUST_RESOURCES: 'adjustResources',
  RESET_EXPEDITION: 'resetExpedition',
  RESET_CAMP_INVENTORY: 'resetCampInventory',
  RESET_TUTORIAL: 'resetTutorial',
  RESET_LEADERBOARD_GLOBAL: 'resetLeaderboardGlobal',
  LIST_LOGS: 'listLogs',
};

const ADMIN_ACTION_SET = new Set(Object.values(ADMIN_ACTIONS));

const RESOURCE_TYPES = {
  DIAMOND: 'diamond',
  STAMINA: 'stamina',
};

const RESOURCE_LIMITS = {
  [RESOURCE_TYPES.DIAMOND]: 2000,
  [RESOURCE_TYPES.STAMINA]: 200,
};

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_PBKDF2_ITERATIONS = 120000;
const TOKEN_BYTES = 32;
const LOG_LIMIT = 50;
const RESET_LEADERBOARD_CONFIRM = 'RESET_LEADERBOARD';

function getCurrentEnvId() {
  return cloud.DYNAMIC_CURRENT_ENV || '';
}

function isProductionEnv(envId = getCurrentEnvId()) {
  return PRODUCTION_ENV_IDS.has(envId);
}

function getEnvLabel(envId = getCurrentEnvId()) {
  return isProductionEnv(envId) ? '正式环境' : '测试环境';
}

module.exports = {
  ADMIN_ACTIONS,
  ADMIN_ACTION_SET,
  RESOURCE_TYPES,
  RESOURCE_LIMITS,
  DEFAULT_SESSION_TTL_MS,
  PASSWORD_PBKDF2_ITERATIONS,
  TOKEN_BYTES,
  LOG_LIMIT,
  RESET_LEADERBOARD_CONFIRM,
  PRODUCTION_ENV_IDS,
  getCurrentEnvId,
  isProductionEnv,
  getEnvLabel,
};
