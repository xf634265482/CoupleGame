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
  const players = doc.players || [];
  const host = players.find((p) => p.userId === doc.hostId) || players[0];
  return {
    roomId,
    roomCode: doc.roomCode,
    hostId: doc.hostId,
    maxPlayers: doc.maxPlayers,
    players,
    status: doc.status,
    gameId: doc.gameId || null,
    gameName: doc.gameName || '',
    matchFill: !!doc.matchFill,
    hostNickname: host?.nickname || '房主',
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
