const fs = require('fs');
const path = require('path');

const DOC_SYNC_BLOCK_ID = 'PVE_BALANCE';
const START_MARKER = `<!-- GM_SYNC:START:${DOC_SYNC_BLOCK_ID} -->`;
const END_MARKER = `<!-- GM_SYNC:END:${DOC_SYNC_BLOCK_ID} -->`;

const REPO_ROOT = path.resolve(__dirname, '..');
const TARGET_FILES = [
  path.join(REPO_ROOT, 'specs', '260608-pve-destiny-expedition', 'design.md'),
  path.join(REPO_ROOT, 'specs', 'game-design', '数值系统V1.md'),
];

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function mergeConfig(base, patch) {
  const next = clone(base || {}) || {};
  if (!patch || typeof patch !== 'object') {
    return next;
  }

  for (const [sectionKey, sectionValue] of Object.entries(patch)) {
    if (!sectionValue || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) {
      continue;
    }
    if (!next[sectionKey] || typeof next[sectionKey] !== 'object' || Array.isArray(next[sectionKey])) {
      next[sectionKey] = {};
    }
    for (const [fieldKey, fieldValue] of Object.entries(sectionValue)) {
      if (fieldValue === undefined) continue;
      next[sectionKey][fieldKey] = fieldValue;
    }
  }

  return next;
}

function toLabelMap(items) {
  const map = {};
  for (const item of items || []) {
    map[item.id] = item.label || item.id;
  }
  return map;
}

function buildFieldMetaMap() {
  return {
    player: {
      __sectionLabel: '玩家开局数值',
      initialHp: { label: '玩家起始生命' },
      initialGold: { label: '玩家起始金币' },
      initialAnima: { label: '玩家起始灵气' },
      baseAttack: { label: '玩家基础攻击' },
      baseAttackRange: { label: '玩家基础攻击距离' },
      apBase: { label: '每回合基础 AP' },
      moveCost: { label: '移动消耗 AP' },
      attackCost: { label: '攻击消耗 AP' },
      openChestCost: { label: '开宝箱消耗 AP' },
      openExitCost: { label: '开出口消耗 AP' },
      useIdolCost: { label: '神像消耗 AP' },
      useHotSpringCost: { label: '温泉消耗 AP' },
      useAltarCost: { label: '祭坛消耗 AP' },
    },
    monster: {
      __sectionLabel: '怪物基础数值',
      hpMultiplier: { label: '怪物生命倍率' },
      attackMultiplier: { label: '怪物攻击倍率' },
      rangeDelta: { label: '怪物攻击距离修正' },
      aggroRadiusDelta: { label: '怪物警戒范围修正' },
      armorDelta: { label: '怪物护甲修正' },
    },
    boss: {
      __sectionLabel: 'Boss 基础数值',
      hpMultiplier: { label: 'Boss 生命倍率' },
      attackMultiplier: { label: 'Boss 攻击倍率' },
      rangeDelta: { label: 'Boss 攻击距离修正' },
      aggroRadiusDelta: { label: 'Boss 警戒范围修正' },
      armorDelta: { label: 'Boss 护甲修正' },
    },
    equipment: {
      __sectionLabel: '装备基础倍率',
      weaponBaseMultiplier: { label: '武器基础倍率' },
      armorBaseMultiplier: { label: '护甲基础倍率' },
      helmetBaseMultiplier: { label: '头盔基础倍率' },
      shoesBaseMultiplier: { label: '鞋子基础倍率' },
      trinketBaseMultiplier: { label: '饰品基础倍率' },
    },
    relic: {
      __sectionLabel: '遗物运行参数',
      chiefRoarDamageMultiplier: { label: '酋长怒吼伤害倍率' },
      quicksandPitCount: { label: '流沙生成格数' },
      quicksandPitDuration: { label: '流沙持续回合' },
      quicksandAttackBonus: { label: '流沙攻击加成' },
      permafrostChargeSteps: { label: '永冻充能步数' },
      permafrostFreezeRounds: { label: '永冻冻结回合' },
      magmaReflectPercent: { label: '熔火反伤比例' },
      fateEchoRevivePercent: { label: '命运回响复活比例' },
    },
  };
}

function buildEffectiveScopes(payload) {
  const defaultConfig = clone(payload.defaultConfig || {});
  const snapshot = payload.snapshot || {};
  const catalog = payload.catalog || {};
  const unitScopeChapterMap = payload.unitScopeChapterMap || {};

  const globalEffective = mergeConfig(defaultConfig, snapshot.globalConfig || {});
  const chapterEffective = {};
  for (const option of catalog.chapterOptions || []) {
    chapterEffective[option.id] = mergeConfig(globalEffective, snapshot.chapterConfigs?.[option.id] || {});
  }

  const unitEffective = {};
  for (const option of catalog.unitOptions || []) {
    let resolved = mergeConfig({}, globalEffective);
    const chapterId = unitScopeChapterMap[option.id];
    if (chapterId && chapterEffective[chapterId]) {
      resolved = mergeConfig(resolved, chapterEffective[chapterId]);
    }
    unitEffective[option.id] = mergeConfig(resolved, snapshot.unitConfigs?.[option.id] || {});
  }

  return {
    globalEffective,
    chapterEffective,
    unitEffective,
  };
}

