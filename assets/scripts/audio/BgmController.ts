import {
  _decorator,
  AssetManager,
  AudioClip,
  AudioSource,
  Component,
  director,
  Node,
} from 'cc';
import { bindWechatAudioUnlock, initWxAudioPolicy, unbindWechatAudioUnlock } from '../platform/wechat/WxAudio';
import { SCENE } from '../core/Constants';

const { ccclass } = _decorator;

const BGM_PATH = 'audio/bgm_main';
const WECHAT_BGM_MAIN_NATIVE = ['assets', 'resources', 'native', 'f1', 'f1a2b3c4-5678-4901-a234-567890abcdef.mp3'].join('/');
const WECHAT_BGM_SUB_NATIVE = ['subpackages', 'resources', 'native', 'f1', 'f1a2b3c4-5678-4901-a234-567890abcdef.mp3'].join('/');
const WECHAT_BGM_TEMP_NAME = 'couple-bgm-main.mp3';
const FALLBACK_PERSIST_NODE = 'CoupleGameBgm';
const MAIN_BGM_VOLUME = 0.45;

let bgmInstance: BgmController | null = null;
/** 切场景后 bootstrap 的 Bgm 节点可能被销毁，clip 缓存供触摸恢复 */
let cachedBgmClip: AudioClip | null = null;
let wxBgmAudio: any = null;
let wxBgmTempSrc: string | null = null;
let wxBgmPreparing: Promise<string | null> | null = null;

export function getBgmController(): BgmController | null {
  return bgmInstance?.isValid ? bgmInstance : null;
}

function shouldPlayMainBgmInCurrentScene(): boolean {
  return director.getScene()?.name === SCENE.LOBBY;
}

function ensureFallbackAudioSource(): AudioSource | null {
  const scene = director.getScene();
  if (!scene) {
    return null;
  }
  let node = scene.getChildByName(FALLBACK_PERSIST_NODE);
  if (!node) {
    node = new Node(FALLBACK_PERSIST_NODE);
    director.addPersistRootNode(node);
  }
  let audio = node.getComponent(AudioSource);
  if (!audio) {
    audio = node.addComponent(AudioSource);
    audio.playOnAwake = false;
  }
  return audio;
}

function isWechatInnerAudioRuntime(): boolean {
  return typeof wx !== 'undefined' && typeof wx.createInnerAudioContext === 'function';
}

function isWechatRealDevice(): boolean {
  if (!isWechatInnerAudioRuntime()) {
    return false;
  }
  try {
    return wx.getSystemInfoSync?.().platform !== 'devtools';
  } catch {
    return true;
  }
}

function wechatBgmTempPath(): string {
  return `${wx.env.USER_DATA_PATH}/${WECHAT_BGM_TEMP_NAME}`;
}

function wechatBgmSourcePaths(): string[] {
  const paths: string[] = [];
  for (const candidate of [WECHAT_BGM_MAIN_NATIVE, WECHAT_BGM_SUB_NATIVE]) {
    const bare = candidate.replace(/^\/+/, '');
    for (const p of [bare, `/${bare}`]) {
      if (!paths.includes(p)) {
        paths.push(p);
      }
    }
  }
  return paths;
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function copyWechatNativeFileToTempOnce(sourcePath: string, tempPath: string): Promise<string | null> {
  if (typeof wx === 'undefined' || !wx.getFileSystemManager) {
    return Promise.resolve(null);
  }
  const fs = wx.getFileSystemManager();
  return new Promise((resolve) => {
    const readThenWrite = () => {
      fs.readFile({
        filePath: sourcePath,
        success: (res) => {
          fs.writeFile({
            filePath: tempPath,
            data: res.data,
            success: () => resolve(tempPath),
            fail: (err) => {
              console.warn('[BgmController] wx write bgm temp failed', tempPath, err);
              resolve(null);
            },
          });
        },
        fail: (err) => {
          console.warn('[BgmController] wx read bgm native failed', sourcePath, err);
          resolve(null);
        },
      });
    };

    if (typeof fs.copyFile === 'function') {
      fs.copyFile({
        srcPath: sourcePath,
        destPath: tempPath,
        success: () => resolve(tempPath),
        fail: () => readThenWrite(),
      });
      return;
    }
    readThenWrite();
  });
}

async function copyWechatBgmNativeToTemp(tempPath: string): Promise<string | null> {
  const paths = wechatBgmSourcePaths();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    for (const sourcePath of paths) {
      const hit = await copyWechatNativeFileToTempOnce(sourcePath, tempPath);
      if (hit) {
        return hit;
      }
    }
    if (attempt + 1 < 6) {
      await delayMs(200);
    }
  }
  return null;
}

function prepareWechatBgmSrc(): Promise<string | null> {
  if (wxBgmTempSrc) {
    return Promise.resolve(wxBgmTempSrc);
  }
  if (wxBgmPreparing) {
    return wxBgmPreparing;
  }

  const tempPath = wechatBgmTempPath();
  wxBgmPreparing = copyWechatBgmNativeToTemp(tempPath).then((src) => {
    wxBgmTempSrc = src;
    wxBgmPreparing = null;
    if (!src) {
      console.error('[BgmController] wx bgm native unavailable', WECHAT_BGM_MAIN_NATIVE);
    }
    return src;
  });
  return wxBgmPreparing;
}

