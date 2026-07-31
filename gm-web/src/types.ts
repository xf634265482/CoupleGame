export type AdminAction =
  | 'getPlayer'
  | 'listPlayers'
  | 'adjustResources'
  | 'sendMail'
  | 'sendMailBroadcast'
  | 'resetExpedition'
  | 'resetCampInventory'
  | 'resetTutorial'
  | 'resetLeaderboardGlobal'
  | 'listLogs'
  | 'listBalanceConfigs'
  | 'getBalanceConfig'
  | 'getBalanceConfigDetail'
  | 'saveBalanceConfig'
  | 'resetBalanceConfig'
  | 'removeBalanceFieldOverride'
  | 'removeBalanceSectionOverride'
  | 'syncBalanceDocsPreview'
  | 'syncBalanceDocsLog';

export type ResourceType = 'stardust' | 'stamina' | 'makeupCards';
export type MailAttachmentType =
  | 'none'
  | 'stardust'
  | 'stamina'
  | 'quenchSand'
  | 'fusionCore'
  | 'voidHide'
  | 'makeupCards';
export type BalanceScopeType = 'global' | 'chapter' | 'unit';
export type BalanceUnitType = 'player' | 'monster' | 'boss' | 'equipment';

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
  stardust: number;
  highestFloor: number;
  tutorialCompleted: boolean;
  stamina: number;
  makeupCards?: number;
  campInventory?: {
    minghen: number;
    minghenLoadout: number;
    minghenPresets: number;
    equipment: number;
    equipmentLoadout: number;
    activeChallengeId: string;
  };
  activeExpedition: {
    challengeId: string;
  } | null;
}

export interface PlayerListItem {
  nickname: string;
  openId: string;
  userId: string;
  lastActiveAt: number | null;
  stardust: number;
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
  };
}

export interface BalanceConfigValues {
  player?: Record<string, number>;
  monster?: Record<string, number>;
  boss?: Record<string, number>;
  equipment?: Record<string, number>;
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
  balanceDetail?: {
    scopeType: BalanceScopeType;
    scopeId: string;
    overrideConfig: BalanceConfigValues;
    effectiveConfig: BalanceConfigValues;
    codeDefaultConfig: BalanceConfigValues;
    unitScopeChapterMap: Record<string, string>;
  };
  removed?: boolean;
  verification?: Record<string, unknown> & {
    configPersisted?: boolean;
    logWritten?: boolean;
    logId?: string;
    scopeType?: string;
    scopeId?: string;
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