function formatValue(value) {
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return Number(value.toFixed(4)).toString();
  }
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function renderTable(rows) {
  if (!rows.length) return '- 暂无数据';
  return [
    '| 名称 | 数值 |',
    '| --- | --- |',
    ...rows.map((row) => `| ${row.label} | ${formatValue(row.value)} |`),
  ].join('\n');
}

function renderSectionTables(config, fieldRules, fieldMetaMap) {
  const parts = [];
  for (const [sectionKey, rules] of Object.entries(fieldRules || {})) {
    const rows = Object.keys(rules).map((fieldKey) => ({
      label: fieldMetaMap?.[sectionKey]?.[fieldKey]?.label || fieldKey,
      value: config?.[sectionKey]?.[fieldKey],
    }));
    parts.push(`#### ${fieldMetaMap?.[sectionKey]?.__sectionLabel || sectionKey}\n${renderTable(rows)}`);
  }
  return parts.join('\n\n');
}

function renderOverrideList(configs, scopeTypeLabelMap, scopeIdLabelMap, fieldMetaMap) {
  if (!configs.length) {
    return '- 当前没有已保存的覆盖配置';
  }

  return configs.map((config) => {
    const title = `${scopeTypeLabelMap[config.scopeType] || config.scopeType} / ${scopeIdLabelMap[config.scopeId] || config.scopeId}`;
    const sections = [];
    for (const [sectionKey, sectionValue] of Object.entries(config.config || {})) {
      if (!sectionValue || typeof sectionValue !== 'object') continue;
      const rows = Object.entries(sectionValue).map(([fieldKey, value]) => `  - ${fieldMetaMap?.[sectionKey]?.[fieldKey]?.label || fieldKey}：${formatValue(value)}`);
      sections.push(`- ${fieldMetaMap?.[sectionKey]?.__sectionLabel || sectionKey}\n${rows.join('\n')}`);
    }
    return [
      `- ${title}`,
      `  - 最近更新：${config.updatedAt || '-'}`,
      `  - 更新人：${config.updatedByName || config.updatedBy || '-'}`,
      sections.join('\n'),
    ].filter(Boolean).join('\n');
  }).join('\n');
}

function renderChapterEffectiveList(chapterOptions, chapterEffective, fieldRules, fieldMetaMap) {
  if (!chapterOptions.length) return '- 暂无章节数据';
  const sectionOrder = ['player', 'monster', 'boss', 'equipment', 'relic'];
  return chapterOptions.map((option) => {
    const config = chapterEffective[option.id] || {};
    const sectionBlocks = sectionOrder.map((sectionKey) => {
      const rows = Object.keys(fieldRules?.[sectionKey] || {}).map((fieldKey) => ({
        label: fieldMetaMap?.[sectionKey]?.[fieldKey]?.label || fieldKey,
        value: config?.[sectionKey]?.[fieldKey],
      }));
      return `##### ${fieldMetaMap?.[sectionKey]?.__sectionLabel || sectionKey}\n${renderTable(rows)}`;
    });
    return `#### ${option.label}\n${sectionBlocks.join('\n\n')}`;
  }).join('\n\n');
}

function renderUnitEffectiveList(unitOptions, unitEffective, snapshot, scopeIdLabelMap, fieldMetaMap) {
  const overriddenUnits = (unitOptions || []).filter((option) => snapshot.unitConfigs?.[option.id]);
  if (!overriddenUnits.length) return '- 当前没有单位覆盖配置';

  return overriddenUnits.map((option) => {
    const effective = unitEffective[option.id] || {};
    const overrideConfig = snapshot.unitConfigs?.[option.id] || {};
    const sectionBlocks = [];
    for (const [sectionKey, sectionValue] of Object.entries(overrideConfig)) {
      if (!sectionValue || typeof sectionValue !== 'object') continue;
      const rows = Object.keys(sectionValue).map((fieldKey) => ({
        label: fieldMetaMap?.[sectionKey]?.[fieldKey]?.label || fieldKey,
        value: effective?.[sectionKey]?.[fieldKey],
      }));
      sectionBlocks.push(`##### ${fieldMetaMap?.[sectionKey]?.__sectionLabel || sectionKey}\n${renderTable(rows)}`);
    }
    return `#### ${scopeIdLabelMap[option.id] || option.label || option.id}\n${sectionBlocks.join('\n\n')}`;
  }).join('\n\n');
}

