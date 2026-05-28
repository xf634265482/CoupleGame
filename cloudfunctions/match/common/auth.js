/** 解析调用者 openId（小游戏自动 / 控制台 testOpenId） */
function resolveOpenId(wxContext, event = {}) {
  return wxContext.OPENID || event.testOpenId || null;
}

async function requireUser(openId, getUserByOpenId) {
  const user = await getUserByOpenId(openId);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    err.message = '用户不存在，请先 login';
    throw err;
  }
  return user;
}

function toPlayerSlot(user, seat) {
  return {
    userId: user.id,
    openId: user._openid,
    nickname: user.nickname || '玩家',
    avatarUrl: user.avatarUrl || '',
    seat,
  };
}

function toRoomVO(roomId, doc) {
  return {
    roomId,
    roomCode: doc.roomCode,
    hostId: doc.hostId,
    maxPlayers: doc.maxPlayers,
    players: doc.players || [],
    status: doc.status,
    gameId: doc.gameId || null,
    createdAt: doc.createdAt,
    expireAt: doc.expireAt,
  };
}

module.exports = {
  resolveOpenId,
  requireUser,
  toPlayerSlot,
  toRoomVO,
};
