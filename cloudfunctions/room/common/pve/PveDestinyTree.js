/**
 * 命运碎片成长树服务端校验（镜像 assets/scripts/pve/core/DestinyTreeSystem.ts + PveConstants.DESTINY_TREE_NODES）。
 * 纯函数：不读写数据库，供 db.unlockUserTreeNode 在读取用户当前 meta 后做权威重新校验。
 *
 * 5 列 × 3 节点（A 生存 / B 战斗 / C 财富 / D 强化 / E 天命），
 * 同列内必须按 order 顺序解锁（解锁 A2 前需先解锁 A1）。
 */

const DESTINY_TREE_NODES = [
  { id: 'A1', column: 'A', order: 1, name: '坚韧之躯Ⅰ', cost: 15 },
  { id: 'A2', column: 'A', order: 2, name: '坚韧之躯Ⅱ', cost: 25 },
  { id: 'A3', column: 'A', order: 3, name: '遗产意志', cost: 30 },
  { id: 'B1', column: 'B', order: 1, name: '武者直觉', cost: 20 },
  { id: 'B2', column: 'B', order: 2, name: '急行军', cost: 25 },
  { id: 'B3', column: 'B', order: 3, name: '职业先驱', cost: 30 },
  { id: 'C1', column: 'C', order: 1, name: '财富眼光', cost: 15 },
  { id: 'C2', column: 'C', order: 2, name: '宝箱老手', cost: 20 },
  { id: 'C3', column: 'C', order: 3, name: '铁匠熟客', cost: 25 },
  { id: 'D1', column: 'D', order: 1, name: '灵感涌现', cost: 15 },
  { id: 'D2', column: 'D', order: 2, name: '悟道加速', cost: 25 },
  { id: 'D3', column: 'D', order: 3, name: '灵脉共鸣', cost: 30 },
  { id: 'E1', column: 'E', order: 1, name: '誓石意志', cost: 20 },
  { id: 'E2', column: 'E', order: 2, name: '命运馈赠', cost: 30 },
  { id: 'E3', column: 'E', order: 3, name: '命运护佑', cost: 40 },
];

/** 按 id 查找节点定义。 */
function getNodeDef(nodeId) {
  return DESTINY_TREE_NODES.find((n) => n.id === nodeId);
}

/**
 * 是否可解锁指定节点：节点存在、未解锁、碎片足够、且（若非该列首节点）
 * 同列前一节点已解锁（同列需按 order 1→2→3 顺序解锁）。
 */
function canUnlockNode(meta, nodeId) {
  const def = getNodeDef(nodeId);
  if (!def) return false;

  const unlocked = meta.unlockedTreeNodes ?? [];
  if (unlocked.includes(nodeId)) return false;
  if (meta.destinyShards < def.cost) return false;

  if (def.order > 1) {
    const prevId = `${def.column}${def.order - 1}`;
    if (!unlocked.includes(prevId)) return false;
  }
  return true;
}

module.exports = { DESTINY_TREE_NODES, getNodeDef, canUnlockNode };
