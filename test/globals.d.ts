/// <reference types="jest" />

interface WxSubpackageProgress {
  progress?: number;
  totalBytesExpectedToWrite?: number;
  totalBytesWritten?: number;
}

declare const wx: {
  loadSubpackage?: (opts: unknown) => {
    onProgressUpdate?: (cb: (res: WxSubpackageProgress) => void) => void;
  } | void;
  getSystemInfoSync?: () => { platform?: string };
  getFileSystemManager?: () => {
    readFile: (opts: unknown) => void;
    writeFile: (opts: unknown) => void;
    copyFile?: (opts: unknown) => void;
  };
  createImage?: () => HTMLImageElement;
  env?: { USER_DATA_PATH: string };
  onWindowResize?: (handler: () => void) => void;
  offWindowResize?: (handler: () => void) => void;
};
