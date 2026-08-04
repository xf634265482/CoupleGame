const cloud = require('wx-server-sdk');
const { ADMIN_ACTION_SET, getCurrentEnvId, getEnvLabel } = require('./common/admin/AdminConstants');
const { requireAdminSession } = require('./common/admin/AdminAuth');
const { handleAdminAction } = require('./common/admin/AdminToolService');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event = {}) => {
  try {
    const token = typeof event.token === 'string' ? event.token : '';
    const action = String(event.action || '').trim();
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const requestSource = String(event.requestSource || 'gm-web').trim() || 'gm-web';

    if (!ADMIN_ACTION_SET.has(action)) {
      return {
        ok: false,
        code: 'ADMIN_ACTION_NOT_ALLOWED',
        message: `不允许的 action: ${action}`,
      };
    }

    const { account, session } = await requireAdminSession(token);
    const result = await handleAdminAction({
      account,
      session,
      action,
      payload,
      requestSource,
    });

    return {
      ...result,
      envId: getCurrentEnvId(),
      envLabel: getEnvLabel(),
    };
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'ADMIN_TOOL_ERROR',
      message: err.message || String(err),
    };
  }
};
