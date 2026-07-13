import { _decorator, Component, Node } from 'cc';
import { loadPveProfile, updateCampConfiguration } from '../../network/PveProgressionService';
import { CampView } from '../views/CampView';
import { getFixedEquipmentDefinition } from '../core/equipment/EquipmentDefinition';
import type { PveProfile, UpdateCampConfigurationRequest } from '../core/PveProgressionTypes';
const {ccclass}= _decorator;
@ccclass('CampController')
export class CampController extends Component{
 private _view:CampView|null=null;private _profile:PveProfile|null=null;private _busy=false;
 open(parent:Node,onClose?:()=>void):void{if(this._view?.node.isValid)return;this._view=new CampView(parent,{onClose:()=>{this.close();onClose?.();},onRefresh:()=>void this.refresh(),onSelectProfession:(id)=>void this._selectProfession(id),onAutoEquipMinghen:()=>void this._autoEquipMinghen(),onClearMinghen:()=>void this._saveConfig({minghenLoadout:[]}),onAutoEquipItems:()=>void this._autoEquipItems(),onClearEquipment:()=>void this._saveConfig({equipmentLoadout:{}})});this._view.showLoading();void this.refresh();}
 async refresh():Promise<void>{if(this._busy||!this._view)return;this._busy=true;try{const{profile}=await loadPveProfile();this._profile=profile;if(this._view?.node.isValid)this._view.setProfile(profile);}catch(err:unknown){if(this._view?.node.isValid)this._view.showError(err instanceof Error?err.message:String(err));}finally{this._busy=false;}}
 close():void{this._view?.destroy();this._view=null;}
 private async _selectProfession(selectedProfessionId:'WARRIOR'|'ARCHER'|'RANGER'):Promise<void>{await this._saveConfig({selectedProfessionId});}
 private async _saveConfig(request:UpdateCampConfigurationRequest):Promise<void>{if(this._busy||!this._view)return;this._busy=true;try{const{profile}=await updateCampConfiguration(request);this._profile=profile;if(this._view?.node.isValid)this._view.setProfile(profile);}catch(err:unknown){if(this._view?.node.isValid)this._view.showError(err instanceof Error?err.message:String(err));}finally{this._busy=false;}}
 private async _autoEquipMinghen():Promise<void>{if(!this._profile)return;const minghenLoadout=Object.values(this._profile.minghenCollection).slice(0,8).map(entry=>({id:entry.id,level:entry.level}));await this._saveConfig({minghenLoadout});}
 private async _autoEquipItems():Promise<void>{if(!this._profile)return;const equipmentLoadout:NonNullable<UpdateCampConfigurationRequest['equipmentLoadout']>={};for(const item of this._profile.equipmentInventory){const slot=getFixedEquipmentDefinition(item.definitionId).slot;if(!equipmentLoadout[slot])equipmentLoadout[slot]=item.instanceId;}await this._saveConfig({equipmentLoadout});}
 protected onDestroy():void{this.close();}
}
