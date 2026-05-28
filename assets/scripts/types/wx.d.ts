/** 微信小游戏运行时全局（构建后在微信环境可用） */
declare const wx: {
  cloud: {
    init(options: { env: string; traceUser?: boolean }): void;
    callFunction<T = unknown>(options: {
      name: string;
      data?: Record<string, unknown>;
    }): Promise<{ result: T; errMsg: string }>;
    database(): WxDatabase;
  };
  onHide(callback: () => void): void;
  offHide(callback: () => void): void;
  shareAppMessage(options: { title?: string; query?: string }): void;
  getLaunchOptionsSync(): { query?: Record<string, string> };
  getSystemInfoSync(): { platform?: string; [key: string]: unknown };
  showKeyboard(options: {
    defaultValue?: string;
    maxLength?: number;
    multiple?: boolean;
    confirmType?: string;
    success?: () => void;
    fail?: (err: unknown) => void;
  }): void;
  hideKeyboard(options?: Record<string, unknown>): void;
  onKeyboardInput?(callback: (res: { value: string }) => void): void;
  onKeyboardConfirm?(callback: (res: { value: string }) => void): void;
  onKeyboardHeightChange?(callback: (res: { height: number }) => void): void;
  offKeyboardInput?(callback: (res: { value: string }) => void): void;
  offKeyboardConfirm?(callback: (res: { value: string }) => void): void;
  offKeyboardHeightChange?(callback: (res: { height: number }) => void): void;
};

interface WxDatabase {
  collection(name: string): WxCollection;
}

interface WxCollection {
  doc(id: string): WxDocument;
}

interface WxDocument {
  watch(options: {
    onChange: (snapshot: WxWatchSnapshot) => void;
    onError?: (err: unknown) => void;
  }): WxWatcher;
}

interface WxWatchSnapshot {
  docChanges: Array<{
    docId?: string;
    dataType?: string;
    doc: Record<string, unknown> & {
      _id?: string;
      data?: Record<string, unknown> | (() => Record<string, unknown>);
    };
  }>;
  docs?: Record<string, unknown>[];
  type?: string;
}

interface WxWatcher {
  close(): void;
}
