const { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } = require('crypto');
const { generateId } = require('../id');
const { getDb, serverDate, nowMs } = require('../db');
const { COLLECTIONS } = require('../constants');
const {
  DEFAULT_SESSION_TTL_MS,
  PASSWORD_PBKDF2_ITERATIONS,
  TOKEN_BYTES,
  getCurrentEnvId,
  getEnvLabel,
} = require('./AdminConstants');

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function hashPassword(password, salt, iterations = PASSWORD_PBKDF2_ITERATIONS) {
  return pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
}

function safeEqualHex(a, b) {
  const bufferA = Buffer.from(a || '', 'hex');
  const bufferB = Buffer.from(b || '', 'hex');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

async function getAdminAccountByUsername(username) {
  const usernameLower = String(username || '').trim().toLowerCase();
  if (!usernameLower) return null;
  const { data } = await getDb()
    .collection(COLLECTIONS.ADMIN_ACCOUNTS)
    .where({ usernameLower })
    .limit(1)
    .get();
  return data[0] || null;
}

async function verifyAdminPassword(account, password) {
  if (!account || typeof password !== 'string') return false;
  const iterations = Number(account.passwordIterations) || PASSWORD_PBKDF2_ITERATIONS;
  const computed = hashPassword(password, String(account.passwordSalt || ''), iterations);
  return safeEqualHex(computed, String(account.passwordHash || ''));
}

function generateAdminToken() {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

async function createAdminSession(account, requestSource) {
  const token = generateAdminToken();
  const tokenHash = hashToken(token);
  const expireAt = nowMs() + DEFAULT_SESSION_TTL_MS;
  const data = {
    id: generateId(),
    tokenHash,
    accountId: account.id,
    username: account.username,
    usernameLower: account.usernameLower,
    requestSource: requestSource || 'gm-web',
    envId: getCurrentEnvId(),
    createdAt: serverDate(),
    expireAt,
    revoked: false,
    updatedAt: serverDate(),
  };
  await getDb().collection(COLLECTIONS.ADMIN_SESSIONS).add({ data });
  return {
    token,
    expireAt,
    envId: data.envId,
    envLabel: getEnvLabel(data.envId),
  };
}

async function getAdminSessionByToken(token) {
  const tokenHash = hashToken(String(token || ''));
  const { data } = await getDb()
    .collection(COLLECTIONS.ADMIN_SESSIONS)
    .where({ tokenHash, revoked: false })
    .limit(1)
    .get();
  return data[0] || null;
}

async function revokeAdminSessionById(sessionDocId) {
  if (!sessionDocId) return;
  await getDb().collection(COLLECTIONS.ADMIN_SESSIONS).doc(sessionDocId).update({
    data: {
      revoked: true,
      updatedAt: serverDate(),
    },
  });
}

async function requireAdminSession(token) {
  if (!token || typeof token !== 'string') {
    const err = new Error('ADMIN_TOKEN_REQUIRED');
    err.code = 'ADMIN_TOKEN_REQUIRED';
    throw err;
  }

  const session = await getAdminSessionByToken(token);
  if (!session) {
    const err = new Error('ADMIN_SESSION_NOT_FOUND');
    err.code = 'ADMIN_SESSION_NOT_FOUND';
    throw err;
  }

  if (Number(session.expireAt) <= nowMs()) {
    await revokeAdminSessionById(session._id);
    const err = new Error('ADMIN_SESSION_EXPIRED');
    err.code = 'ADMIN_SESSION_EXPIRED';
    throw err;
  }

  const account = await getAdminAccountByUsername(session.usernameLower || session.username);
  if (!account || account.disabled === true) {
    const err = new Error('ADMIN_ACCOUNT_DISABLED');
    err.code = 'ADMIN_ACCOUNT_DISABLED';
    throw err;
  }

  return { session, account };
}

module.exports = {
  hashToken,
  hashPassword,
  getAdminAccountByUsername,
  verifyAdminPassword,
  createAdminSession,
  requireAdminSession,
};
