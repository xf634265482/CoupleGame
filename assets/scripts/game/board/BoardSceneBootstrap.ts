import { _decorator, Component, find } from 'cc';
import { BoardController } from './BoardController';

const { ccclass } = _decorator;

/** 挂在 Camera：Canvas 上脚本序列化异常时由运行时挂载 BoardController */
@ccclass('BoardSceneBootstrap')
export class BoardSceneBootstrap extends Component {
  onLoad(): void {
    const canvas = find('Canvas');
    if (!canvas) return;
    if (!canvas.getComponent(BoardController)) {
      canvas.addComponent(BoardController);
    }
  }
}
