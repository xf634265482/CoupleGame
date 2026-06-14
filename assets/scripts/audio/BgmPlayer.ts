import { assetManager, AssetManager, AudioClip, AudioSource, director, Node } from 'cc';

const BGM_PATH = 'audio/bgm_main';
const PERSIST_NODE = 'GlobalBgm';

let started = false;

/**
 * 全局循环 BGM（挂持久节点，跨场景不断）
 * 资源：resources/audio/bgm_main（MeowArt 生成）
 */
export function startMainBgm(bundle: AssetManager.Bundle | null): void {
  if (started) {
    return;
  }
  if (!bundle) {
    assetManager.loadBundle('resources', (err, loaded) => {
      if (!err && loaded) {
        startMainBgm(loaded);
      } else {
        console.warn('[BgmPlayer] resources bundle unavailable', err);
      }
    });
    return;
  }
  bundle.load(BGM_PATH, AudioClip, (err, clip) => {
    if (err || !clip) {
      console.warn('[BgmPlayer] load failed', BGM_PATH, err);
      return;
    }
    const root = director.getScene();
    if (!root) {
      return;
    }
    let node = root.getChildByName(PERSIST_NODE);
    if (!node) {
      node = new Node(PERSIST_NODE);
      director.addPersistRootNode(node);
    }
    let audio = node.getComponent(AudioSource);
    if (!audio) {
      audio = node.addComponent(AudioSource);
    }
    audio.clip = clip;
    audio.loop = true;
    audio.volume = 0.55;
    audio.playOnAwake = false;
    if (!audio.playing) {
      audio.play();
    }
    started = true;
    console.log('[BgmPlayer] playing', BGM_PATH);
  });
}

export function stopMainBgm(): void {
  const scene = director.getScene();
  const node = scene?.getChildByName(PERSIST_NODE);
  const audio = node?.getComponent(AudioSource);
  if (audio?.playing) {
    audio.stop();
  }
  started = false;
}
