const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/** 首版四个集合见 ddl-sql.md §1；pve_saves 为命运远征存档集合，见 specs/260608-pve-destiny-expedition/ddl-sql.md §1 */
const COLLECTIONS = ['users', 'rooms', 'games', 'match_queue', 'pve_saves'];

const NOT_EXIST = -502005;

/**
 * 验证/初始化云数据库集合（Task 1.3）
 *
 * 说明：当前云环境不会通过 write 自动建集合，需先在控制台手动添加。
 * 路径：云开发 → 数据库 → + 添加集合
 */
exports.main = async () => {
  const results = [];

  for (const name of COLLECTIONS) {
    try {
      const col = db.collection(name);
      // 集合存在时 count/get 可成功
      const { total } = await col.count();
      results.push({
        collection: name,
        status: 'ok',
        message: `集合已存在（当前 ${total} 条记录）`,
      });
    } catch (err) {
      const code = err.errCode || err.errcode;
      const isNotExist =
        code === NOT_EXIST ||
        (err.message && err.message.includes('not exist'));

      if (isNotExist) {
        results.push({
          collection: name,
          status: 'error',
          message: `集合不存在。请在「云开发 → 数据库 → + 添加集合」手动创建：${name}`,
        });
      } else {
        results.push({
          collection: name,
          status: 'error',
          message: err.message || String(err),
        });
      }
    }
  }

  const allOk = results.every((r) => r.status === 'ok');

  return {
    ok: allOk,
    env: cloud.DYNAMIC_CURRENT_ENV,
    results,
    nextSteps: allOk
      ? [
          '1. 按 cloud/database/indexes.md 创建索引（至少 rooms.roomCode 唯一）',
          '2. 按 cloud/database/SETUP.md §3 粘贴安全规则',
          '3. 回复「Task 1.3 做完了」继续 Task 1.4',
        ]
      : [
          '1. 云开发 → 数据库 → 点击「+」或「添加集合」',
          '2. 分别创建：users、rooms、games、match_queue、pve_saves（空集合，仅云函数读写）',
          '3. 重新部署 initDb 后再次「测试」',
        ],
  };
};
