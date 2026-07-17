import { director } from 'cc';
import { SCENE } from './Constants';

export class SceneLoader {
  private static _preloadedScenes = new Set<string>();
  private static _preloadPromises = new Map<string, Promise<void>>();

  private static _preloadScene(scene: string): Promise<void> {
    if (this._preloadedScenes.has(scene)) return Promise.resolve();
    const cached = this._preloadPromises.get(scene);
    if (cached) return cached;
    const task = new Promise<void>((resolve, reject) => {
      director.preloadScene(scene, (err) => {
        this._preloadPromises.delete(scene);
        if (err) {
          reject(err);
          return;
        }
        this._preloadedScenes.add(scene);
        resolve();
      });
    });
    this._preloadPromises.set(scene, task);
    return task;
  }

  static loadBootstrap(): void {
    director.loadScene(SCENE.BOOTSTRAP);
  }

  static loadLobby(): void {
    director.loadScene(SCENE.LOBBY);
  }

  static loadPveExpedition(): void {
    director.loadScene(SCENE.PVE_EXPEDITION);
  }

  static preloadPveExpedition(): Promise<void> {
    return this._preloadScene(SCENE.PVE_EXPEDITION);
  }
}
