import { director } from 'cc';
import { SCENE } from './Constants';

export class SceneLoader {
  static loadBootstrap(): void {
    director.loadScene(SCENE.BOOTSTRAP);
  }

  static loadLobby(): void {
    director.loadScene(SCENE.LOBBY);
  }

  static loadBoard(): void {
    director.loadScene(SCENE.BOARD);
  }

  static loadMinigameBluff(): void {
    director.loadScene(SCENE.MINIGAME_BLUFF);
  }

  static loadSettlement(): void {
    director.loadScene(SCENE.SETTLEMENT);
  }
}
