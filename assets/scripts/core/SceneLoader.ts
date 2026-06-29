import { director } from 'cc';
import { SCENE } from './Constants';

export class SceneLoader {
  static loadBootstrap(): void {
    director.loadScene(SCENE.BOOTSTRAP);
  }

  static loadLobby(): void {
    director.loadScene(SCENE.LOBBY);
  }

  static loadPveExpedition(): void {
    director.loadScene(SCENE.PVE_EXPEDITION);
  }

  static loadDestinyTree(): void {
    director.loadScene(SCENE.DESTINY_TREE);
  }
}
