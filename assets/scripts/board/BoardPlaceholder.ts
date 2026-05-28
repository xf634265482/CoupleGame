import { _decorator } from 'cc';
import { BoardController } from '../game/board/BoardController';

const { ccclass } = _decorator;

/** 场景挂载名 BoardPlaceholder，逻辑见 BoardController */
@ccclass('BoardPlaceholder')
export class BoardPlaceholder extends BoardController {}
