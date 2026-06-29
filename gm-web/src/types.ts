export type AdminAction =
  | 'getPlayer'
  | 'listPlayers'
  | 'adjustResources'
  | 'resetExpedition'
  | 'resetTutorial'
  | 'resetDestinyTreeOnly'
  | 'resetDestinyTreeAndRefund'
  | 'resetLeaderboardGlobal'
  | 'listLogs'
  | 'listBalanceConfigs'
  | 'getBalanceConfig'
  | 'saveBalanceConfig'
  | 'resetBalanceConfig'
  | 'syncBalanceDocsPreview'
  | 'syncBalanceDocsLog';

export type ResourceType = 'runGold' | 'diamond' | 'destinyShards' | 'stamina';
export type BalanceScopeType = 'global' | 'chapter' | 'unit';
export type BalanceUnitType = 'player' | 'monster' | 'boss' | 'equipment' | 'relic';

export interface LoginResponse {
  ok: boolean;
  token?: string;
  expireAt?: number;
  adminName?: string;
  username?: string;
  envId?: string;
  envLabel?: string;
  code?: string;
  message?: string;
}

export interface PlayerView {
  nickname: string;
  avatarUrl: string;
  openId: string;
  userId: string;
  lastActiveAt: number | null;
  diamond: number;
  destinyShards: number;
  highestFloor: number;
  tutorialCompleted: boolean;
  stamina: number;
  hasPendingRun: boolean;
  destinyTreeProgress: {
    unlockedCount: number;
    unlockedNodes: string[];
    totalNodes: number;
  };
  codexCounts: {
    monsters: number;
    equipment: number;
    relics: number;
  };
  activeExpedition: {
    chapter: number;
    floor: number;
    classId: string;
    runGold: number;
    bagCount: number;
    scrolls: number;
    relicCount: number;
    saveUpdatedAt: number | null;
  } | null;
}

export interface PlayerListItem {
  nickname: string;
  openId: string;
  userId: string;
  lastActiveAt: number | null;
  diamond: number;
  destinyShards: number;
  highestFloor: number;
  hasActiveExpedition: boolean;
  chapter: number;
  floor: number;
  classId: string;
}

export interface AdminLogItem {
  adminAccountId: string;
  adminUsername: string;
  targetOpenId: string;
  targetUserId: string;
  action: string;
  payload: Record<string, unknown>;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
  requestSource: string;
  env: {
    envId: string;
    envLabel: string;
  };
  success: boolean;
  createdAt: number | string | { $date?: number } | null;
}

export interface BalanceFieldRules {
  [field: string]: {
    type: 'integer' | 'number';
    min: number;
    max: number;
    label?: string;
    help?: string;
  };
}

export interface BalanceCatalog {
  scopeTypes: Array<{ id: BalanceScopeType; label: string }>;
  chapterOptions: Array<{ id: string; label: string }>;
  unitOptions: Array<{ id: string; unitType: BalanceUnitType; label: string }>;
  fieldRules: {
    player: BalanceFieldRules;
    monster: BalanceFieldRules;
    boss: BalanceFieldRules;
    equipment: BalanceFieldRules;
    relic: BalanceFieldRules;
  };
}

export interface BalanceConfigValues {
  player?: Record<string, number>;
  monster?: Record<string, number>;
  boss?: Record<string, number>;
  equipment?: Record<string, number>;
  relic?: Record<string, number>;
}

export interface BalanceConfigDoc {
  id: string;
  scopeType: BalanceScopeType;
  scopeId: string;
  enabled: boolean;
  config: BalanceConfigValues;
  updatedBy: string;
  updatedByName: string;
  updatedAt: number | string | { $date?: number } | null;
  createdAt: number | string | { $date?: number } | null;
}

export interface ToolResponse {
  ok: boolean;
  code?: string;
  message?: string;
  envId?: string;
  envLabel?: string;
  player?: PlayerView;
  players?: PlayerListItem[];
  logs?: AdminLogItem[];
  affectedUsers?: number;
  configs?: BalanceConfigDoc[];
  configDoc?: BalanceConfigDoc | null;
  catalog?: BalanceCatalog;
  removed?: boolean;
  verification?: {
    configPersisted: boolean;
    logWritten: boolean;
    logId: string;
    scopeType: string;
    scopeId: string;
  };
  logId?: string;
  docSyncPreview?: {
    generatedAt: number;
    envId: string;
    envLabel: string;
    defaultConfig: BalanceConfigValues;
    snapshot: {
      globalConfig: BalanceConfigValues;
      chapterConfigs: Record<string, BalanceConfigValues>;
      unitConfigs: Record<string, BalanceConfigValues>;
    };
    configs: BalanceConfigDoc[];
    catalog: BalanceCatalog;
    unitScopeChapterMap: Record<string, string>;
  };
}

export interface LocalDocSyncResult {
  ok: boolean;
  message?: string;
  updatedAt: string;
  files: Array<{
    path: string;
    updated: boolean;
    bytes: number;
  }>;
  summary: {
    blockId: string;
    updatedFileCount: number;
    targetFiles: string[];
  };
}

export interface AdminSessionState {
  token: string;
  expireAt: number;
  adminName: string;
  username: string;
  envId: string;
  envLabel: string;
}
