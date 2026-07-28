const {
  normalizeMailInput,
  canDeleteMail,
  applyMailAttachmentsToUserState,
  isUnread,
} = require('../pve/PveMail');
const { createDefaultProfile } = require('../pve/PveProfile');
const { STAMINA_MAX } = require('../pve/PveStamina');

describe('PveMail', () => {
  test('normalizeMailInput accepts empty attachments', () => {
    const m = normalizeMailInput({ title: 'hi', body: 'body', attachments: [] });
    expect(m.title).toBe('hi');
    expect(m.attachments).toEqual([]);
  });

  test('rejects bad attachment type or non-positive amount', () => {
    expect(() => normalizeMailInput({
      title: 't', body: 'b', attachments: [{ type: 'diamond', amount: 1 }],
    })).toThrow();
    expect(() => normalizeMailInput({
      title: 't', body: 'b', attachments: [{ type: 'stardust', amount: 0 }],
    })).toThrow();
  });

  test('apply stardust and stamina with cap', () => {
    const profile = { ...createDefaultProfile(1), gold: 10 };
    const next = applyMailAttachmentsToUserState(
      { profile, stamina: STAMINA_MAX - 2, staminaUpdatedAt: 1 },
      [{ type: 'stardust', amount: 5 }, { type: 'stamina', amount: 10 }],
      1000,
    );
    expect(next.profile.gold).toBe(15);
    expect(next.stamina).toBe(STAMINA_MAX);
  });

  test('canDelete only when no unclaimed attachments', () => {
    expect(canDeleteMail({ attachments: [], claimed: false, deleted: false })).toBe(true);
    expect(canDeleteMail({
      attachments: [{ type: 'stardust', amount: 1 }],
      claimed: false,
      deleted: false,
    })).toBe(false);
    expect(canDeleteMail({
      attachments: [{ type: 'stardust', amount: 1 }],
      claimed: true,
      deleted: false,
    })).toBe(true);
  });

  test('unread when unread flag or unclaimed attachments', () => {
    expect(isUnread({ read: false, claimed: true, attachments: [] })).toBe(true);
    expect(isUnread({
      read: true, claimed: false, attachments: [{ type: 'stamina', amount: 1 }],
    })).toBe(true);
    expect(isUnread({ read: true, claimed: true, attachments: [] })).toBe(false);
  });
});
