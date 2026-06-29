/**
 * 命运碎片成长树服务端校验（镜像 assets/scripts/pve/core/DestinyTreeSystem.ts + PveConstants.DESTINY_TREE_NODES）。
 * 纯函数：不读写数据库，供 db.unlockUserTreeNode 在读取用户当前 meta 后做权威重新校验。
 *
 * 5 列 × 9 节点（A 守护 / B 征伐 / C 富集 / D 灵脉 / E 天命），
 * 同列内必须按 order 顺序解锁（解锁 A2 前需先解锁 A1）。
 */

const DESTINY_TREE_NODES = [
  { id: 'A1', column: 'A', order: 1, name: '坚韧之躯', cost: 15 },
  { id: 'A2', column: 'A', order: 2, name: '厚甲本能', cost: 25 },
  { id: 'A3', column: 'A', order: 3, name: '坚韧之躯 II', cost: 40 },
  { id: 'A4', column: 'A', order: 4, name: '止血意志', cost: 60 },
  { id: 'A5', column: 'A', order: 5, name: '险境韧性', cost: 85 },
  { id: 'A6', column: 'A', order: 6, name: '守护回响', cost: 115 },
  { id: 'A7', column: 'A', order: 7, name: '稳固阵脚', cost: 150 },
  { id: 'A8', column: 'A', order: 8, name: '余生火种', cost: 190 },
  { id: 'A9', column: 'A', order: 9, name: '不灭誓约', cost: 240 },
  { id: 'B1', column: 'B', order: 1, name: '武者直觉', cost: 15 },
  { id: 'B2', column: 'B', order: 2, name: '余势不散', cost: 25 },
  { id: 'B3', column: 'B', order: 3, name: '急行军', cost: 40 },
  { id: 'B4', column: 'B', order: 4, name: '职业先驱', cost: 60 },
  { id: 'B5', column: 'B', order: 5, name: '破甲手感', cost: 85 },
  { id: 'B6', column: 'B', order: 6, name: '猎首本能', cost: 115 },
  { id: 'B7', column: 'B', order: 7, name: '战斗熟稔', cost: 150 },
  { id: 'B8', column: 'B', order: 8, name: '临门一击', cost: 190 },
  { id: 'B9', column: 'B', order: 9, name: '破阵时刻', cost: 240 },
  { id: 'C1', column: 'C', order: 1, name: '财富眼光', cost: 15 },
  { id: 'C2', column: 'C', order: 2, name: '宝箱老手', cost: 25 },
  { id: 'C3', column: 'C', order: 3, name: '铁匠熟客', cost: 40 },
  { id: 'C4', column: 'C', order: 4, name: '商路嗅觉', cost: 60 },
  { id: 'C5', column: 'C', order: 5, name: '装备鉴赏', cost: 85 },
  { id: 'C6', column: 'C', order: 6, name: '锻造余温', cost: 115 },
  { id: 'C7', column: 'C', order: 7, name: '淘金路线', cost: 150 },
  { id: 'C8', column: 'C', order: 8, name: '精炼手艺', cost: 190 },
  { id: 'C9', column: 'C', order: 9, name: '命运宝库', cost: 240 },
  { id: 'D1', column: 'D', order: 1, name: '灵感涌现', cost: 15 },
  { id: 'D2', column: 'D', order: 2, name: '悟道加速', cost: 25 },
  { id: 'D3', column: 'D', order: 3, name: '灵脉共鸣', cost: 40 },
  { id: 'D4', column: 'D', order: 4, name: '专注冥想', cost: 60 },
  { id: 'D5', column: 'D', order: 5, name: '灵性筛选', cost: 85 },
  { id: 'D6', column: 'D', order: 6, name: '共振余波', cost: 115 },
  { id: 'D7', column: 'D', order: 7, name: '灵气牵引', cost: 150 },
  { id: 'D8', column: 'D', order: 8, name: '深层悟道', cost: 190 },
  { id: 'D9', column: 'D', order: 9, name: '灵脉贯通', cost: 240 },
  { id: 'E1', column: 'E', order: 1, name: '星盘初启', cost: 15 },
  { id: 'E2', column: 'E', order: 2, name: '命运馈赠', cost: 25 },
  { id: 'E3', column: 'E', order: 3, name: '命运护佑', cost: 40 },
  { id: 'E4', column: 'E', order: 4, name: '星盘校准', cost: 60 },
  { id: 'E5', column: 'E', order: 5, name: '命运偏转', cost: 85 },
  { id: 'E6', column: 'E', order: 6, name: '星辉馈赠', cost: 115 },
  { id: 'E7', column: 'E', order: 7, name: '预兆感知', cost: 150 },
  { id: 'E8', column: 'E', order: 8, name: '命轮余辉', cost: 190 },
  { id: 'E9', column: 'E', order: 9, name: '改命之刻', cost: 240 },
];

const DESTINY_TREE_LIVE_MAX_ORDER_BY_COLUMN = {
  A: 9,
  B: 9,
  C: 9,
  D: 9,
  E: 9,
};

/** 按 id 查找节点定义。 */
function getNodeDef(nodeId) {
  return DESTINY_TREE_NODES.find((n) => n.id === nodeId);
}

function isDestinyTreeNodeLive(def) {
  return def.order <= DESTINY_TREE_LIVE_MAX_ORDER_BY_COLUMN[def.column];
}

/**
 * 是否可解锁指定节点：节点存在、未解锁、碎片足够、且（若非该列首节点）
 * 同列前一节点已解锁（同列需按 order 1→2→3 顺序解锁）。
 */
function canUnlockNode(meta, nodeId) {
  const def = getNodeDef(nodeId);
  if (!def) return false;
  if (!isDestinyTreeNodeLive(def)) return false;

  const unlocked = meta.unlockedTreeNodes ?? [];
  if (unlocked.includes(nodeId)) return false;
  if (meta.destinyShards < def.cost) return false;

  if (def.order > 1) {
    const prevId = `${def.column}${def.order - 1}`;
    if (!unlocked.includes(prevId)) return false;
  }
  return true;
}

module.exports = { DESTINY_TREE_NODES, getNodeDef, isDestinyTreeNodeLive, canUnlockNode };
