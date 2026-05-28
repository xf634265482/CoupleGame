export class CloudServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'CloudServiceError';
  }
}

/** 封装 wx.cloud.callFunction，统一错误处理 → AC-14 */
export async function callFunction<T>(
  name: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new CloudServiceError('wx.cloud 不可用，请在微信小游戏中运行');
  }

  try {
    const res = await wx.cloud.callFunction({ name, data });
    return res.result as T;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CloudServiceError(msg, 'CLOUD_CALL_FAILED');
  }
}
