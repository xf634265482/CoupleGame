import cloudbase from '@cloudbase/js-sdk';
import type { AdminAction, LocalDocSyncResult, LoginResponse, ToolResponse } from './types';

const envId = import.meta.env.VITE_TCB_ENV_ID as string | undefined;

if (!envId) {
  throw new Error('Missing VITE_TCB_ENV_ID');
}

const app = cloudbase.init({
  env: envId,
});

let authReady: Promise<void> | null = null;

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return String(error);

  const candidate = error as {
    message?: unknown;
    errMsg?: unknown;
    code?: unknown;
    original?: { message?: unknown; errMsg?: unknown; code?: unknown };
  };

  if (typeof candidate.message === 'string' && candidate.message) return candidate.message;
  if (typeof candidate.errMsg === 'string' && candidate.errMsg) return candidate.errMsg;

  if (candidate.original) {
    if (typeof candidate.original.message === 'string' && candidate.original.message) return candidate.original.message;
    if (typeof candidate.original.errMsg === 'string' && candidate.original.errMsg) return candidate.original.errMsg;
  }

  const code =
    typeof candidate.code === 'string'
      ? candidate.code
      : typeof candidate.original?.code === 'string'
        ? candidate.original.code
        : '';

  return code ? `请求失败：${code}` : JSON.stringify(error);
}

function explainCloudBaseAuthError(error: unknown): string {
  const raw = extractErrorMessage(error);
  const lower = raw.toLowerCase();

  if (lower.includes('pve_balance_configs') && lower.includes('not exist')) {
    return [
      'PVE 数值配置集合 `pve_balance_configs` 不存在，所以本次保存没有成功。',
      '请重新部署并运行一次 `initDb` 云函数，确认它把 `pve_balance_configs` 创建出来。',
      '如果你在云数据库里手动检查，也要确认当前环境里已经存在这个集合。',
      `原始错误：${raw}`,
    ].join('\n');
  }

  if (lower.includes('credentials not found') || lower.includes('unauthenticated')) {
    return [
      'CloudBase 网页端身份未就绪。',
      '请到云开发控制台开启“匿名登录”，并把本地地址加入安全域名：',
      '1. 身份认证 -> 登录方式 -> 开启匿名登录',
      '2. 环境配置 / 安全配置 -> 安全域名 -> 添加 http://127.0.0.1:5173',
      '3. 如仍失败，再补加 http://localhost:5173',
      `原始错误：${raw}`,
    ].join('\n');
  }

  if (lower.includes('cors') || lower.includes('illegal source') || lower.includes('invalid origin')) {
    return [
      '当前本地地址不在 CloudBase 安全域名白名单里。',
      '请到云开发控制台的安全域名里添加：',
      '- http://127.0.0.1:5173',
      '- http://localhost:5173',
      `原始错误：${raw}`,
    ].join('\n');
  }

  return raw;
}

async function ensureAuth(): Promise<void> {
  if (!authReady) {
    authReady = (async () => {
      const auth = app.auth({ persistence: 'session' });
      try {
        // v3 sdk
        if (typeof (auth as { signInAnonymously?: () => Promise<unknown> }).signInAnonymously === 'function') {
          await (auth as { signInAnonymously: () => Promise<unknown> }).signInAnonymously();
          return;
        }
        // v2 sdk fallback
        const anonymousProvider = (auth as { anonymousAuthProvider?: () => { signIn: () => Promise<unknown> } }).anonymousAuthProvider?.();
        if (anonymousProvider) {
          await anonymousProvider.signIn();
          return;
        }
        throw new Error('CloudBase Web SDK 当前未拿到可用的匿名登录能力');
      } catch (error) {
        console.warn('CloudBase anonymous auth failed', error);
        throw new Error(explainCloudBaseAuthError(error));
      }
    })();
  }
  await authReady;
}

async function callFunction<T>(name: string, data: Record<string, unknown>): Promise<T> {
  try {
    await ensureAuth();
    const response = await app.callFunction({
      name,
      data,
    });

    if (response && typeof response === 'object') {
      const wrapped = response as { result?: T };
      if (wrapped.result !== undefined) {
        return wrapped.result;
      }

      // Some CloudBase gateway responses come back as the payload itself.
      const plainResponse = response as unknown as Record<string, unknown>;
      if ('ok' in plainResponse || 'code' in plainResponse) {
        return response as T;
      }
    }

    if (!response || typeof response !== 'object' || !('result' in response)) {
      throw new Error(`云函数 ${name} 没有返回 result 字段`);
    }
    const result = (response as { result?: T }).result;
    if (result === undefined) {
      throw new Error(`云函数 ${name} 返回了空结果`);
    }
    return result;
  } catch (error) {
    throw new Error(explainCloudBaseAuthError(error));
  }
}

export async function loginAdmin(username: string, password: string): Promise<LoginResponse> {
  return callFunction<LoginResponse>('adminLogin', {
    username,
    password,
    requestSource: 'gm-web',
  });
}

export async function callAdminTool(
  token: string,
  action: AdminAction,
  payload: Record<string, unknown>,
): Promise<ToolResponse> {
  return callFunction<ToolResponse>('adminTool', {
    token,
    action,
    payload,
    requestSource: 'gm-web',
  });
}

export async function syncLocalBalanceDocs(payload: Record<string, unknown>): Promise<LocalDocSyncResult> {
  const response = await fetch('/__gm/sync-balance-docs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json() as LocalDocSyncResult;
  if (!response.ok || !result.ok) {
    throw new Error(result.message || '本地同步仓库文档失败');
  }
  return result;
}
