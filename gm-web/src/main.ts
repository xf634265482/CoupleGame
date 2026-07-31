import './styles.css';
import { callAdminTool, loginAdmin, syncLocalBalanceDocs } from './api';
import { clearSession, loadSession, saveSession } from './state';
import type {
  AdminLogItem,
  AdminSessionState,
  BalanceCatalog,
  BalanceConfigDoc,
  BalanceConfigValues,
  BalanceScopeType,
  BalanceUnitType,
  LocalDocSyncResult,
  PlayerListItem,
  PlayerView,
  MailAttachmentType,
  ResourceType,
  ToolResponse,
} from './types';

const appTitle = (import.meta.env.VITE_GM_APP_TITLE as string | undefined) || '塔塔远征团 GM 后台';
const localEnvLabel = (import.meta.env.VITE_GM_ENV_LABEL as string | undefined) || '未标注环境';
const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) throw new Error('Missing #app');
const app = appRoot;

type FeedbackType = 'info' | 'error';

const loginForm = { username: '', password: '' };
const searchForm = { keyword: '' };
const resourceForm = { resourceType: 'stardust' as ResourceType, amount: '', reason: '' };
const mailForm = {
  broadcast: false,
  title: '',
  body: '',
  attachmentType: 'none' as MailAttachmentType,
  attachmentAmount: '',
  reason: '',
};
const resetForm = { reason: '', leaderboardConfirm: '' };
const balanceForm = {
  scopeType: 'global' as BalanceScopeType,
  scopeId: 'default',
  reason: '',
  player: {} as Record<string, string>,
  monster: {} as Record<string, string>,
  boss: {} as Record<string, string>,
  equipment: {} as Record<string, string>,
};

let session = loadSession();
let currentPlayer: PlayerView | null = null;
let currentLogs: AdminLogItem[] = [];
let playerList: PlayerListItem[] = [];
let balanceCatalog: BalanceCatalog | null = null;
let balanceConfigs: BalanceConfigDoc[] = [];
let balanceOverrideValues: BalanceConfigValues = {};
let balanceEffectiveValues: BalanceConfigValues = {};
let balanceCodeDefaultValues: BalanceConfigValues = {};
let feedback = '';
let feedbackType: FeedbackType = 'info';
const canSyncDocsLocally = import.meta.env.DEV;

const FALLBACK_BALANCE_CATALOG: BalanceCatalog = {
  scopeTypes: [
    { id: 'global', label: 'global' },
    { id: 'chapter', label: 'chapter' },
    { id: 'unit', label: 'unit' },
  ],
  chapterOptions: [
    { id: 'chapter_1', label: 'chapter_1' },
    { id: 'chapter_2', label: 'chapter_2' },
    { id: 'chapter_3', label: 'chapter_3' },
    { id: 'chapter_4', label: 'chapter_4' },
    { id: 'chapter_5', label: 'chapter_5' },
  ],
  unitOptions: [
    { id: 'player:ADVENTURER', unitType: 'player', label: 'player:ADVENTURER' },
    { id: 'boss:GOBLIN_CHIEF', unitType: 'boss', label: 'boss:GOBLIN_CHIEF' },
    { id: 'boss:QUICKSAND_SCORPION', unitType: 'boss', label: 'boss:QUICKSAND_SCORPION' },
    { id: 'boss:FROST_GIANT', unitType: 'boss', label: 'boss:FROST_GIANT' },
    { id: 'boss:LAVA_LORD', unitType: 'boss', label: 'boss:LAVA_LORD' },
    { id: 'boss:FATE_GUARDIAN', unitType: 'boss', label: 'boss:FATE_GUARDIAN' },
    { id: 'monster:GOBLIN_WARRIOR', unitType: 'monster', label: 'monster:GOBLIN_WARRIOR' },
    { id: 'monster:GOBLIN_ARCHER', unitType: 'monster', label: 'monster:GOBLIN_ARCHER' },
    { id: 'monster:FROST_GOBLIN', unitType: 'monster', label: 'monster:FROST_GOBLIN' },
    { id: 'monster:FIRE_GOBLIN', unitType: 'monster', label: 'monster:FIRE_GOBLIN' },
    { id: 'monster:SPIRIT_RAT', unitType: 'monster', label: 'monster:SPIRIT_RAT' },
    { id: 'monster:DESERT_RAIDER', unitType: 'monster', label: 'monster:DESERT_RAIDER' },
    { id: 'monster:SANDWORM_LARVA', unitType: 'monster', label: 'monster:SANDWORM_LARVA' },
    { id: 'monster:POISON_SCORPION', unitType: 'monster', label: 'monster:POISON_SCORPION' },
    { id: 'monster:SPIRIT_BEETLE', unitType: 'monster', label: 'monster:SPIRIT_BEETLE' },
    { id: 'monster:SNOW_WOLF', unitType: 'monster', label: 'monster:SNOW_WOLF' },
    { id: 'monster:ICE_SLIME', unitType: 'monster', label: 'monster:ICE_SLIME' },
    { id: 'monster:FROST_SPRITE', unitType: 'monster', label: 'monster:FROST_SPRITE' },
    { id: 'monster:SPIRIT_ELF', unitType: 'monster', label: 'monster:SPIRIT_ELF' },
    { id: 'monster:LAVA_GRUNT', unitType: 'monster', label: 'monster:LAVA_GRUNT' },
    { id: 'monster:LAVA_CRAB', unitType: 'monster', label: 'monster:LAVA_CRAB' },
    { id: 'monster:FIRE_ELEMENTAL', unitType: 'monster', label: 'monster:FIRE_ELEMENTAL' },
    { id: 'monster:SPIRIT_EMBER', unitType: 'monster', label: 'monster:SPIRIT_EMBER' },
    { id: 'monster:SHADOW_ASSASSIN', unitType: 'monster', label: 'monster:SHADOW_ASSASSIN' },
    { id: 'monster:FATE_WATCHER', unitType: 'monster', label: 'monster:FATE_WATCHER' },
    { id: 'monster:VOID_WORM', unitType: 'monster', label: 'monster:VOID_WORM' },
    { id: 'monster:SPIRIT_MIRAGE', unitType: 'monster', label: 'monster:SPIRIT_MIRAGE' },
  ],
  fieldRules: {
    player: {
      initialHp: { type: 'integer', min: 1, max: 999999 },
      initialGold: { type: 'integer', min: 0, max: 999999 },
      initialAnima: { type: 'integer', min: 0, max: 999999 },
      baseAttack: { type: 'integer', min: 0, max: 999999 },
      baseAttackRange: { type: 'integer', min: 0, max: 20 },
      apBase: { type: 'integer', min: 0, max: 99 },
      moveCost: { type: 'integer', min: 0, max: 99 },
      attackCost: { type: 'integer', min: 0, max: 99 },
      openChestCost: { type: 'integer', min: 0, max: 99 },
      openExitCost: { type: 'integer', min: 0, max: 99 },
      useIdolCost: { type: 'integer', min: 0, max: 99 },
      useHotSpringCost: { type: 'integer', min: 0, max: 99 },
      useAltarCost: { type: 'integer', min: 0, max: 99 },
    },
    monster: {
      hpMultiplier: { type: 'number', min: 0, max: 100 },
      attackMultiplier: { type: 'number', min: 0, max: 100 },
      rangeDelta: { type: 'integer', min: -20, max: 20 },
      aggroRadiusDelta: { type: 'integer', min: -20, max: 20 },
      armorDelta: { type: 'integer', min: -9999, max: 9999 },
    },
    boss: {
      hpMultiplier: { type: 'number', min: 0, max: 100 },
      attackMultiplier: { type: 'number', min: 0, max: 100 },
      rangeDelta: { type: 'integer', min: -20, max: 20 },
      aggroRadiusDelta: { type: 'integer', min: -20, max: 20 },
      armorDelta: { type: 'integer', min: -9999, max: 9999 },
    },
    equipment: {
      weaponBaseMultiplier: { type: 'number', min: 0, max: 100 },
      armorBaseMultiplier: { type: 'number', min: 0, max: 100 },
      helmetBaseMultiplier: { type: 'number', min: 0, max: 100 },
      shoesBaseMultiplier: { type: 'number', min: 0, max: 100 },
      trinketBaseMultiplier: { type: 'number', min: 0, max: 100 },
    },
  },
};

balanceCatalog = FALLBACK_BALANCE_CATALOG;

const BALANCE_SCOPE_TYPE_LABEL: Record<BalanceScopeType, string> = {
  global: '全局默认',
  chapter: '章节覆盖',
  unit: '单体覆盖',
};

