/**
 * PVE 局外元进度读写（AC-20）：命运碎片余额快照、成就、图鉴。
 * 对应 pve 云函数 action：loadMeta / updateMeta。
 *
 * 数据存储于 users 集合同一文档（与钻石/命运碎片并列）：
 *   users.destinyShards    – 由 settleExpedition 累加，命运树解锁时扣减
 *   users.achievements     – 已解锁成就 id 列表
 *   users.pveCodex         – { monsters: string[], equipment: string[] }
 *   users.unlockedTreeNodes – 已解锁的命运树节点 id 列表（→ unlockTreeNode）
 */

const {
  getUserPveMeta,
  updateUserPveMeta,
  unlockUserTreeNode,
  resetUserTreeNodes,
  listPveLeaderboard,
} = require('../db');

/**
 * 读取用户 PVE 元进度快照。
 * 若字段不存在（新用户/首次）返回安全默认值。
 */
async function loadMeta(user) {
  const meta = await getUserPveMeta(user.id);
  return { meta };
}

/**
 * 追加 PVE 元进度条目（幂等，只追加未有的项；钻石支持净增减）：
 * @param {object} report
 * @param {string[]} [report.newAchievements]  - 本次解锁的成就 id 列表
 * @param {string[]} [report.codexMonsters]    - 本次新见到的怪物类型列表
 * @param {string[]} [report.codexEquipment]   - 本次新获得的装备槽位列表
 * @param {string[]} [report.codexRelics]      - 本次新解锁的 Boss 遗物图鉴 id 列表
 * @param {number}   [report.diamond]          - 钻石余额净变化（营地遗物宝箱）；扣减后余额 < 0 时整次更新拒绝
 */
async function updateMeta(user, report = {}) {
  await updateUserPveMeta(user.id, {
    newAchievements: report.newAchievements ?? [],
    codexMonsters:   report.codexMonsters   ?? [],
    codexEquipment:  report.codexEquipment  ?? [],
    codexRelics:     report.codexRelics     ?? [],
    diamond:         report.diamond         ?? 0,
  });
  return { ok: true };
}

/**
 * 解锁命运树节点（权威校验，→ specs/260610-destiny-tree-ui/design.md）。
 * 校验失败抛出带 code='CANNOT_UNLOCK' 的 Error，由调用方转换为 { ok:false, code, message }。
 */
async function unlockTreeNode(user, nodeId) {
  const meta = await unlockUserTreeNode(user.id, nodeId);
  return { meta };
}

/**
 * 重置命运树（消耗 20 钻石，退还全部已解锁节点命运碎片，清空 unlockedTreeNodes）。
 * 校验失败抛 INSUFFICIENT_DIAMOND / TREE_ALREADY_EMPTY。
 */
async function resetTreeNodes(user) {
  const meta = await resetUserTreeNodes(user.id);
  return { meta };
}

async function loadLeaderboard(user, limit) {
  const { entries, myRank } = await listPveLeaderboard(user.id, limit);
  return { entries, myRank };
}

module.exports = {
  loadMeta,
  updateMeta,
  unlockTreeNode,
  resetTreeNodes,
  loadLeaderboard,
};