function ensureWechatBgmAudio(): any {
  if (wxBgmAudio) {
    return wxBgmAudio;
  }
  wxBgmAudio = wx.createInnerAudioContext();
  wxBgmAudio.loop = true;
  wxBgmAudio.volume = MAIN_BGM_VOLUME;
  wxBgmAudio.obeyMuteSwitch = false;
  // 注：原本注册 onPlay 打 log，但微信 InnerAudio loop 模式每次循环重新播放都会触发，
  // 真机连续日志噪音；功能不依赖此日志，注释掉。如需 debug 临时打开。
  wxBgmAudio.onError?.((err: unknown) => {
    console.warn('[BgmController] wx inner audio error', wxBgmAudio?.src, err);
  });
  return wxBgmAudio;
}

function playWechatBgm(): Promise<void> {
  if (!isWechatInnerAudioRuntime()) {
    return Promise.resolve();
  }
  if (!shouldPlayMainBgmInCurrentScene()) {
    return Promise.resolve();
  }
  initWxAudioPolicy();
  const barePath = WECHAT_BGM_MAIN_NATIVE.replace(/^\/+/, '');
  const audio = ensureWechatBgmAudio();
  audio.loop = true;
  audio.volume = MAIN_BGM_VOLUME;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (label: string) => {
      if (settled) return;
      settled = true;
      console.log('[BgmController] wx inner audio play', audio.src, label);
      // 真机起播成功后立即解绑 unlock 监听，避免后续每次 touch 都跑 resume 回调
      if (label === 'direct-subpackage' || label === 'temp-copy') {
        unbindWechatAudioUnlock();
      }
      resolve();
    };

    const tryTempCopy = () => {
      void prepareWechatBgmSrc().then((src) => {
        if (!shouldPlayMainBgmInCurrentScene()) {
          finish('scene-changed');
          return;
        }
        if (src) {
          audio.src = src;
          audio.play();
          finish('temp-copy');
          return;
        }
        finish('unavailable');
      });
    };

    const prevOnError = audio.onError;
    audio.onError = (err: unknown) => {
      prevOnError?.(err);
      if (!settled) {
        console.warn('[BgmController] wx direct subpackage failed, try temp copy', barePath, err);
        tryTempCopy();
      }
    };

    audio.src = barePath;
    audio.play();
    setTimeout(() => {
      if (!settled && audio.paused === false && shouldPlayMainBgmInCurrentScene()) {
        finish('direct-subpackage');
      }
    }, 800);
    setTimeout(() => {
      if (!settled) {
        tryTempCopy();
      }
    }, 2500);
  });
}

/** GameApp / 大厅：优先 bootstrap 上的 BgmController，否则用持久 fallback 节点 */
export function playMainBgm(bundle: AssetManager.Bundle): Promise<void> {
  if (!shouldPlayMainBgmInCurrentScene()) {
    return Promise.resolve();
  }
  if (typeof wx !== 'undefined') {
    bindWechatAudioUnlock(resumeMainBgmAfterTouch);
  }
  if (isWechatRealDevice()) {
    console.log('[BgmController] wx real-device — inner audio from main native');
    return playWechatBgm();
  }
  const ctrl = getBgmController();
  if (ctrl) {
    return ctrl.playWithBundle(bundle);
  }
  console.log('[BgmController] no scene instance — use fallback persist node');
  return new Promise((resolve) => {
    bundle.load(BGM_PATH, AudioClip, (err, clip) => {
      if (err || !clip) {
        console.warn('[BgmController] load failed', BGM_PATH, err);
        resolve();
        return;
      }
      cachedBgmClip = clip;
      const audio = ensureFallbackAudioSource();
      if (audio && shouldPlayMainBgmInCurrentScene()) {
        audio.loop = true;
        audio.volume = MAIN_BGM_VOLUME;
        audio.clip = clip;
        audio.play();
        console.log('[BgmController] playing on fallback', BGM_PATH, 'playing=', audio.playing);
      }
      resolve();
    });
  });
}

export function stopMainBgm(): void {
  unbindWechatAudioUnlock();
  if (isWechatInnerAudioRuntime() && wxBgmAudio) {
    wxBgmAudio.stop();
  }
  const ctrl = getBgmController();
  if (ctrl) {
    ctrl.stopBgm();
  }
  const audio = ensureFallbackAudioSource();
  if (audio?.playing) {
    audio.stop();
  }
}