function buildDesignDocBlock(payload) {
  const catalog = payload.catalog || {};
  const configs = payload.configs || [];
  const snapshot = payload.snapshot || {};
  const fieldMetaMap = buildFieldMetaMap();
  const scopeTypeLabelMap = toLabelMap(catalog.scopeTypes || []);
  const scopeIdLabelMap = {
    default: '全局默认',
    ...toLabelMap(catalog.chapterOptions || []),
    ...toLabelMap(catalog.unitOptions || []),
  };
  const { globalEffective } = buildEffectiveScopes(payload);

  return [
    '> 本区块由 GM 后台“同步仓库文档”自动维护，请勿手动改写。',
    `> 最近同步时间：${new Date(payload.generatedAt || Date.now()).toLocaleString('zh-CN', { hour12: false })}`,
    `> 当前环境：${payload.envLabel || '-'}（${payload.envId || '-'}）`,
    '',
    '### 当前全局生效值',
    renderSectionTables(globalEffective, catalog.fieldRules, fieldMetaMap),
    '',
    '### 当前覆盖配置概览',
    `- 全局覆盖：${snapshot.globalConfig && Object.keys(snapshot.globalConfig).length > 0 ? '已配置' : '未配置'}`,
    `- 章节覆盖数量：${Object.keys(snapshot.chapterConfigs || {}).length}`,
    `- 单位覆盖数量：${Object.keys(snapshot.unitConfigs || {}).length}`,
    `- 已保存配置条数：${configs.length}`,
    '',
    '### 已保存覆盖配置明细',
    renderOverrideList(configs, scopeTypeLabelMap, scopeIdLabelMap, fieldMetaMap),
  ].join('\n');
}

function buildNumberDocBlock(payload) {
  const catalog = payload.catalog || {};
  const snapshot = payload.snapshot || {};
  const fieldMetaMap = buildFieldMetaMap();
  const scopeIdLabelMap = {
    default: '全局默认',
    ...toLabelMap(catalog.chapterOptions || []),
    ...toLabelMap(catalog.unitOptions || []),
  };
  const { globalEffective, chapterEffective, unitEffective } = buildEffectiveScopes(payload);

  return [
    '> 本区块由 GM 后台“同步仓库文档”自动维护，用于记录当前仓库对应的运营数值口径。',
    `> 最近同步时间：${new Date(payload.generatedAt || Date.now()).toLocaleString('zh-CN', { hour12: false })}`,
    '',
    '## 当前全局生效值',
    renderSectionTables(globalEffective, catalog.fieldRules, fieldMetaMap),
    '',
    '## 章节当前生效值',
    renderChapterEffectiveList(catalog.chapterOptions || [], chapterEffective, catalog.fieldRules || {}, fieldMetaMap),
    '',
    '## 单位覆盖当前生效值',
    renderUnitEffectiveList(catalog.unitOptions || [], unitEffective, snapshot, scopeIdLabelMap, fieldMetaMap),
  ].join('\n');
}

function replaceMarkerBlock(content, nextBlock) {
  const startIndex = content.indexOf(START_MARKER);
  const endIndex = content.indexOf(END_MARKER);
  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
    throw new Error(`同步标记缺失：${START_MARKER} / ${END_MARKER}`);
  }

  const before = content.slice(0, startIndex + START_MARKER.length);
  const after = content.slice(endIndex);
  return `${before}\n${nextBlock}\n${after}`;
}

function syncBalanceDocs(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('同步文档失败：缺少数值快照 payload');
  }

  const contentMap = new Map([
    [TARGET_FILES[0], buildDesignDocBlock(payload)],
    [TARGET_FILES[1], buildNumberDocBlock(payload)],
  ]);

  const files = [];
  for (const filePath of TARGET_FILES) {
    const current = fs.readFileSync(filePath, 'utf8');
    const next = replaceMarkerBlock(current, contentMap.get(filePath) || '');
    fs.writeFileSync(filePath, next, 'utf8');
    files.push({
      path: filePath,
      updated: true,
      bytes: Buffer.byteLength(next, 'utf8'),
    });
  }

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    files,
    summary: {
      blockId: DOC_SYNC_BLOCK_ID,
      updatedFileCount: files.length,
      targetFiles: files.map((item) => item.path),
    },
  };
}

if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node scripts/sync-gm-balance-docs.js <payload.json>');
    process.exit(1);
  }

  try {
    const payload = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
    console.log(JSON.stringify(syncBalanceDocs(payload), null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

module.exports = {
  syncBalanceDocs,
  START_MARKER,
  END_MARKER,
  TARGET_FILES,
};
