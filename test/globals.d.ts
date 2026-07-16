/// <reference types="jest" />

declare const wx: {
  loadSubpackage?: (opts: unknown) => { onProgressUpdate?: (cb: (res: unknown) => void) => void } | void;
  getSystemInfoSync?: () => { platform?: string };
  getFileSystemManager?: () => {
    readFile: (opts: unknown) => void;
    writeFile: (opts: unknown) => void;
    copyFile?: (opts: unknown) => void;
  };
  createImage?: () => HTMLImageElement;
  env?: { USER_DATA_PATH: string };
};
