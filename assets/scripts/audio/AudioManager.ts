import { AudioClip, AudioSource, director, Node, sys } from 'cc';
import { ensureResourcesBundle } from '../ui/UiAssets';

export const SFX_IDS = {
  UI_CLICK: 'sfx_ui_click',
  PLAYER_MOVE: 'sfx_player_move',
  ATTACK_HIT: 'sfx_attack_hit',
  DAMAGE_POP: 'sfx_damage_pop',
  REWARD_GET: 'sfx_reward_get',
  DOOR_OPEN: 'sfx_door_open',
  BOSS_APPEAR: 'sfx_boss_appear',
  RUN_FAILED: 'sfx_run_failed',
} as const;

export type SfxId = (typeof SFX_IDS)[keyof typeof SFX_IDS];

// v1 最小集只生产 6 个独立音频文件；语义上保留 8 个 ID，文件层做复用：
// - sfx_damage_pop（怪物攻击命中玩家）复用 sfx_attack_hit（角色攻击）
// - sfx_door_open（楼层/传送门交互）复用 sfx_reward_get（宝箱开启），并扩展到所有非战斗交互
const SFX_PATH: Record<SfxId, string> = {
  sfx_ui_click: 'audio/sfx/ui/sfx_ui_click',
  sfx_player_move: 'audio/sfx/explore/sfx_player_move',
  sfx_attack_hit: 'audio/sfx/battle/sfx_attack_hit',
  sfx_damage_pop: 'audio/sfx/battle/sfx_attack_hit',
  sfx_reward_get: 'audio/sfx/explore/sfx_reward_get',
  sfx_door_open: 'audio/sfx/explore/sfx_reward_get',
  sfx_boss_appear: 'audio/sfx/battle/sfx_boss_appear',
  sfx_run_failed: 'audio/sfx/ui/sfx_run_failed',
};

const PERSIST_NODE = 'GlobalSfx';
const POOL_SIZE = 4;
const DEFAULT_THROTTLE_MS = 50;
const STORAGE_KEY = 'couple.sfx';
const DEFAULT_VOLUME = 0.7;

const SFX_THROTTLE_MS: Partial<Record<SfxId, number>> = {
  sfx_ui_click: 80,
  sfx_player_move: 120,
  sfx_attack_hit: 60,
  sfx_damage_pop: 80,
  sfx_reward_get: 140,
  sfx_door_open: 160,
};

const SFX_INTERRUPTIBLE: Partial<Record<SfxId, boolean>> = {
  sfx_ui_click: true,
  sfx_player_move: true,
  sfx_attack_hit: true,
  sfx_damage_pop: true,
  sfx_reward_get: true,
  sfx_door_open: true,
  sfx_boss_appear: false,
  sfx_run_failed: false,
};

type Settings = { muted: boolean; volume: number };

function loadSettings(): Settings {
  try {
    const raw = sys.localStorage?.getItem?.(STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      const volume = typeof obj.volume === 'number' ? Math.max(0, Math.min(1, obj.volume)) : DEFAULT_VOLUME;
      const muted = !!obj.muted;
      return { muted, volume };
    }
  } catch {}
  return { muted: false, volume: DEFAULT_VOLUME };
}

function saveSettings(s: Settings): void {
  try {
    sys.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

class Manager {
  private _settings: Settings = loadSettings();
  private _clips = new Map<SfxId, AudioClip | null>();
  private _loading = new Set<SfxId>();
  private _lastPlayedAt = new Map<SfxId, number>();
  private _pool: AudioSource[] = [];
  private _poolCursor = 0;
  private _warned = new Set<SfxId>();

  private _pickSource(pool: AudioSource[], id: SfxId): AudioSource | null {
    for (let i = 0; i < pool.length; i++) {
      const index = (this._poolCursor + i) % pool.length;
      const src = pool[index];
      if (!src.playing) {
        this._poolCursor = (index + 1) % pool.length;
        return src;
      }
    }
    if (SFX_INTERRUPTIBLE[id] === false) {
      const src = pool[this._poolCursor % pool.length];
      this._poolCursor = (this._poolCursor + 1) % pool.length;
      return src;
    }
    return null;
  }

  private _ensurePool(): AudioSource[] {
    if (this._pool.length === POOL_SIZE) return this._pool;
    const scene = director.getScene();
    if (!scene) return this._pool;
    let node = scene.getChildByName(PERSIST_NODE);
    if (!node) {
      node = new Node(PERSIST_NODE);
      director.addPersistRootNode(node);
    }
    while (this._pool.length < POOL_SIZE) {
      const src = node.addComponent(AudioSource);
      src.playOnAwake = false;
      src.loop = false;
      this._pool.push(src);
    }
    return this._pool;
  }

  private _loadClip(id: SfxId): void {
    if (this._clips.has(id) || this._loading.has(id)) return;
    this._loading.add(id);
    const path = SFX_PATH[id];
    void ensureResourcesBundle().then((bundle) => {
      if (!bundle) {
        this._loading.delete(id);
        this._clips.set(id, null);
        return;
      }
      bundle.load(path, AudioClip, (err, clip) => {
        this._loading.delete(id);
        if (err || !clip) {
          this._clips.set(id, null);
          if (!this._warned.has(id)) {
            this._warned.add(id);
            console.warn('[AudioManager] missing sfx', id, path, err);
          }
          return;
        }
        this._clips.set(id, clip);
      });
    });
  }

  playSfx(id: SfxId): void {
    if (this._settings.muted) return;
    const now = Date.now();
    const last = this._lastPlayedAt.get(id) ?? 0;
    const throttleMs = SFX_THROTTLE_MS[id] ?? DEFAULT_THROTTLE_MS;
    if (now - last < throttleMs) return;
    this._lastPlayedAt.set(id, now);

    const clip = this._clips.get(id);
    if (clip === undefined) {
      this._loadClip(id);
      return;
    }
    if (!clip) return;

    const pool = this._ensurePool();
    if (pool.length === 0) return;
    const src = this._pickSource(pool, id);
    if (!src) return;
    if (src.playing) src.stop();
    src.clip = clip;
    src.volume = this._settings.volume;
    src.play();
  }

  preload(ids?: readonly SfxId[]): void {
    const list = ids ?? (Object.values(SFX_IDS) as SfxId[]);
    for (const id of list) this._loadClip(id);
  }

  setSfxMuted(muted: boolean): void {
    this._settings.muted = !!muted;
    saveSettings(this._settings);
  }

  setSfxVolume(v: number): void {
    this._settings.volume = Math.max(0, Math.min(1, v));
    saveSettings(this._settings);
  }

  isSfxMuted(): boolean {
    return this._settings.muted;
  }

  getSfxVolume(): number {
    return this._settings.volume;
  }
}

export const AudioManager = new Manager();

export function playSfx(id: SfxId): void {
  AudioManager.playSfx(id);
}