const BALANCE_SCOPE_ID_LABELS: Record<string, string> = {
  default: '全局默认',
  chapter_1: '第 1 章',
  chapter_2: '第 2 章',
  chapter_3: '第 3 章',
  chapter_4: '第 4 章',
  chapter_5: '第 5 章',
  'player:ADVENTURER': '玩家初始模板',
  'boss:GOBLIN_CHIEF': 'Boss：哥布林酋长',
  'boss:QUICKSAND_SCORPION': 'Boss：流沙巨蝎',
  'boss:FROST_GIANT': 'Boss：冰霜巨人',
  'boss:LAVA_LORD': 'Boss：熔岩领主',
  'boss:FATE_GUARDIAN': 'Boss：命运守卫',
  'monster:GOBLIN_WARRIOR': '怪物：哥布林战士',
  'monster:GOBLIN_ARCHER': '怪物：哥布林弓手',
  'monster:FROST_GOBLIN': '怪物：冰霜哥布林',
  'monster:FIRE_GOBLIN': '怪物：赤焰哥布林',
  'monster:SPIRIT_RAT': '怪物：灵鼠',
  'monster:DESERT_RAIDER': '怪物：沙漠劫匪',
  'monster:SANDWORM_LARVA': '怪物：沙虫幼体',
  'monster:POISON_SCORPION': '怪物：毒蝎',
  'monster:SPIRIT_BEETLE': '怪物：灵甲虫',
  'monster:SNOW_WOLF': '怪物：雪狼',
  'monster:ICE_SLIME': '怪物：冰史莱姆',
  'monster:FROST_SPRITE': '怪物：冰霜精灵',
  'monster:SPIRIT_ELF': '怪物：灵精灵',
  'monster:LAVA_GRUNT': '怪物：熔岩士兵',
  'monster:LAVA_CRAB': '怪物：熔岩蟹',
  'monster:FIRE_ELEMENTAL': '怪物：火元素',
  'monster:SPIRIT_EMBER': '怪物：灵焰魔',
  'monster:SHADOW_ASSASSIN': '怪物：暗影刺客',
  'monster:FATE_WATCHER': '怪物：命运守望者',
  'monster:VOID_WORM': '怪物：虚空蠕虫',
  'monster:SPIRIT_MIRAGE': '怪物：灵幻像',
};

const BALANCE_FIELD_META: Record<BalanceUnitType, Record<string, { label: string; help: string }>> = {
  player: {
    initialHp: { label: '玩家起始生命', help: '新开远征时玩家的基础生命值' },
    initialGold: { label: '玩家起始金币', help: '新开远征时自带的局内金币' },
    initialAnima: { label: '玩家起始灵气', help: '新开远征时自带的灵气进度' },
    baseAttack: { label: '玩家基础攻击', help: '不含装备和词条时的基础攻击力' },
    baseAttackRange: { label: '玩家基础攻击距离', help: '玩家默认普攻射程' },
    apBase: { label: '每回合基础 AP', help: '骰子加成前的基础行动点' },
    moveCost: { label: '移动消耗 AP', help: '每走 1 格消耗的基础 AP' },
    attackCost: { label: '攻击消耗 AP', help: '每次普通攻击消耗的基础 AP' },
    openChestCost: { label: '开宝箱消耗 AP', help: '打开宝箱需要的 AP' },
    openExitCost: { label: '开出口消耗 AP', help: '开启出口或传送门需要的 AP' },
    useIdolCost: { label: '神像消耗 AP', help: '使用神像需要的 AP' },
    useHotSpringCost: { label: '温泉消耗 AP', help: '使用温泉需要的 AP' },
    useAltarCost: { label: '祭坛消耗 AP', help: '使用祭坛需要的 AP' },
  },
  monster: {
    hpMultiplier: { label: '怪物生命倍率', help: '普通怪和精英怪的血量倍率' },
    attackMultiplier: { label: '怪物攻击倍率', help: '普通怪和精英怪的攻击倍率' },
    rangeDelta: { label: '怪物攻击距离修正', help: '在原攻击距离上增加或减少' },
    aggroRadiusDelta: { label: '怪物警戒范围修正', help: '在原警戒范围上增加或减少' },
    armorDelta: { label: '怪物护甲修正', help: '在原护甲基础上增加或减少' },
  },
  boss: {
    hpMultiplier: { label: 'Boss 生命倍率', help: 'Boss 的血量倍率' },
    attackMultiplier: { label: 'Boss 攻击倍率', help: 'Boss 的攻击倍率' },
    rangeDelta: { label: 'Boss 攻击距离修正', help: '在原攻击距离上增加或减少' },
    aggroRadiusDelta: { label: 'Boss 警戒范围修正', help: '在原警戒范围上增加或减少' },
    armorDelta: { label: 'Boss 护甲修正', help: '在原护甲基础上增加或减少' },
  },
  equipment: {
    weaponBaseMultiplier: { label: '武器强度倍率', help: '影响新掉落与新发放武器的基础攻击值' },
    armorBaseMultiplier: { label: '护甲强度倍率', help: '影响新掉落与新发放护甲的基础减伤值' },
    helmetBaseMultiplier: { label: '头盔强度倍率', help: '影响新掉落与新发放头盔的基础生命值' },
    shoesBaseMultiplier: { label: '鞋子强度倍率', help: '影响新掉落与新发放鞋子的基础数值' },
    trinketBaseMultiplier: { label: '饰品强度倍率', help: '影响新掉落与新发放饰品的基础数值' },
  },
};

const BALANCE_SECTIONS: BalanceUnitType[] = ['player', 'monster', 'boss', 'equipment'];

const DEFAULT_EFFECTIVE_BALANCE: Required<BalanceConfigValues> = {
  player: {
    initialHp: 280,
    initialGold: 0,
    initialAnima: 0,
    baseAttack: 10,
    baseAttackRange: 1,
    apBase: 8,
    moveCost: 1,
    attackCost: 3,
    openChestCost: 1,
    openExitCost: 1,
    useIdolCost: 1,
    useHotSpringCost: 1,
    useAltarCost: 1,
  },
  monster: {
    hpMultiplier: 1,
    attackMultiplier: 1,
    rangeDelta: 0,
    aggroRadiusDelta: 0,
    armorDelta: 0,
  },
  boss: {
    hpMultiplier: 1,
    attackMultiplier: 1,
    rangeDelta: 0,
    aggroRadiusDelta: 0,
    armorDelta: 0,
  },
  equipment: {
    weaponBaseMultiplier: 1,
    armorBaseMultiplier: 1,
    helmetBaseMultiplier: 1,
    shoesBaseMultiplier: 1,
    trinketBaseMultiplier: 1,
  },
};

const UNIT_SCOPE_CHAPTER_MAP: Record<string, string> = {
  'boss:GOBLIN_CHIEF': 'chapter_1',
  'monster:GOBLIN_WARRIOR': 'chapter_1',
  'monster:GOBLIN_ARCHER': 'chapter_1',
  'monster:FROST_GOBLIN': 'chapter_1',
  'monster:FIRE_GOBLIN': 'chapter_1',
  'monster:SPIRIT_RAT': 'chapter_1',
  'boss:QUICKSAND_SCORPION': 'chapter_2',
  'monster:DESERT_RAIDER': 'chapter_2',
  'monster:SANDWORM_LARVA': 'chapter_2',
  'monster:POISON_SCORPION': 'chapter_2',
  'monster:SPIRIT_BEETLE': 'chapter_2',
  'boss:FROST_GIANT': 'chapter_3',
  'monster:SNOW_WOLF': 'chapter_3',
  'monster:ICE_SLIME': 'chapter_3',
  'monster:FROST_SPRITE': 'chapter_3',
  'monster:SPIRIT_ELF': 'chapter_3',
  'boss:LAVA_LORD': 'chapter_4',
  'monster:LAVA_GRUNT': 'chapter_4',
  'monster:LAVA_CRAB': 'chapter_4',
  'monster:FIRE_ELEMENTAL': 'chapter_4',
  'monster:SPIRIT_EMBER': 'chapter_4',
  'boss:FATE_GUARDIAN': 'chapter_5',
  'monster:SHADOW_ASSASSIN': 'chapter_5',
  'monster:FATE_WATCHER': 'chapter_5',
  'monster:VOID_WORM': 'chapter_5',
  'monster:SPIRIT_MIRAGE': 'chapter_5',
};

balanceEffectiveValues = mergeBalanceConfigValues({}, DEFAULT_EFFECTIVE_BALANCE);
balanceCodeDefaultValues = mergeBalanceConfigValues({}, DEFAULT_EFFECTIVE_BALANCE);

