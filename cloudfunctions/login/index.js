const cloud = require('wx-server-sdk');
const { generateId } = require('./common/id');
const { getUserByOpenId, serverDate } = require('./common/db');
const { COLLECTIONS } = require('./common/constants');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function toUserVO(doc) {
  return {
    id: doc.id,
    openId: doc._openid || doc.openId || '',
    nickname: doc.nickname || '玩家',
    avatarUrl: doc.avatarUrl || '',
    diamond: doc.diamond || 0,
  };
}

async function createUser(openId, nickname, avatarUrl) {
  const db = cloud.database();
  const id = generateId();
  const now = serverDate();
  const data = {
    id,
    _openid: openId,
    nickname: nickname || '玩家',
    avatarUrl: avatarUrl || '',
    diamond: 0,
    createdBy: id,
    createdDate: now,
    updatedBy: id,
    updatedDate: now,
  };
  await db.collection(COLLECTIONS.USERS).add({ data });
  return getUserByOpenId(openId);
}

async function updateProfile(user, nickname, avatarUrl) {
  const patch = {};
  if (nickname) patch.nickname = nickname;
  if (avatarUrl) patch.avatarUrl = avatarUrl;
  if (Object.keys(patch).length === 0) return user;

  patch.updatedDate = serverDate();
  patch.updatedBy = user.id;
  await cloud.database().collection(COLLECTIONS.USERS).doc(user._id).update({ data: patch });
  return getUserByOpenId(user._openid);
}

/** login 云函数 → AC-1, AC-12 */
exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  // 小游戏内 callFunction 自动带 OPENID；控制台测试无用户上下文
  let openId = wxContext.OPENID;
  if (!openId && event.testOpenId && typeof event.testOpenId === 'string') {
    openId = event.testOpenId;
  }

  if (!openId) {
    return {
      ok: false,
      code: 'NO_OPENID',
      message: '无法获取 OPENID。请在小游戏内调用，或控制台测试时传 testOpenId',
    };
  }

  const { action, nickname, avatarUrl } = event;

  if (action === 'profile') {
    const user = await getUserByOpenId(openId);
    if (!user) {
      return { ok: false, code: 'USER_NOT_FOUND', message: '用户不存在，请先登录' };
    }
    return { ok: true, user: toUserVO(user) };
  }

  let user = await getUserByOpenId(openId);
  if (!user) {
    user = await createUser(openId, nickname, avatarUrl);
  } else if (nickname || avatarUrl) {
    user = await updateProfile(user, nickname, avatarUrl);
  }

  return { ok: true, user: toUserVO(user) };
};
