// PveDebug —— PVE 卡顿/卡死现场取证工具（临时插桩，定位完毕后整文件可删）
//
// 用法：
//   PveDebug.install()                   // 在 GameApp.onLoad 顶部调用一次，挂全局 error handler
//   PveDebug.mark('phase.name', detail?) // 在关键代码点打 phase 标记
//   PveDebug.wrap('label', () => {...})  // 同步函数 try/catch 包裹
//   await PveDebug.wrapAsync('label', async () => {...})
//
// 崩溃时 console 会打印最近 16 条 phase + 错误 + 堆栈，方便回溯崩溃前发生了什么。

interface PhaseEntry {
  t: number;
  label: string;
  detail?: string;
}

const RING_SIZE = 96;
/** Routine phase marks stay in memory and are emitted only by dumpRing(). */
const LIVE_PHASE_CONSOLE = false;
const ring: PhaseEntry[] = [];
let installed = false;

function push(label: string, detail?: string): void {
  ring.push({ t: Date.now(), label, detail });
  if (ring.length > RING_SIZE) ring.shift();
  // 每条 mark 实时 console.log，方便真机调试时（无法 eval）直接用 Filter 过滤 [PVE] 看完整链。
  if (LIVE_PHASE_CONSOLE) console.log(`[PVE] ${label}${detail ? ' ' + detail : ''}`);
}

function dumpRing(reason: string, err?: unknown): void {
  console.error(`[PVE_DEBUG] ─── crash dump (${reason}) ───`);
  const now = Date.now();
  for (const e of ring) {
    const ago = now - e.t;
    console.error(`[PVE_DEBUG]   -${ago}ms  ${e.label}${e.detail ? '  ' + e.detail : ''}`);
  }
  if (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[PVE_DEBUG] error:', msg);
    if (stack) console.error('[PVE_DEBUG] stack:', stack);
  }
  console.error('[PVE_DEBUG] ─── end dump ───');
}

export const PveDebug = {
  install(): void {
    if (installed) return;
    installed = true;

    const g = globalThis as unknown as {
      onerror?: unknown;
      onunhandledrejection?: unknown;
      addEventListener?: (type: string, cb: (ev: unknown) => void) => void;
      wx?: {
        onError?: (cb: (err: string) => void) => void;
        onUnhandledRejection?: (cb: (res: { reason: unknown }) => void) => void;
      };
    };

    // 浏览器 / Cocos 预览
    if (typeof g.addEventListener === 'function') {
      try {
        g.addEventListener('error', (ev: unknown) => {
          const e = ev as { error?: unknown; message?: string };
          dumpRing('window.onerror', e?.error ?? e?.message ?? ev);
        });
        g.addEventListener('unhandledrejection', (ev: unknown) => {
          const e = ev as { reason?: unknown };
          dumpRing('unhandledrejection', e?.reason ?? ev);
        });
      } catch {}
    }

    // 微信小游戏
    if (g.wx) {
      try { g.wx.onError?.((err) => dumpRing('wx.onError', err)); } catch {}
      try { g.wx.onUnhandledRejection?.((res) => dumpRing('wx.onUnhandledRejection', res?.reason)); } catch {}
    }

    push('PveDebug.install', 'ok');
    // 暴露到 globalThis，devtools console 可直接调用 PveDebug.dump() / PveDebug.snapshot()
    try { (globalThis as Record<string, unknown>).PveDebug = PveDebug; } catch {}
    console.log('[PVE_DEBUG] installed (call PveDebug.dump() in console anytime)');
  },

  mark(label: string, detail?: string): void {
    push(label, detail);
  },

  /** 同步 try/catch 包裹：抛错时打 dump 后继续抛（不吞错）。 */
  wrap<T>(label: string, fn: () => T): T {
    push(`wrap.enter:${label}`);
    try {
      const r = fn();
      push(`wrap.exit:${label}`);
      return r;
    } catch (err) {
      dumpRing(`wrap throw:${label}`, err);
      throw err;
    }
  },

  /** 异步 try/catch 包裹。 */
  async wrapAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    push(`wrapAsync.enter:${label}`);
    try {
      const r = await fn();
      push(`wrapAsync.exit:${label}`);
      return r;
    } catch (err) {
      dumpRing(`wrapAsync throw:${label}`, err);
      throw err;
    }
  },

  /** 显式触发一次 dump（无错误，用于"我手动卡了"时按钮触发）。 */
  dump(reason = 'manual'): void {
    dumpRing(reason);
  },

  /** 返回最近 phase ring 快照，供 UI 调试显示。 */
  snapshot(): PhaseEntry[] {
    return ring.slice();
  },
};