const ADMIN_ACTION_LABELS: Record<string, string> = {
  getPlayer: '查询玩家',
  listPlayers: '读取玩家列表',
  adjustResources: '资源调整',
  sendMail: '发送邮件',
  sendMailBroadcast: '全服发信',
  resetExpedition: '重置远征',
  resetTutorial: '重置新手教程',
  resetLeaderboardGlobal: '全服重置排行榜',
  listLogs: '查看日志',
  listBalanceConfigs: '读取数值配置列表',
  getBalanceConfig: '读取数值配置',
  saveBalanceConfig: '保存数值配置',
  resetBalanceConfig: '删除数值配置',
  syncBalanceDocsPreview: '准备同步仓库文档',
  syncBalanceDocsLog: '记录文档同步日志',
};

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  stardust: '星尘',
  stamina: '体力',
  makeupCards: '补签卡',
};

const CLASS_LABELS: Record<string, string> = {
  ADVENTURER: '冒险者',
  BERSERKER: '狂战士',
  ARCHER: '弓手',
  ROGUE: '隐匿者',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return String(error);
  return JSON.stringify(error);
}

function setFeedback(message: string, type: FeedbackType = 'info'): void {
  feedback = message;
  feedbackType = type;
  render();
}

function scrollToTopSafe(): void {
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    window.scrollTo(0, 0);
  }
}

function formatTime(value: unknown): string {
  if (!value) return '暂无';
  if (typeof value === 'number') return new Date(value).toLocaleString();
  if (typeof value === 'string') {
    const maybeNumber = Number(value);
    return Number.isFinite(maybeNumber) && value.trim() ? new Date(maybeNumber).toLocaleString() : value;
  }
  if (typeof value === 'object' && value !== null && '$date' in value) {
    return new Date(Number((value as { $date?: number }).$date || 0)).toLocaleString();
  }
  return String(value);
}

function getScopeTypeLabel(scopeType: BalanceScopeType): string {
  return BALANCE_SCOPE_TYPE_LABEL[scopeType] || scopeType;
}

function getScopeIdLabel(scopeId: string, fallback = ''): string {
  return BALANCE_SCOPE_ID_LABELS[scopeId] || fallback || scopeId;
}

function getActionLabel(action: string): string {
  return ADMIN_ACTION_LABELS[action] || action;
}

function getClassLabel(classId: string): string {
  return CLASS_LABELS[classId] || classId || '未知职业';
}

function buildEnvPill(state: AdminSessionState | null): string {
  const label = state?.envLabel || localEnvLabel;
  return `<span class="env-pill ${label.includes('正式') ? 'prod' : ''}">${escapeHtml(label)}</span>`;
}

function renderBanner(): string {
  if (!feedback) return '';
  return `<div class="banner ${feedbackType}">${escapeHtml(feedback)}</div>`;
}

function getScopeOptions(scopeType: BalanceScopeType): Array<{ id: string; label: string }> {
  const catalog = balanceCatalog || FALLBACK_BALANCE_CATALOG;
  if (scopeType === 'chapter') {
    return catalog.chapterOptions.map((item) => ({
      id: item.id,
      label: getScopeIdLabel(item.id, item.label),
    }));
  }
  if (scopeType === 'unit') {
    return catalog.unitOptions.map((item) => ({
      id: item.id,
      label: getScopeIdLabel(item.id, item.label),
    }));
  }
  return [{ id: 'default', label: '全局默认' }];
}

function ensureScopeId(): void {
  const options = getScopeOptions(balanceForm.scopeType);
  if (options.some((item) => item.id === balanceForm.scopeId)) return;
  balanceForm.scopeId = options[0]?.id || 'default';
}

function getBalanceSectionTitle(section: BalanceUnitType): string {
  return ({
    player: '玩家开局数值',
    monster: '怪物基础数值',
    boss: 'Boss 基础数值',
    equipment: '装备数值倍率',
  } satisfies Record<BalanceUnitType, string>)[section];
}

function resetBalanceSection(section: BalanceUnitType, values?: Record<string, number> | null): void {
  const catalog = balanceCatalog || FALLBACK_BALANCE_CATALOG;
  const nextSection: Record<string, string> = {};
  for (const field of Object.keys(catalog.fieldRules[section] || {})) nextSection[field] = '';
  for (const [key, value] of Object.entries(values || {})) nextSection[key] = String(value);
  balanceForm[section] = nextSection;
}

function resetBalanceInputs(config?: BalanceConfigValues | null): void {
  for (const section of BALANCE_SECTIONS) {
    resetBalanceSection(section, (config?.[section] || null) as Record<string, number> | null);
  }
}

function mergeBalanceConfigValues(base?: BalanceConfigValues | null, patch?: BalanceConfigValues | null): BalanceConfigValues {
  const result: BalanceConfigValues = {};
  for (const section of BALANCE_SECTIONS) {
    const merged = {
      ...((base?.[section] || {}) as Record<string, number>),
      ...((patch?.[section] || {}) as Record<string, number>),
    };
    if (Object.keys(merged).length > 0) {
      result[section] = merged;
    }
  }
  return result;
}

function removeBalanceFieldFromConfig(config: BalanceConfigValues | null | undefined, section: BalanceUnitType, field: string): BalanceConfigValues {
  const next = mergeBalanceConfigValues({}, config || {});
  const sectionValues = { ...((next[section] || {}) as Record<string, number>) };
  delete sectionValues[field];
  if (Object.keys(sectionValues).length > 0) {
    next[section] = sectionValues;
  } else {
    delete next[section];
  }
  return next;
}

function setBalanceDetail(result: ToolResponse): void {
  balanceCatalog = result.catalog || balanceCatalog || FALLBACK_BALANCE_CATALOG;
  balanceConfigs = result.configs || balanceConfigs;
  balanceOverrideValues = result.balanceDetail?.overrideConfig || result.configDoc?.config || {};
  balanceEffectiveValues = result.balanceDetail?.effectiveConfig || resolveEffectiveBalanceConfig();
  balanceCodeDefaultValues = result.balanceDetail?.codeDefaultConfig || DEFAULT_EFFECTIVE_BALANCE;
  const nextUnitScopeChapterMap = result.balanceDetail?.unitScopeChapterMap || null;
  if (nextUnitScopeChapterMap) {
    for (const [unitId, chapterId] of Object.entries(nextUnitScopeChapterMap)) {
      UNIT_SCOPE_CHAPTER_MAP[unitId] = chapterId;
    }
  }
}

function getBalanceDisplayValue(config: BalanceConfigValues | null | undefined, section: BalanceUnitType, field: string): string {
  const value = config?.[section]?.[field];
  if (value === undefined || value === null) return '未覆盖';
  return String(value);
}

function getBalanceInputPlaceholder(rule: { type: 'integer' | 'number'; min: number; max: number }): string {
  return `${rule.type === 'integer' ? '整数' : '数字'}，范围 ${rule.min} ~ ${rule.max}`;
}

function getCurrentScopeConfigDoc(): BalanceConfigDoc | null {
  ensureScopeId();
  const scopeId = balanceForm.scopeType === 'global' ? 'default' : balanceForm.scopeId;
  return balanceConfigs.find((item) => item.scopeType === balanceForm.scopeType && item.scopeId === scopeId) || null;
}

function resolveEffectiveBalanceConfig(): BalanceConfigValues {
  const docsById = new Map(balanceConfigs.map((item) => [item.id, item]));
  let resolved = mergeBalanceConfigValues({}, DEFAULT_EFFECTIVE_BALANCE);
  resolved = mergeBalanceConfigValues(resolved, docsById.get('global:default')?.config || null);

  if (balanceForm.scopeType === 'chapter') {
    resolved = mergeBalanceConfigValues(resolved, docsById.get(`chapter:${balanceForm.scopeId}`)?.config || null);
    return resolved;
  }

  if (balanceForm.scopeType === 'unit') {
    const chapterScopeId = UNIT_SCOPE_CHAPTER_MAP[balanceForm.scopeId];
    if (chapterScopeId) {
      resolved = mergeBalanceConfigValues(resolved, docsById.get(`chapter:${chapterScopeId}`)?.config || null);
    }
    resolved = mergeBalanceConfigValues(resolved, docsById.get(`unit:${balanceForm.scopeId}`)?.config || null);
  }

  return resolved;
}

function buildSectionBalanceValues(section: BalanceUnitType): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [key, raw] of Object.entries(balanceForm[section])) {
    const text = raw.trim();
    if (!text) continue;
    const numberValue = Number(text);
    if (!Number.isFinite(numberValue)) throw new Error(`字段 ${key} 不是有效数字`);
    values[key] = numberValue;
  }
  return values;
}

function applyEffectiveBalanceToForm(section?: BalanceUnitType): void {
  const effective = resolveEffectiveBalanceConfig();
  if (section) {
    resetBalanceSection(section, (effective[section] || null) as Record<string, number> | null);
    return;
  }
  resetBalanceInputs(effective);
}

