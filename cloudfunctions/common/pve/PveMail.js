const { STAMINA_MAX, resolveStamina } = require('./PveStamina');
const { normalizeMaterials } = require('./PveCamp');
const { normalizeCheckIn } = require('./PveCheckIn');

const MAIL_ATTACHMENT_TYPES = {
  STARDUST: 'stardust',
  STAMINA: 'stamina',
  QUENCH_SAND: 'quenchSand',
  FUSION_CORE: 'fusionCore',
  VOID_HIDE: 'voidHide',
  MAKEUP_CARDS: 'makeupCards',
};

const ALLOWED_ATTACHMENT_TYPES = new Set(Object.values(MAIL_ATTACHMENT_TYPES));

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  throw err;
}

function normalizeAttachment(input) {
  const type = String(input?.type || '').trim();
  const amount = Number(input?.amount);
  if (!ALLOWED_ATTACHMENT_TYPES.has(type)) {
    fail('PVE_MAIL_ATTACHMENT_INVALID', '附件类型不支持');
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    fail('PVE_MAIL_ATTACHMENT_INVALID', '附件数量必须为正整数');
  }
  const max = type === MAIL_ATTACHMENT_TYPES.MAKEUP_CARDS ? 999 : 999999;
  if (amount > max) {
    fail('PVE_MAIL_ATTACHMENT_INVALID', '附件数量过大');
  }
  return { type, amount };
}

function normalizeMailInput({ title, body, attachments } = {}) {
  const titleText = String(title || '').trim();
  const bodyText = String(body || '').trim();
  if (!titleText) fail('PVE_MAIL_TITLE_REQUIRED', '邮件标题不能为空');
  if (titleText.length > 80) fail('PVE_MAIL_TITLE_TOO_LONG', '邮件标题过长');
  if (bodyText.length > 2000) fail('PVE_MAIL_BODY_TOO_LONG', '邮件正文过长');
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length > 8) fail('PVE_MAIL_TOO_MANY_ATTACHMENTS', '附件过多');
  return {
    title: titleText,
    body: bodyText,
    attachments: list.map(normalizeAttachment),
  };
}

function hasUnclaimedAttachments(mail) {
  const list = Array.isArray(mail?.attachments) ? mail.attachments : [];
  return list.length > 0 && mail?.claimed !== true;
}

function canDeleteMail(mail) {
  if (!mail || mail.deleted === true) return false;
  return !hasUnclaimedAttachments(mail);
}

function isUnread(mail) {
  if (!mail || mail.deleted === true) return false;
  if (mail.read !== true) return true;
  return hasUnclaimedAttachments(mail);
}

function applyMailAttachmentsToUserState(
  { profile, stamina, staminaUpdatedAt },
  attachments,
  now = Date.now(),
) {
  const list = Array.isArray(attachments) ? attachments : [];
  let nextProfile = { ...profile };
  let gold = Math.max(0, Math.trunc(Number(nextProfile.gold) || 0));
  let materials = normalizeMaterials(nextProfile.materials);
  let checkIn = normalizeCheckIn(nextProfile.checkIn, now);
  const resolved = resolveStamina(stamina, staminaUpdatedAt, now);
  let nextStamina = resolved.stamina;
  let nextUpdatedAt = resolved.updatedAt;

  for (const raw of list) {
    const item = normalizeAttachment(raw);
    if (item.type === MAIL_ATTACHMENT_TYPES.STARDUST) {
      gold += item.amount;
    } else if (item.type === MAIL_ATTACHMENT_TYPES.STAMINA) {
      nextStamina = Math.min(STAMINA_MAX, nextStamina + item.amount);
      nextUpdatedAt = now;
    } else if (item.type === MAIL_ATTACHMENT_TYPES.QUENCH_SAND) {
      materials = { ...materials, quenchSand: materials.quenchSand + item.amount };
    } else if (item.type === MAIL_ATTACHMENT_TYPES.FUSION_CORE) {
      materials = { ...materials, fusionCore: materials.fusionCore + item.amount };
    } else if (item.type === MAIL_ATTACHMENT_TYPES.VOID_HIDE) {
      materials = { ...materials, voidHide: materials.voidHide + item.amount };
    } else if (item.type === MAIL_ATTACHMENT_TYPES.MAKEUP_CARDS) {
      checkIn = { ...checkIn, makeupCards: checkIn.makeupCards + item.amount };
    }
  }

  nextProfile = { ...nextProfile, gold, materials, checkIn };
  const after = resolveStamina(nextStamina, nextUpdatedAt, now);
  return {
    profile: nextProfile,
    stamina: after.stamina,
    staminaUpdatedAt: after.updatedAt,
    staminaNextRecoveryAt: after.nextRecoveryAt,
  };
}

function buildMailView(doc) {
  if (!doc) return null;
  const attachments = Array.isArray(doc.attachments) ? doc.attachments.map(normalizeAttachment) : [];
  return {
    id: String(doc.id || doc._id || ''),
    title: String(doc.title || ''),
    body: String(doc.body || ''),
    attachments,
    claimed: doc.claimed === true,
    read: doc.read === true,
    deleted: doc.deleted === true,
    batchId: doc.batchId ? String(doc.batchId) : '',
    createdAt: Number(doc.createdAt) || 0,
    createdBy: String(doc.createdBy || ''),
    unread: isUnread({ ...doc, attachments }),
  };
}

module.exports = {
  MAIL_ATTACHMENT_TYPES,
  normalizeAttachment,
  normalizeMailInput,
  canDeleteMail,
  hasUnclaimedAttachments,
  isUnread,
  applyMailAttachmentsToUserState,
  buildMailView,
};
