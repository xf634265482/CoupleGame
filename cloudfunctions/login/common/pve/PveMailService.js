const { COLLECTIONS } = require('../constants');
const { generateId } = require('../id');
const {
  getDb,
  getUserById,
  runTransactionWithRetry,
  serverDate,
  nowMs,
} = require('../db');
const { normalizeProfile } = require('./PveProfile');
const {
  normalizeMailInput,
  canDeleteMail,
  applyMailAttachmentsToUserState,
  buildMailView,
  hasUnclaimedAttachments,
} = require('./PveMail');

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  throw err;
}

function dataOf(result) {
  if (!result) return null;
  if (result.data !== undefined) return result.data;
  return result;
}

async function createMailForUser({
  userId,
  title,
  body,
  attachments = [],
  createdBy = '',
  reason = '',
  batchId = '',
  now = nowMs(),
}) {
  const normalized = normalizeMailInput({ title, body, attachments });
  const id = generateId();
  const doc = {
    id,
    userId: String(userId),
    title: normalized.title,
    body: normalized.body,
    attachments: normalized.attachments,
    claimed: normalized.attachments.length === 0,
    read: false,
    deleted: false,
    batchId: batchId ? String(batchId) : '',
    createdAt: now,
    createdBy: String(createdBy || ''),
    reason: String(reason || ''),
    updatedAt: now,
  };
  await getDb().collection(COLLECTIONS.PVE_MAILS).doc(id).set({ data: doc });
  return buildMailView(doc);
}

async function listMailsForUser(userId, { limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 100));
  const { data } = await getDb()
    .collection(COLLECTIONS.PVE_MAILS)
    .where({
      userId: String(userId),
    })
    .limit(200)
    .get();

  const mails = (data || [])
    .filter((doc) => doc.deleted !== true)
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
    .slice(0, safeLimit)
    .map((doc) => buildMailView(doc));
  const unreadCount = mails.filter((mail) => mail.unread).length;
  return { mails, unreadCount };
}

async function getMailDoc(mailId) {
  const { data } = await getDb()
    .collection(COLLECTIONS.PVE_MAILS)
    .where({ id: String(mailId) })
    .limit(1)
    .get();
  return data[0] || null;
}

function buildUserRewardPatch(userDoc, applied, now) {
  const profile = {
    ...normalizeProfile(userDoc.pveProfile, now),
    gold: applied.profile.gold,
    stamina: applied.stamina,
    staminaUpdatedAt: applied.staminaUpdatedAt,
    staminaNextRecoveryAt: applied.staminaNextRecoveryAt,
    updatedAt: now,
  };
  return {
    pveProfile: profile,
    pveStamina: applied.stamina,
    pveStaminaUpdatedAt: applied.staminaUpdatedAt,
    updatedDate: serverDate(),
  };
}

async function claimMailForUser(user, mailId) {
  const userId = String(user.id);
  const id = String(mailId || '').trim();
  if (!id) fail('PVE_MAIL_ID_REQUIRED', '邮件 ID 不能为空');
  if (!user._id) fail('USER_NOT_FOUND', '用户不存在');

  return runTransactionWithRetry(async (transaction) => {
    const mailRef = transaction.collection(COLLECTIONS.PVE_MAILS).doc(id);
    const userRef = transaction.collection(COLLECTIONS.USERS).doc(user._id);
    const [mailResult, userResult] = await Promise.all([mailRef.get(), userRef.get()]);
    const mail = dataOf(mailResult);
    const userDoc = dataOf(userResult);
    if (!mail || mail.userId !== userId || mail.deleted === true) {
      fail('PVE_MAIL_NOT_FOUND', '邮件不存在');
    }
    if (!userDoc) fail('USER_NOT_FOUND', '用户不存在');

    if (!hasUnclaimedAttachments(mail) || mail.claimed === true) {
      if (mail.claimed !== true || mail.read !== true) {
        await mailRef.update({
          data: {
            claimed: true,
            read: true,
            updatedAt: nowMs(),
          },
        });
      }
      return {
        mail: buildMailView({ ...mail, claimed: true, read: true }),
        profile: normalizeProfile(userDoc.pveProfile),
        stamina: Number(
          userDoc.pveStamina
          ?? userDoc.pveProfile?.stamina
          ?? 0,
        ),
      };
    }

    const now = nowMs();
    const profile = normalizeProfile(userDoc.pveProfile, now);
    const applied = applyMailAttachmentsToUserState(
      {
        profile,
        stamina: userDoc.pveStamina ?? profile.stamina,
        staminaUpdatedAt: userDoc.pveStaminaUpdatedAt ?? profile.staminaUpdatedAt,
      },
      mail.attachments,
      now,
    );
    const userPatch = buildUserRewardPatch(userDoc, applied, now);
    await userRef.update({ data: userPatch });
    await mailRef.update({
      data: {
        claimed: true,
        read: true,
        updatedAt: now,
      },
    });
    return {
      mail: buildMailView({ ...mail, claimed: true, read: true }),
      profile: userPatch.pveProfile,
      stamina: applied.stamina,
    };
  });
}

async function claimAllMailsForUser(user) {
  const { mails } = await listMailsForUser(user.id);
  const pending = mails.filter((mail) => mail.attachments.length > 0 && mail.claimed !== true);
  let claimedCount = 0;
  let profile = null;
  let stamina = null;
  for (const mail of pending) {
    const result = await claimMailForUser(user, mail.id);
    claimedCount += 1;
    profile = result.profile;
    stamina = result.stamina;
  }
  if (!profile) {
    const loaded = await getUserById(user.id);
    profile = normalizeProfile(loaded?.pveProfile);
    stamina = Number(loaded?.pveStamina ?? profile.stamina ?? 0);
  }
  return { claimedCount, profile, stamina };
}

async function deleteMailForUser(userId, mailId) {
  const mail = await getMailDoc(mailId);
  if (!mail || mail.userId !== String(userId) || mail.deleted === true) {
    fail('PVE_MAIL_NOT_FOUND', '邮件不存在');
  }
  if (!canDeleteMail(mail)) {
    fail('PVE_MAIL_CLAIM_REQUIRED', '请先领取附件再删除');
  }
  const docId = mail._id || mail.id;
  await getDb().collection(COLLECTIONS.PVE_MAILS).doc(docId).update({
    data: {
      deleted: true,
      updatedAt: nowMs(),
    },
  });
  return { ok: true };
}

async function markMailReadForUser(userId, mailId) {
  const mail = await getMailDoc(mailId);
  if (!mail || mail.userId !== String(userId) || mail.deleted === true) {
    fail('PVE_MAIL_NOT_FOUND', '邮件不存在');
  }
  if (mail.read === true) {
    return { mail: buildMailView(mail) };
  }
  const docId = mail._id || mail.id;
  await getDb().collection(COLLECTIONS.PVE_MAILS).doc(docId).update({
    data: {
      read: true,
      updatedAt: nowMs(),
    },
  });
  return { mail: buildMailView({ ...mail, read: true }) };
}

module.exports = {
  createMailForUser,
  listMailsForUser,
  claimMailForUser,
  claimAllMailsForUser,
  deleteMailForUser,
  markMailReadForUser,
  getMailDoc,
};