function buildBalancePayload(): BalanceConfigValues {
  const result: BalanceConfigValues = {};
  for (const section of BALANCE_SECTIONS) {
    const values = buildSectionBalanceValues(section);
    if (Object.keys(values).length > 0) result[section] = values;
  }
  return result;
}

async function withTool<T>(
  action: string,
  payload: Record<string, unknown>,
  onSuccess: (result: ToolResponse) => Promise<T> | T,
  refreshLogsAfter = true,
): Promise<void> {
  if (!session) {
    setFeedback('登录状态已失效，请重新登录', 'error');
    return;
  }
  if (session.expireAt <= Date.now()) {
    clearSession();
    session = null;
    setFeedback('管理员 token 已过期，请重新登录', 'error');
    return;
  }

  try {
    const result = await callAdminTool(session.token, action as never, payload);
    if (!result || typeof result !== 'object') {
      throw new Error(`云函数 ${action} 返回为空`);
    }
    if (!result.ok) throw new Error(result.message || result.code || '请求失败');
    if (result.player) {
      currentPlayer = result.player;
    }
    if (result.logs) currentLogs = result.logs;
    if (result.players) playerList = result.players;
    if (result.catalog) balanceCatalog = result.catalog;
    if (result.configs) balanceConfigs = result.configs;
    if (result.balanceDetail) setBalanceDetail(result);
    await onSuccess(result);
    if (refreshLogsAfter && action !== 'listLogs') {
      await refreshLogs(false);
    } else {
      render();
    }
  } catch (error) {
    setFeedback(extractErrorMessage(error), 'error');
    scrollToTopSafe();
  }
}

async function refreshLogs(showMessage = true): Promise<void> {
  await withTool('listLogs', { limit: 50 }, async () => {
    if (showMessage) setFeedback('日志已刷新', 'info');
  }, false);
}

async function refreshBalanceConfigs(showMessage = false): Promise<void> {
  await withTool('listBalanceConfigs', {}, async (result) => {
    balanceCatalog = result.catalog || FALLBACK_BALANCE_CATALOG;
    balanceConfigs = result.configs || [];
    ensureScopeId();
    if (showMessage) setFeedback('PVE 数值配置已刷新', 'info');
  }, false);
}

async function syncRepoDocs(): Promise<void> {
  if (!session) {
    setFeedback('登录状态已失效，请重新登录', 'error');
    return;
  }
  if (!canSyncDocsLocally) {
    setFeedback('当前页面不是本地开发模式，不能直接改本机仓库文档。请使用 start-gm.bat 打开的本地 GM 页面。', 'error');
    return;
  }
  if (!window.confirm('确认把当前 GM 数值配置同步回仓库文档吗？\n\n这会直接改动本机仓库里的两份 Markdown 文档。')) {
    return;
  }

  try {
    const previewResult = await callAdminTool(session.token, 'syncBalanceDocsPreview', {});
    if (!previewResult.ok || !previewResult.docSyncPreview) {
      throw new Error(previewResult.message || previewResult.code || '云函数没有返回文档同步预览数据');
    }

    const localResult: LocalDocSyncResult = await syncLocalBalanceDocs(
      previewResult.docSyncPreview as unknown as Record<string, unknown>,
    );

    const logResult = await callAdminTool(session.token, 'syncBalanceDocsLog', {
      reason: '同步仓库数值文档',
      syncedAt: localResult.updatedAt,
      files: localResult.files,
      summary: localResult.summary,
    });
    if (!logResult.ok) {
      throw new Error(logResult.message || logResult.code || '写入文档同步日志失败');
    }

    await refreshLogs(false);
    setFeedback(
      `仓库文档已同步：${localResult.summary.updatedFileCount} 份，时间 ${formatTime(localResult.updatedAt)}。`,
      'info',
    );
    scrollToTopSafe();
  } catch (error) {
    setFeedback(extractErrorMessage(error), 'error');
    scrollToTopSafe();
  }
}

async function loadPlayerList(keyword = ''): Promise<void> {
  await withTool('listPlayers', { keyword, limit: 20 }, async () => {
    setFeedback(keyword ? '已加载匹配玩家列表' : '已加载最近玩家列表', 'info');
  }, false);
}

async function fetchPlayer(keyword: string): Promise<void> {
  await withTool('getPlayer', { keyword }, async () => {
    setFeedback('玩家查询成功', 'info');
  });
}

function assertResetInventoryCleared(result: ToolResponse, action: string): string {
  if (action !== 'resetExpedition' && action !== 'resetCampInventory') {
    return '重置操作成功';
  }
  const verification = result.verification || {};
  const checks = [
    ['命痕库存', Number(verification.minghenCount ?? 0)],
    ['命痕装配', Number(verification.minghenLoadoutCount ?? 0)],
    ['命痕方案', Number(verification.minghenPresetCount ?? 0)],
    ['装备库存', Number(verification.equipmentCount ?? 0)],
    ['装备装配', Number(verification.equipmentLoadoutCount ?? 0)],
  ] as const;
  const remains = checks.filter(([, count]) => Number.isFinite(count) && count !== 0);
  const activeChallengeId = String(verification.activeChallengeId ?? '');
  if (remains.length > 0 || activeChallengeId) {
    const remainText = remains.map(([label, count]) => `${label}=${count}`).join('，');
    const staleDocs = Array.isArray(verification.staleUserDocs) ? verification.staleUserDocs : [];
    const staleText = staleDocs
      .map((doc) => {
        const docId = String(doc?.docId ?? '').slice(0, 8);
        const userId = String(doc?.userId ?? '');
        const openId = String(doc?.openId ?? '').slice(0, 10);
        const mh = Number(doc?.minghenCount ?? 0);
        const eq = Number(doc?.equipmentCount ?? 0);
        const challenge = String(doc?.activeChallengeId ?? '');
        return `${docId || 'unknown'} user=${userId} openid=${openId} 命痕=${mh} 装备=${eq}${challenge ? ` challenge=${challenge}` : ''}`;
      })
      .join('；');
    const matched = Number(verification.matchedUserDocCount ?? 0);
    const overwritten = Array.isArray(verification.overwrittenUserDocIds)
      ? verification.overwrittenUserDocIds.length
      : 0;
    throw new Error(`GM_RESET_VERIFY_FAILED：重置后仍有残留${remainText ? `（${remainText}）` : ''}${activeChallengeId ? `，activeChallengeId=${activeChallengeId}` : ''}；匹配用户文档=${matched}，已覆盖=${overwritten}${staleText ? `；残留文档：${staleText}` : ''}`);
  }
  const removed = Array.isArray(verification.removedChallengeIds)
    ? verification.removedChallengeIds.length
    : 0;
  const rewriteText = verification.forcedRewrite ? '，已执行二次强制覆盖' : '';
  const matched = Number(verification.matchedUserDocCount ?? 0);
  const overwritten = Array.isArray(verification.overwrittenUserDocIds)
    ? verification.overwrittenUserDocIds.length
    : 0;
  return `重置已校验：命痕/装备/装配/方案均为空，已清理挑战 ${removed} 个，匹配用户文档 ${matched} 条，覆盖 ${overwritten} 条${rewriteText}`;
}

