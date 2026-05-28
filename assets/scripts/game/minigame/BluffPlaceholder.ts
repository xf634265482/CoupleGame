import { _decorator } from 'cc';
import { BluffController } from './BluffController';

const { ccclass } = _decorator;

/** 场景挂载名 BluffPlaceholder，逻辑见 BluffController */
@ccclass('BluffPlaceholder')
export class BluffPlaceholder extends BluffController {}
