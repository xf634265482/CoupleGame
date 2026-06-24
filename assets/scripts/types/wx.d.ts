declare namespace WechatMiniprogram {
  interface GetPrivacySettingSuccessCallbackResult {
    needAuthorization: boolean;
  }
}

interface WxCloudFunctionOptions {
  name: string;
  data?: Record<string, unknown>;
}

interface WxCloudFunctionResult<T = unknown> {
  result: T;
  errMsg: string;
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

interface WxDocumentGetResult {
  data?: Record<string, unknown>;
}

interface WxDocument {
  get(): Promise<WxDocumentGetResult>;
  watch(options: {
    onChange: (snapshot: WxWatchSnapshot) => void;
    onError?: (err: unknown) => void;
  }): WxWatcher;
}

interface WxCollection {
  doc(id: string): WxDocument;
}

interface WxDatabase {
  collection(name: string): WxCollection;
}

interface WxInnerAudioContext {
  src: string;
  loop: boolean;
  volume: number;
  obeyMuteSwitch: boolean;
  paused?: boolean;
  play(): void;
  stop(): void;
  onError?(callback: (err: unknown) => void): void;
}

interface WxFileSystemManager {
  copyFile(options: {
    srcPath: string;
    destPath: string;
    success?: () => void;
    fail?: (err: unknown) => void;
  }): void;
  readFile(options: {
    filePath: string;
    success?: (res: { data: ArrayBuffer | string }) => void;
    fail?: (err: unknown) => void;
  }): void;
  writeFile(options: {
    filePath: string;
    data: ArrayBuffer | string;
    success?: () => void;
    fail?: (err: unknown) => void;
  }): void;
}

interface WxSubpackageTask {
  onProgressUpdate?(callback: (res: {
    progress: number;
    totalBytesWritten: number;
    totalBytesExpectedToWrite: number;
  }) => void): void;
}

declare const wx: {
  env: {
    USER_DATA_PATH: string;
  };
  cloud: {
    init(options: { env: string; traceUser?: boolean }): void;
    callFunction<T = unknown>(options: WxCloudFunctionOptions): Promise<WxCloudFunctionResult<T>>;
    database(): WxDatabase;
  };
  onHide(callback: () => void): void;
  offHide(callback: () => void): void;
  shareAppMessage(options: { title?: string; query?: string }): void;
  getLaunchOptionsSync(): { query?: Record<string, string> };
  getSystemInfoSync(): { platform?: string; windowWidth?: number; screenWidth?: number; [key: string]: unknown };
  getWindowInfo?(): { windowWidth?: number; screenWidth?: number; [key: string]: unknown };
  getMenuButtonBoundingClientRect?(): { bottom?: number };
  getStorageSync?<T = unknown>(key: string): T;
  setStorageSync?(key: string, value: unknown): void;
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
  onWindowResize?(callback: () => void): void;
  offWindowResize?(callback: () => void): void;
  onTouchStart?(callback: () => void): void;
  offTouchStart?(callback: () => void): void;
  onTouchEnd?(callback: () => void): void;
  offTouchEnd?(callback: () => void): void;
  setInnerAudioOption?(options: {
    obeyMuteSwitch?: boolean;
    mixWithOther?: boolean;
    success?: () => void;
    fail?: (err: unknown) => void;
  }): void;
  createInnerAudioContext?(): WxInnerAudioContext;
  getFileSystemManager?(): WxFileSystemManager;
  loadSubpackage?(options: {
    name: string;
    success?: () => void;
    fail?: (err: unknown) => void;
  }): WxSubpackageTask;
  createImage?(): HTMLImageElement;
  getPrivacySetting?(options: {
    success: (res: WechatMiniprogram.GetPrivacySettingSuccessCallbackResult) => void;
    fail?: (err: unknown) => void;
  }): void;
  requirePrivacyAuthorize?(options: {
    success?: () => void;
    fail?: (err: unknown) => void;
  }): void;
  exitMiniProgram?(options?: { fail?: (err: unknown) => void }): void;
};