function renderPlayerList(): string {
  if (playerList.length === 0) {
    return '<p class="muted">当前没有可展示玩家，点“最近玩家”或输入昵称 / userId / openid 查询。</p>';
  }
  return `
    <div class="player-list">
      ${playerList.map((player) => `
        <div class="player-card">
          <div class="player-card-head">
            <div>
              <h3 class="player-card-title">${escapeHtml(player.nickname)}</h3>
              <p class="player-card-meta">userId: ${escapeHtml(player.userId)}</p>
              <p class="player-card-meta">openid: ${escapeHtml(player.openId)}</p>
              <p class="player-card-meta">最近活跃：${escapeHtml(formatTime(player.lastActiveAt))}</p>
            </div>
            <button class="secondary" data-select-user="${escapeHtml(player.userId)}">查看玩家</button>
          </div>
          <div class="player-card-stats">
            <span>星尘 ${player.stardust}</span>
            <span>最高层 ${player.highestFloor}</span>
            <span>${player.hasActiveExpedition ? `远征 ${player.chapter}-${player.floor}` : '无进行中远征'}</span>
            <span>${escapeHtml(getClassLabel(player.classId))}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPlayerDetail(): string {
  if (!currentPlayer) {
    return '<div class="panel"><h2>玩家资料</h2><p class="muted">先从上方搜索框或玩家列表选中目标玩家。</p></div>';
  }
  return `
    <div class="panel">
      <h2>玩家资料</h2>
      <div class="stats">
        <div class="stat"><span>昵称</span><strong>${escapeHtml(currentPlayer.nickname)}</strong></div>
        <div class="stat"><span>userId</span><strong>${escapeHtml(currentPlayer.userId)}</strong></div>
        <div class="stat"><span>openid</span><strong style="font-size:14px">${escapeHtml(currentPlayer.openId)}</strong></div>
        <div class="stat"><span>星尘</span><strong>${currentPlayer.stardust}</strong></div>
        <div class="stat"><span>排行榜最高层</span><strong>${currentPlayer.highestFloor}</strong></div>
        <div class="stat"><span>新手教程</span><strong>${currentPlayer.tutorialCompleted ? '已完成' : '未完成'}</strong></div>
        <div class="stat"><span>体力</span><strong>${currentPlayer.stamina}</strong></div>
        <div class="stat"><span>补签卡</span><strong>${currentPlayer.makeupCards ?? 0}</strong></div>
      </div>
      <div class="split-two" style="margin-top:16px;">
        <div class="panel panel-subsection">
          <h3>当前远征</h3>
          ${currentPlayer.activeExpedition
            ? `<p>挑战 ID：${escapeHtml(currentPlayer.activeExpedition.challengeId)}</p>`
            : '<p class="muted">当前没有活动楼层挑战。</p>'}
        </div>
        <div class="panel panel-subsection">
          <h3>营地库存</h3>
          <p>命痕 ${currentPlayer.campInventory?.minghen ?? 0} / 装配 ${currentPlayer.campInventory?.minghenLoadout ?? 0} / 方案 ${currentPlayer.campInventory?.minghenPresets ?? 0}</p>
          <p>装备 ${currentPlayer.campInventory?.equipment ?? 0} / 穿戴 ${currentPlayer.campInventory?.equipmentLoadout ?? 0}</p>
          <p class="muted">活跃挑战：${escapeHtml(currentPlayer.campInventory?.activeChallengeId || '无')}</p>
          <p class="muted">最近活跃：${escapeHtml(formatTime(currentPlayer.lastActiveAt))}</p>
        </div>
      </div>
    </div>
  `;
}

function renderBalanceConfigList(): string {
  if (balanceConfigs.length === 0) return '<p class="muted">当前还没有已保存的 PVE 数值覆盖配置。</p>';
  return `
    <div class="config-list">
      ${balanceConfigs.map((config) => `
        <div class="config-item">
          <div>
            <strong>${escapeHtml(getScopeTypeLabel(config.scopeType))} / ${escapeHtml(getScopeIdLabel(config.scopeId))}</strong>
            <div class="muted">更新人：${escapeHtml(config.updatedByName || config.updatedBy || '未知')} | 更新时间：${escapeHtml(formatTime(config.updatedAt))}</div>
          </div>
          <button class="secondary" data-load-config="${escapeHtml(config.id)}">载入</button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderLogin(): void {
  app.innerHTML = `
    <div class="shell">
      <div class="login-panel panel">
        <div class="brand">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <h1>${escapeHtml(appTitle)}</h1>
            ${buildEnvPill(null)}
          </div>
          <p>独立 CloudBase 静态网站后台。所有写操作仅通过云函数执行。</p>
        </div>
        ${renderBanner()}
        <div class="field-row">
          <div>
            <label for="username">管理员账号</label>
            <input id="username" autocomplete="username" value="${escapeHtml(loginForm.username)}" placeholder="请输入账号" />
          </div>
          <div>
            <label for="password">管理员密码</label>
            <input id="password" type="password" autocomplete="current-password" value="${escapeHtml(loginForm.password)}" placeholder="请输入密码" />
          </div>
        </div>
        <div class="button-row">
          <button id="loginBtn">登录</button>
        </div>
        <p class="help">token 会保存在当前标签页的 sessionStorage 中，过期后需要重新登录。</p>
      </div>
    </div>
  `;

  document.querySelector<HTMLInputElement>('#username')?.addEventListener('input', (event) => {
    loginForm.username = (event.target as HTMLInputElement).value;
  });
  document.querySelector<HTMLInputElement>('#password')?.addEventListener('input', (event) => {
    loginForm.password = (event.target as HTMLInputElement).value;
  });
  document.querySelector<HTMLButtonElement>('#loginBtn')?.addEventListener('click', async () => {
    if (!loginForm.username.trim() || !loginForm.password) {
      setFeedback('请输入管理员账号和密码', 'error');
      return;
    }
    setFeedback('正在登录...', 'info');
    try {
      const result = await loginAdmin(loginForm.username.trim(), loginForm.password);
      if (!result.ok || !result.token || !result.expireAt || !result.username || !result.adminName || !result.envLabel) {
        throw new Error(result.message || result.code || '登录失败');
      }
      session = {
        token: result.token,
        expireAt: result.expireAt,
        username: result.username,
        adminName: result.adminName,
        envId: result.envId || '',
        envLabel: result.envLabel,
      };
      saveSession(session);
      feedback = '';
      loginForm.password = '';
      await Promise.all([refreshLogs(false), loadPlayerList(''), loadBalanceConfig()]);
      render();
    } catch (error) {
      setFeedback(extractErrorMessage(error), 'error');
    }
  });
}

function renderDashboard(): void {
  if (!session) return renderLogin();
  ensureScopeId();

  app.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="brand">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <h1>${escapeHtml(appTitle)}</h1>
            ${buildEnvPill(session)}
          </div>
          <p>当前管理员：${escapeHtml(session.adminName)}（${escapeHtml(session.username)}）</p>
        </div>
        <div>
          <div class="session-meta">token 过期时间：${escapeHtml(formatTime(session.expireAt))}</div>
          <div class="button-row" style="justify-content:flex-end;margin-top:10px;">
            <button class="secondary" id="refreshLogsBtn">刷新日志</button>
            <button class="secondary" id="refreshBalanceBtn">刷新数值配置</button>
            <button class="secondary" id="syncDocsBtn">同步仓库文档</button>
            <button class="secondary" id="logoutBtn">退出登录</button>
          </div>
        </div>
      </div>
      ${renderBanner()}
      <div class="panel-grid">
        <div>
          <div class="panel">
            <h2>查询玩家</h2>
            <div class="field-row">
              <div>
                <label for="playerKeyword">昵称关键字 / userId / openid</label>
                <input id="playerKeyword" value="${escapeHtml(searchForm.keyword)}" placeholder="支持昵称、userId、openid 直接查" />
                <p class="inline-help">可以直接输入玩家 id，也可以先点“最近玩家”后从列表里选，不用再去云数据库翻。</p>
              </div>
            </div>
            <div class="button-row">
              <button id="searchBtn">查询玩家</button>
              <button class="secondary" id="loadRecentBtn">最近玩家</button>
            </div>
            ${renderPlayerList()}
          </div>
          <div style="margin-top:16px;">${renderPlayerDetail()}</div>
          <div class="panel" style="margin-top:16px;">
            <h2>PVE 数值配置</h2>
            <p class="muted">这里改的是“新开远征”的基础数值，不会追改玩家当前已经进行中的远征存档。</p>
            <div class="field-row triple-grid">
              <div>
                <label for="balanceScopeType">作用域</label>
                <select id="balanceScopeType">
                  ${((balanceCatalog || FALLBACK_BALANCE_CATALOG).scopeTypes || []).map((item) => `<option value="${item.id}" ${balanceForm.scopeType === item.id ? 'selected' : ''}>${escapeHtml(getScopeTypeLabel(item.id))}</option>`).join('')}
                </select>
              </div>
              <div>
                <label for="balanceScopeId">目标</label>
                <select id="balanceScopeId">
                  ${getScopeOptions(balanceForm.scopeType).map((item) => `<option value="${item.id}" ${balanceForm.scopeId === item.id ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label for="balanceReason">操作原因</label>
                <input id="balanceReason" value="${escapeHtml(balanceForm.reason)}" placeholder="例如：测试服调怪、正式服热修" />
              </div>
            </div>
            <div class="field-row">
              ${renderFieldGroup('player')}
              ${renderFieldGroup('monster')}
              ${renderFieldGroup('boss')}
              ${renderFieldGroup('equipment')}
            </div>
            <div class="button-row">
              <button class="danger" id="resetBalanceConfigBtn">删除当前作用域全部自定义配置</button>
            </div>
            <p class="muted">删除后会恢复为继承上层后的当前生效值。</p>
            <div style="margin-top:16px;">
              <h3>已保存配置</h3>
              ${renderBalanceConfigList()}
            </div>
          </div>
        </div>
        <div>
          <div class="panel">
            <h2>资源调整</h2>
            <div class="field-row">
              <div>
                <label for="resourceType">资源类型</label>
                <select id="resourceType">
                  <option value="stardust" ${resourceForm.resourceType === 'stardust' ? 'selected' : ''}>星尘</option>
                  <option value="stamina" ${resourceForm.resourceType === 'stamina' ? 'selected' : ''}>体力</option>
                  <option value="makeupCards" ${resourceForm.resourceType === 'makeupCards' ? 'selected' : ''}>补签卡</option>
                </select>
              </div>
              <div>
                <label for="amount">增减数值（整数，可负数）</label>
                <input id="amount" value="${escapeHtml(resourceForm.amount)}" placeholder="例如 100 / -20" />
              </div>
              <div>
                <label for="resourceReason">操作原因</label>
                <textarea id="resourceReason" placeholder="必须填写原因，例如：客服补偿、误操作回滚">${escapeHtml(resourceForm.reason)}</textarea>
              </div>
            </div>
            <div class="button-row">
              <button id="adjustBtn" ${currentPlayer ? '' : 'disabled'}>执行资源调整</button>
            </div>
          </div>
          <div class="panel" style="margin-top:16px;">
            <h2>发送邮件</h2>
            <div class="field-row">
              <div>
                <label for="mailBroadcast">发送范围</label>
                <select id="mailBroadcast">
                  <option value="player" ${!mailForm.broadcast ? 'selected' : ''}>当前选中玩家</option>
                  <option value="broadcast" ${mailForm.broadcast ? 'selected' : ''}>全服广播（≤500）</option>
                </select>
              </div>
              <div>
                <label for="mailTitle">标题</label>
                <input id="mailTitle" value="${escapeHtml(mailForm.title)}" placeholder="邮件标题" />
              </div>
              <div>
                <label for="mailAttachmentType">附件</label>
                <select id="mailAttachmentType">
                  <option value="none" ${mailForm.attachmentType === 'none' ? 'selected' : ''}>纯通知</option>
                  <option value="stardust" ${mailForm.attachmentType === 'stardust' ? 'selected' : ''}>星尘</option>
                  <option value="stamina" ${mailForm.attachmentType === 'stamina' ? 'selected' : ''}>体力</option>
                </select>
              </div>
              <div>
                <label for="mailAttachmentAmount">附件数量</label>
                <input id="mailAttachmentAmount" value="${escapeHtml(mailForm.attachmentAmount)}" placeholder="纯通知可留空" ${mailForm.attachmentType === 'none' ? 'disabled' : ''} />
              </div>
              <div style="grid-column: 1 / -1;">
                <label for="mailBody">正文</label>
                <textarea id="mailBody" placeholder="邮件正文">${escapeHtml(mailForm.body)}</textarea>
              </div>
              <div style="grid-column: 1 / -1;">
                <label for="mailReason">操作原因</label>
                <textarea id="mailReason" placeholder="必须填写原因">${escapeHtml(mailForm.reason)}</textarea>
              </div>
            </div>
            <div class="button-row">
              <button id="sendMailBtn" ${mailForm.broadcast || currentPlayer ? '' : 'disabled'}>发送邮件</button>
            </div>
            <p class="muted">星尘附件入账到玩家档案星尘；未领取的附件邮件玩家无法删除。</p>
          </div>
          <div class="panel" style="margin-top:16px;">
            <h2>重置操作</h2>
            <div class="danger-box">
              <div class="field-row">
                <div>
                  <label for="resetReason">操作原因</label>
                  <textarea id="resetReason" placeholder="所有重置操作都必须填写原因">${escapeHtml(resetForm.reason)}</textarea>
                </div>
                <div>
                  <label for="leaderboardConfirm">全服排行榜确认词</label>
                  <input id="leaderboardConfirm" value="${escapeHtml(resetForm.leaderboardConfirm)}" placeholder="输入 RESET_LEADERBOARD" />
                </div>
              </div>
              <div class="button-row">
                <button class="danger" id="resetExpeditionBtn" ${currentPlayer ? '' : 'disabled'}>重置当前远征</button>
                <button class="danger" id="resetCampInventoryBtn" ${currentPlayer ? '' : 'disabled'}>重置命痕与装备</button>
                <button class="danger" id="resetTutorialBtn" ${currentPlayer ? '' : 'disabled'}>重置新手教程</button>
                <button class="danger" id="resetLeaderboardBtn">全服重置排行榜</button>
              </div>
              <p class="help">重置远征的含义：直接删除该玩家当前远征存档，所以下次进入会从第 1 层重新开始。</p>
            </div>
          </div>
        </div>
      </div>
      <div class="panel" style="margin-top:16px;">
        <h2>最近 50 条写操作日志</h2>
        <div class="log-list">
          ${currentLogs.length > 0 ? currentLogs.map((log) => `
            <div class="log-item">
              <div class="log-head">
                <strong>${escapeHtml(getActionLabel(log.action))}</strong>
                <span class="muted">${escapeHtml(formatTime(log.createdAt))}</span>
              </div>
              <div class="muted">管理员：${escapeHtml(log.adminUsername)} | 目标：${escapeHtml(log.targetUserId || log.targetOpenId || '全服')}</div>
              <div class="muted">原因：${escapeHtml(log.reason || '无')}</div>
              <div class="pre">payload: ${escapeHtml(JSON.stringify(log.payload || {}, null, 2))}</div>
              <div class="pre">before: ${escapeHtml(JSON.stringify(log.before || {}, null, 2))}</div>
              <div class="pre">after: ${escapeHtml(JSON.stringify(log.after || {}, null, 2))}</div>
            </div>
          `).join('') : '<p class="muted">暂无日志。</p>'}
        </div>
      </div>
    </div>
  `;

  bindDashboardEvents();
}

async function loadBalanceConfig(section?: BalanceUnitType): Promise<void> {
  ensureScopeId();
  await withTool('getBalanceConfigDetail', {
    scopeType: balanceForm.scopeType,
    scopeId: balanceForm.scopeId,
  }, async () => {
    if (section) {
      resetBalanceSection(section, (balanceEffectiveValues[section] || null) as Record<string, number> | null);
    } else {
      resetBalanceInputs(balanceEffectiveValues);
    }
    setFeedback(
      section
        ? `${getBalanceSectionTitle(section)}已读取当前生效值`
        : `已读取 ${getScopeTypeLabel(balanceForm.scopeType)} / ${getScopeIdLabel(balanceForm.scopeId)} 的当前生效值`,
      'info',
    );
  }, false);
}

function renderFieldGroup(section: BalanceUnitType): string {
  const rules = (balanceCatalog || FALLBACK_BALANCE_CATALOG).fieldRules[section];
  if (!rules) return '';
  const title = getBalanceSectionTitle(section);
  const inputs = Object.entries(rules).map(([field, rule]) => `
    <div class="compact-field">
      <label for="balance-${section}-${field}">${escapeHtml(BALANCE_FIELD_META[section]?.[field]?.label || field)}</label>
      <input
        id="balance-${section}-${field}"
        data-balance-section="${section}"
        data-balance-field="${field}"
        value="${escapeHtml(balanceForm[section][field] || '')}"
        placeholder="${escapeHtml(getBalanceInputPlaceholder(rule))}"
      />
      <div class="muted">当前生效值：${escapeHtml(getBalanceDisplayValue(balanceEffectiveValues, section, field))}</div>
      <div class="muted">代码原值：${escapeHtml(getBalanceDisplayValue(balanceCodeDefaultValues, section, field))}</div>
      <div class="muted">当前层覆盖：${escapeHtml(getBalanceDisplayValue(balanceOverrideValues, section, field))}</div>
      <div class="button-row" style="margin-top:8px;">
        <button
          class="secondary"
          type="button"
          data-restore-balance-field="${section}:${field}"
        >恢复代码值</button>
        <button
          class="secondary"
          type="button"
          data-remove-balance-field="${section}:${field}"
        >删除覆盖</button>
      </div>
      <p class="inline-help">${escapeHtml(BALANCE_FIELD_META[section]?.[field]?.help || '')}</p>
    </div>
  `).join('');
  return `
    <div class="panel panel-subsection">
      <h3>${title}</h3>
      <div class="compact-grid">${inputs}</div>
      <div class="button-row" style="margin-top:14px;">
        <button class="secondary" type="button" data-read-balance-section="${section}">读取当前生效值</button>
        <button type="button" data-save-balance-section="${section}">保存本块配置</button>
        <button class="secondary" type="button" data-restore-balance-section="${section}">本块恢复代码值</button>
        <button class="secondary" type="button" data-remove-balance-section="${section}">本块删除覆盖</button>
      </div>
      <p class="muted">恢复代码值：在当前作用域写入一份和代码默认值一致的覆盖。删除覆盖：移除当前作用域这一块的覆盖，改为继承上层生效值。</p>
    </div>
  `;
}

function bindDashboardEvents(): void {
  document.querySelector<HTMLInputElement>('#playerKeyword')?.addEventListener('input', (event) => {
    searchForm.keyword = (event.target as HTMLInputElement).value;
  });
  document.querySelector<HTMLButtonElement>('#searchBtn')?.addEventListener('click', async () => {
    const keyword = searchForm.keyword.trim();
    if (!keyword) return setFeedback('请输入昵称关键词、userId 或 openid', 'error');
    await loadPlayerList(keyword);
    if (playerList.length === 1) await fetchPlayer(playerList[0].userId);
  });
  document.querySelector<HTMLButtonElement>('#loadRecentBtn')?.addEventListener('click', async () => {
    searchForm.keyword = '';
    await loadPlayerList('');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-select-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      const userId = button.dataset.selectUser || '';
      searchForm.keyword = userId;
      await fetchPlayer(userId);
    });
  });

  document.querySelector<HTMLButtonElement>('#logoutBtn')?.addEventListener('click', () => {
    clearSession();
    session = null;
    currentPlayer = null;
    currentLogs = [];
    setFeedback('已退出登录', 'info');
  });
  document.querySelector<HTMLButtonElement>('#refreshLogsBtn')?.addEventListener('click', async () => refreshLogs(true));
  document.querySelector<HTMLButtonElement>('#refreshBalanceBtn')?.addEventListener('click', async () => {
    await loadBalanceConfig();
  });
  document.querySelector<HTMLButtonElement>('#syncDocsBtn')?.addEventListener('click', async () => syncRepoDocs());
  document.querySelector<HTMLSelectElement>('#resourceType')?.addEventListener('change', (event) => {
    resourceForm.resourceType = (event.target as HTMLSelectElement).value as ResourceType;
  });
  document.querySelector<HTMLInputElement>('#amount')?.addEventListener('input', (event) => {
    resourceForm.amount = (event.target as HTMLInputElement).value;
  });
  document.querySelector<HTMLTextAreaElement>('#resourceReason')?.addEventListener('input', (event) => {
    resourceForm.reason = (event.target as HTMLTextAreaElement).value;
  });
  document.querySelector<HTMLButtonElement>('#adjustBtn')?.addEventListener('click', async () => {
    if (!currentPlayer) return setFeedback('请先查询玩家', 'error');
    const amount = Number(resourceForm.amount.trim());
    if (!resourceForm.amount.trim() || !Number.isInteger(amount)) return setFeedback('调整数值必须是整数', 'error');
    if (!resourceForm.reason.trim()) return setFeedback('请填写资源调整原因', 'error');
    const resourceLabel = RESOURCE_TYPE_LABELS[resourceForm.resourceType] || resourceForm.resourceType;
    if (!window.confirm(`确认调整 ${currentPlayer.nickname} 的${resourceLabel}，数值 ${amount}？`)) return;
    await withTool('adjustResources', {
      userId: currentPlayer.userId,
      resourceType: resourceForm.resourceType,
      amount,
      reason: resourceForm.reason.trim(),
    }, async () => {
      setFeedback('资源调整成功', 'info');
    });
  });

  document.querySelector<HTMLSelectElement>('#mailBroadcast')?.addEventListener('change', (event) => {
    mailForm.broadcast = (event.target as HTMLSelectElement).value === 'broadcast';
    render();
  });
  document.querySelector<HTMLInputElement>('#mailTitle')?.addEventListener('input', (event) => {
    mailForm.title = (event.target as HTMLInputElement).value;
  });
  document.querySelector<HTMLTextAreaElement>('#mailBody')?.addEventListener('input', (event) => {
    mailForm.body = (event.target as HTMLTextAreaElement).value;
  });
  document.querySelector<HTMLSelectElement>('#mailAttachmentType')?.addEventListener('change', (event) => {
    mailForm.attachmentType = (event.target as HTMLSelectElement).value as MailAttachmentType;
    if (mailForm.attachmentType === 'none') mailForm.attachmentAmount = '';
    render();
  });
  document.querySelector<HTMLInputElement>('#mailAttachmentAmount')?.addEventListener('input', (event) => {
    mailForm.attachmentAmount = (event.target as HTMLInputElement).value;
  });
  document.querySelector<HTMLTextAreaElement>('#mailReason')?.addEventListener('input', (event) => {
    mailForm.reason = (event.target as HTMLTextAreaElement).value;
  });
  document.querySelector<HTMLButtonElement>('#sendMailBtn')?.addEventListener('click', async () => {
    if (!mailForm.broadcast && !currentPlayer) return setFeedback('请先查询玩家，或选择全服广播', 'error');
    if (!mailForm.title.trim()) return setFeedback('请填写邮件标题', 'error');
    if (!mailForm.body.trim()) return setFeedback('请填写邮件正文', 'error');
    if (!mailForm.reason.trim()) return setFeedback('请填写发信原因', 'error');
    const attachments: Array<{ type: 'stardust' | 'stamina'; amount: number }> = [];
    if (mailForm.attachmentType !== 'none') {
      const amount = Number(mailForm.attachmentAmount.trim());
      if (!mailForm.attachmentAmount.trim() || !Number.isInteger(amount) || amount <= 0) {
        return setFeedback('附件数量必须是正整数', 'error');
      }
      attachments.push({ type: mailForm.attachmentType, amount });
    }
    const targetLabel = mailForm.broadcast
      ? '全服玩家'
      : `${currentPlayer!.nickname}（${currentPlayer!.userId}）`;
    const attachLabel = attachments.length
      ? attachments.map((item) => `${RESOURCE_TYPE_LABELS[item.type]}×${item.amount}`).join('、')
      : '纯通知';
    if (!window.confirm(`确认向 ${targetLabel} 发送邮件？\n附件：${attachLabel}`)) return;
    if (mailForm.broadcast) {
      await withTool('sendMailBroadcast', {
        title: mailForm.title.trim(),
        body: mailForm.body.trim(),
        attachments,
        reason: mailForm.reason.trim(),
      }, async (result) => {
        setFeedback(`全服发信成功，影响 ${result.affectedUsers || 0} 人`, 'info');
      });
    } else {
      await withTool('sendMail', {
        userId: currentPlayer!.userId,
        title: mailForm.title.trim(),
        body: mailForm.body.trim(),
        attachments,
        reason: mailForm.reason.trim(),
      }, async () => {
        setFeedback('邮件已发送', 'info');
      });
    }
  });

  document.querySelector<HTMLTextAreaElement>('#resetReason')?.addEventListener('input', (event) => {
    resetForm.reason = (event.target as HTMLTextAreaElement).value;
  });
  document.querySelector<HTMLInputElement>('#leaderboardConfirm')?.addEventListener('input', (event) => {
    resetForm.leaderboardConfirm = (event.target as HTMLInputElement).value;
  });

  const bindReset = (selector: string, action: string, confirmText: string): void => {
    document.querySelector<HTMLButtonElement>(selector)?.addEventListener('click', async () => {
      if (!currentPlayer) return setFeedback('请先查询玩家', 'error');
      if (!resetForm.reason.trim()) return setFeedback('请填写重置原因', 'error');
      if (!window.confirm(`${confirmText}\n\n玩家：${currentPlayer.nickname}（${currentPlayer.userId}）`)) return;
      const userId = currentPlayer.userId;
      await withTool(action, { userId, reason: resetForm.reason.trim() }, async (result) => {
        const message = assertResetInventoryCleared(result, action);
        await fetchPlayer(userId);
        setFeedback(message, 'info');
      }, false);
    });
  };

  bindReset('#resetExpeditionBtn', 'resetExpedition', '确认重置当前远征？将清除活跃挑战、楼层进度、永久命痕、装备和职业熟练度，恢复为全新 PVE 档案。');
  bindReset('#resetCampInventoryBtn', 'resetCampInventory', '确认清空该玩家的全部命痕、命痕方案和装备，并结束当前活跃挑战？已通关楼层与职业熟练度不会变化。');
  bindReset('#resetTutorialBtn', 'resetTutorial', '确认重置新手教程？');

  document.querySelector<HTMLButtonElement>('#resetLeaderboardBtn')?.addEventListener('click', async () => {
    if (!resetForm.reason.trim()) return setFeedback('请填写重置原因', 'error');
    if (resetForm.leaderboardConfirm.trim() !== 'RESET_LEADERBOARD') return setFeedback('请输入 RESET_LEADERBOARD 作为确认词', 'error');
    if (!window.confirm(`确认全服重置排行榜？当前环境：${session?.envLabel || localEnvLabel}`)) return;
    await withTool('resetLeaderboardGlobal', {
      reason: resetForm.reason.trim(),
      confirmText: resetForm.leaderboardConfirm.trim(),
    }, async (result) => {
      setFeedback(`全服排行榜已重置，影响玩家数：${result.affectedUsers || 0}`, 'info');
    });
  });

  document.querySelector<HTMLSelectElement>('#balanceScopeType')?.addEventListener('change', async (event) => {
    balanceForm.scopeType = (event.target as HTMLSelectElement).value as BalanceScopeType;
    ensureScopeId();
    await loadBalanceConfig();
  });
  document.querySelector<HTMLSelectElement>('#balanceScopeId')?.addEventListener('change', async (event) => {
    balanceForm.scopeId = (event.target as HTMLSelectElement).value;
    await loadBalanceConfig();
  });
  document.querySelector<HTMLInputElement>('#balanceReason')?.addEventListener('input', (event) => {
    balanceForm.reason = (event.target as HTMLInputElement).value;
  });
  document.querySelectorAll<HTMLInputElement>('[data-balance-section][data-balance-field]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const section = target.dataset.balanceSection as BalanceUnitType;
      const field = target.dataset.balanceField as string;
      balanceForm[section][field] = target.value;
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-read-balance-section]').forEach((button) => {
    button.addEventListener('click', async () => {
      const section = button.dataset.readBalanceSection as BalanceUnitType;
      await loadBalanceConfig(section);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-save-balance-section]').forEach((button) => {
    button.addEventListener('click', async () => {
      const section = button.dataset.saveBalanceSection as BalanceUnitType;
      if (!balanceForm.reason.trim()) return setFeedback('请填写数值配置原因', 'error');
      const sectionValues = buildSectionBalanceValues(section);
      if (Object.keys(sectionValues).length === 0) {
        return setFeedback(`请至少填写 ${getBalanceSectionTitle(section)} 的一个字段后再保存`, 'error');
      }
      const currentConfig = getCurrentScopeConfigDoc()?.config || {};
      const nextConfig = mergeBalanceConfigValues(currentConfig, { [section]: sectionValues });
      if (!window.confirm(`确认保存 ${getBalanceSectionTitle(section)}？\n作用域：${getScopeTypeLabel(balanceForm.scopeType)} / ${getScopeIdLabel(balanceForm.scopeId)}`)) {
        return;
      }
      await withTool('saveBalanceConfig', {
        scopeType: balanceForm.scopeType,
        scopeId: balanceForm.scopeId,
        config: nextConfig,
        reason: balanceForm.reason.trim(),
      }, async (result) => {
        if (!result.verification?.logWritten) {
          throw new Error('数值配置保存后未写入操作日志，请检查云函数部署。');
        }
        await loadBalanceConfig(section);
        setFeedback(`${getBalanceSectionTitle(section)}保存成功，日志 ID：${result.verification.logId}`, 'info');
      }, false);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-restore-balance-field]').forEach((button) => {
    button.addEventListener('click', async () => {
      const raw = button.dataset.restoreBalanceField || '';
      const splitIndex = raw.indexOf(':');
      if (splitIndex <= 0) return;
      const section = raw.slice(0, splitIndex) as BalanceUnitType;
      const field = raw.slice(splitIndex + 1);
      if (!balanceForm.reason.trim()) return setFeedback('请填写数值配置原因', 'error');
      const codeValue = balanceCodeDefaultValues?.[section]?.[field];
      if (codeValue === undefined) return setFeedback('未找到代码原值', 'error');
      const currentConfig = getCurrentScopeConfigDoc()?.config || {};
      const nextConfig = mergeBalanceConfigValues(currentConfig, { [section]: { [field]: codeValue } });
      if (!window.confirm(`确认把 ${BALANCE_FIELD_META[section]?.[field]?.label || field} 恢复成代码原值 ${codeValue}？`)) return;
      await withTool('saveBalanceConfig', {
        scopeType: balanceForm.scopeType,
        scopeId: balanceForm.scopeId,
        config: nextConfig,
        reason: balanceForm.reason.trim(),
      }, async (result) => {
        if (!result.verification?.logWritten) {
          throw new Error('恢复代码值后未写入操作日志，请检查云函数部署。');
        }
        await loadBalanceConfig(section);
        setFeedback('已恢复成代码原值', 'info');
      }, false);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-remove-balance-field]').forEach((button) => {
    button.addEventListener('click', async () => {
      const raw = button.dataset.removeBalanceField || '';
      const splitIndex = raw.indexOf(':');
      if (splitIndex <= 0) return;
      const section = raw.slice(0, splitIndex) as BalanceUnitType;
      const field = raw.slice(splitIndex + 1);
      if (!balanceForm.reason.trim()) return setFeedback('请填写数值配置原因', 'error');
      if (!window.confirm(`确认删除 ${BALANCE_FIELD_META[section]?.[field]?.label || field} 的当前层覆盖？删除后将继承上层生效值。`)) return;
      await withTool('removeBalanceFieldOverride', {
        scopeType: balanceForm.scopeType,
        scopeId: balanceForm.scopeId,
        section,
        field,
        reason: balanceForm.reason.trim(),
      }, async (result) => {
        if (!result.verification?.logWritten) {
          throw new Error('删除覆盖后未写入操作日志，请检查云函数部署。');
        }
        await loadBalanceConfig(section);
        setFeedback('字段覆盖已删除', 'info');
      }, false);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-restore-balance-section]').forEach((button) => {
    button.addEventListener('click', async () => {
      const section = button.dataset.restoreBalanceSection as BalanceUnitType;
      if (!balanceForm.reason.trim()) return setFeedback('请填写数值配置原因', 'error');
      const codeSection = (balanceCodeDefaultValues?.[section] || {}) as Record<string, number>;
      if (Object.keys(codeSection).length === 0) return setFeedback('未找到代码原值', 'error');
      const currentConfig = getCurrentScopeConfigDoc()?.config || {};
      const nextConfig = mergeBalanceConfigValues(currentConfig, { [section]: codeSection });
      if (!window.confirm(`确认把 ${getBalanceSectionTitle(section)} 整块恢复成代码原值？`)) return;
      await withTool('saveBalanceConfig', {
        scopeType: balanceForm.scopeType,
        scopeId: balanceForm.scopeId,
        config: nextConfig,
        reason: balanceForm.reason.trim(),
      }, async (result) => {
        if (!result.verification?.logWritten) {
          throw new Error('恢复代码值后未写入操作日志，请检查云函数部署。');
        }
        await loadBalanceConfig(section);
        setFeedback(`${getBalanceSectionTitle(section)}已恢复成代码原值`, 'info');
      }, false);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-remove-balance-section]').forEach((button) => {
    button.addEventListener('click', async () => {
      const section = button.dataset.removeBalanceSection as BalanceUnitType;
      if (!balanceForm.reason.trim()) return setFeedback('请填写数值配置原因', 'error');
      if (!window.confirm(`确认删除 ${getBalanceSectionTitle(section)} 的当前层覆盖？删除后将继承上层生效值。`)) return;
      await withTool('removeBalanceSectionOverride', {
        scopeType: balanceForm.scopeType,
        scopeId: balanceForm.scopeId,
        section,
        reason: balanceForm.reason.trim(),
      }, async (result) => {
        if (!result.verification?.logWritten) {
          throw new Error('删除覆盖后未写入操作日志，请检查云函数部署。');
        }
        await loadBalanceConfig(section);
        setFeedback(`${getBalanceSectionTitle(section)}覆盖已删除`, 'info');
      }, false);
    });
  });

  document.querySelector<HTMLButtonElement>('#resetBalanceConfigBtn')?.addEventListener('click', async () => {
    if (!balanceForm.reason.trim()) return setFeedback('请填写数值配置原因', 'error');
    if (!window.confirm(`确认删除 ${getScopeTypeLabel(balanceForm.scopeType)} / ${getScopeIdLabel(balanceForm.scopeId)} 的全部覆盖？删除后会恢复继承上层默认值。`)) return;
    await withTool('resetBalanceConfig', {
      scopeType: balanceForm.scopeType,
      scopeId: balanceForm.scopeId,
      reason: balanceForm.reason.trim(),
    }, async () => {
      await loadBalanceConfig();
      setFeedback('当前作用域全部覆盖已删除', 'info');
    }, false);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-load-config]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.loadConfig || '';
      const splitIndex = id.indexOf(':');
      if (splitIndex <= 0) return;
      balanceForm.scopeType = id.slice(0, splitIndex) as BalanceScopeType;
      balanceForm.scopeId = id.slice(splitIndex + 1);
      await loadBalanceConfig();
    });
  });
}

function render(): void {
  if (!session) {
    renderLogin();
  } else {
    renderDashboard();
  }
}

void (async () => {
  render();
  if (session) {
    await Promise.all([refreshLogs(false), loadPlayerList(''), loadBalanceConfig()]);
    render();
  }
})();
