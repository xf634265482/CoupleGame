const cloud = require('wx-server-sdk');
const { getCurrentEnvId, getEnvLabel } = require('./common/admin/AdminConstants');
const { getAdminAccountByUsername, verifyAdminPassword, createAdminSession } = require('./common/admin/AdminAuth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event = {}) => {
  try {
    const username = String(event.username || '').trim();
    const password = typeof event.password === 'string' ? event.password : '';
    const requestSource = String(event.requestSource || 'gm-web').trim() || 'gm-web';

    if (!username || !password) {
      return {
        ok: false,
        code: 'ADMIN_LOGIN_FIELDS_REQUIRED',
        message: '请输入管理员账号和密码',
      };
    }

    const account = await getAdminAccountByUsername(username);
    if (!account || account.disabled === true) {
      return {
        ok: false,
        code: 'ADMIN_LOGIN_FAILED',
        message: '账号或密码错误',
      };
    }

    const passwordOk = await verifyAdminPassword(account, password);
    if (!passwordOk) {
      return {
        ok: false,
        code: 'ADMIN_LOGIN_FAILED',
        message: '账号或密码错误',
      };
    }

    const session = await createAdminSession(account, requestSource);
    return {
      ok: true,
      token: session.token,
      expireAt: session.expireAt,
      adminName: account.displayName || account.username,
      username: account.username,
      envId: getCurrentEnvId(),
      envLabel: getEnvLabel(),
    };
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'ADMIN_LOGIN_ERROR',
      message: err.message || String(err),
    };
  }
};
