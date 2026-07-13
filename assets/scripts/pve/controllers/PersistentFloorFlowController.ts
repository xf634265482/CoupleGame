import { _decorator, Component } from 'cc';
import { loadActiveFloorChallenge, loadPveProfile, saveFloorChallengeRuntime, settleFloorChallenge, startFloorChallenge } from '../../network/PveProgressionService';
import { PersistentFloorFlow } from '../core/PersistentFloorFlow';
const{ccclass}=_decorator;
@ccclass('PersistentFloorFlowController')
export class PersistentFloorFlowController extends Component{
 readonly flow=new PersistentFloorFlow({loadProfile:loadPveProfile,loadActive:loadActiveFloorChallenge,start:startFloorChallenge,save:saveFloorChallengeRuntime,settle:settleFloorChallenge});
 private _busy=false;
 async bootstrap():Promise<void>{if(this._busy)return;this._busy=true;try{await this.flow.bootstrap();}finally{this._busy=false;}}
 async save():Promise<void>{if(this._busy)return;this._busy=true;try{await this.flow.save();}finally{this._busy=false;}}
}