export function resumeMainBgmAfterTouch(): void {
  if (!shouldPlayMainBgmInCurrentScene()) {
    stopMainBgm();
    return;
  }
  // 真机 InnerAudio 路径：wxBgmAudio 自身在跑就直接解绑触摸监听，不再每次 touch 重置
  if (isWechatInnerAudioRuntime() && wxBgmAudio && !wxBgmAudio.paused) {
    unbindWechatAudioUnlock();
    return;
  }
  const ctrl = getBgmController();
  if (ctrl) {
    ctrl.resumeAfterUserGesture();
    return;
  }
  const audio = ensureFallbackAudioSource();
  if (!audio || !cachedBgmClip) {
    console.warn('[BgmController] touch resume skipped — no valid controller or clip');
    return;
  }
  // 已 playing 时短路：不再重复赋值 clip / loop / volume（每次 touch 都跑这段是噪音）
  if (audio.playing) {
    unbindWechatAudioUnlock();
    return;
  }
  audio.loop = true;
  audio.volume = MAIN_BGM_VOLUME;
  audio.clip = cachedBgmClip;
  audio.play();
  console.log('[BgmController] touch resume on fallback node, playing=', audio.playing);
  if (audio.playing) {
    unbindWechatAudioUnlock();
  }
}

/**
 * bootstrap 场景 Bgm 节点：须在 resources 分包加载后再赋值 clip（勿在场景里绑定 resources 内音频）
 */
@ccclass('BgmController')
export class BgmController extends Component {
  private _started = false;
  private _clip: AudioClip | null = null;

  onLoad() {
    bgmInstance = this;
    director.addPersistRootNode(this.node);
    const audio = this.getComponent(AudioSource);
    if (audio) {
      audio.playOnAwake = false;
    } else {
      console.warn('[BgmController] AudioSource missing on Bgm node');
    }
    initWxAudioPolicy();
    if (typeof wx !== 'undefined') {
      bindWechatAudioUnlock(resumeMainBgmAfterTouch);
    }
    console.log('[BgmController] persist node ready');
  }

  onDestroy() {
    if (bgmInstance === this) {
      bgmInstance = null;
    }
  }

  /** 用户首次触摸后重试（微信真机常见要求） */
  resumeAfterUserGesture(): void {
    if (!shouldPlayMainBgmInCurrentScene()) {
      stopMainBgm();
      return;
    }
    if (!this.isValid || !this.node?.isValid) {
      resumeMainBgmAfterTouch();
      return;
    }
    const audio = this.getComponent(AudioSource);
    if (!audio) {
      return;
    }
    // 已 playing 时短路 + 解绑触摸监听（避免每次 touch 都跑下面的赋值/play）
    if (audio.playing) {
      unbindWechatAudioUnlock();
      return;
    }
    const clip = this._clip ?? cachedBgmClip;
    if (clip && !audio.clip) {
      audio.clip = clip;
    }
    if (!audio.clip) {
      console.warn('[BgmController] resume skipped — no clip loaded yet');
      return;
    }
    audio.loop = true;
    audio.volume = MAIN_BGM_VOLUME;
    audio.play();
    this._started = true;
    console.log('[BgmController] resume after touch, playing=', audio.playing);
    if (audio.playing) {
      unbindWechatAudioUnlock();
    }
  }

  stopBgm(): void {
    this._started = false;
    const audio = this.getComponent(AudioSource);
    if (audio?.playing) {
      audio.stop();
    }
  }

  /** GameApp / 大厅在 ensureResourcesBundle 成功后调用 */
  playWithBundle(bundle: AssetManager.Bundle): Promise<void> {
    if (!shouldPlayMainBgmInCurrentScene()) {
      return Promise.resolve();
    }
    if (isWechatRealDevice()) {
      return playWechatBgm();
    }
    const existing = this.getComponent(AudioSource);
    if (this._started && cachedBgmClip && existing?.playing) {
      return Promise.resolve();
    }
    const audio = this.getComponent(AudioSource);
    if (!audio) {
      console.warn('[BgmController] AudioSource missing');
      return Promise.resolve();
    }

    console.log('[BgmController] loading', BGM_PATH);
    return new Promise((resolve) => {
      bundle.load(BGM_PATH, AudioClip, (err, clip) => {
        if (err || !clip) {
          console.warn('[BgmController] load failed', BGM_PATH, err);
          if (isWechatInnerAudioRuntime()) {
            void playWechatBgm().then(() => resolve());
            return;
          }
          resolve();
          return;
        }
        this._clip = clip;
        cachedBgmClip = clip;
        this.scheduleOnce(() => {
          if (!shouldPlayMainBgmInCurrentScene()) {
            resolve();
            return;
          }
          if (!this.isValid || !this.node?.isValid) {
            const fallback = ensureFallbackAudioSource();
            if (fallback) {
              fallback.loop = true;
              fallback.volume = MAIN_BGM_VOLUME;
              fallback.clip = clip;
              fallback.play();
              this._started = true;
              console.log('[BgmController] playing on fallback node', BGM_PATH);
            }
            resolve();
            return;
          }
          try {
            audio.loop = true;
            audio.volume = MAIN_BGM_VOLUME;
            audio.clip = clip;
            audio.play();
            this._started = true;
            console.log(
              '[BgmController] playing',
              BGM_PATH,
              'state=',
              audio.state,
              'playing=',
              audio.playing,
            );
          } catch (e) {
            console.error('[BgmController] play error', e);
          }
          resolve();
        }, 0);
      });
    });
  }
}
