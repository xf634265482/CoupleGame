import { Button, Color, Graphics, Label, Node, UITransform } from 'cc';
import { loadUiSprite } from '../../ui/UiAssets';
import { ensureArtCover, ensureArtStretch } from '../../ui/UiSprite';
import type { PveProfile } from '../core/PveProgressionTypes';
import { makeFlatButton, makeLabel } from './pveUiKit';

export type CampSection='MINGHEN'|'EQUIPMENT'|'INTEL'|'PROFESSION';
export interface CampViewCallbacks{onClose():void;onRefresh():void;onSelectProfession(id:keyof typeof PROFESSION_NAMES):void;onAutoEquipMinghen():void;onClearMinghen():void;onAutoEquipItems():void;onClearEquipment():void;onSectionChanged?(section:CampSection):void;}
const SECTION_LABELS:Record<CampSection,string>={MINGHEN:'命痕台',EQUIPMENT:'装备台',INTEL:'远征情报',PROFESSION:'角色区'};
const PROFESSION_NAMES={WARRIOR:'战士',ARCHER:'射手',RANGER:'游侠'} as const;

export class CampView{
 private readonly _overlay:Node;private readonly _content:Label;private readonly _title:Label;private readonly _actionRoot:Node;private _profile:PveProfile|null=null;private _section:CampSection='MINGHEN';
 constructor(parent:Node,private readonly _callbacks:CampViewCallbacks){
  this._overlay=new Node('PersistentCampModal');this._overlay.setParent(parent);this._overlay.addComponent(UITransform).setContentSize(720,1280);
  const shade=this._overlay.addComponent(Graphics);shade.fillColor=new Color(0,8,24,205);shade.rect(-360,-640,720,1280);shade.fill();
  const panel=new Node('CampPanel');panel.setParent(this._overlay);panel.setPosition(0,10);panel.addComponent(UITransform).setContentSize(660,1040);const bg=panel.addComponent(Graphics);bg.fillColor=new Color(7,31,70,190);bg.roundRect(-330,-520,660,1040,22);bg.fill();bg.strokeColor=new Color(255,214,110,220);bg.lineWidth=2;bg.stroke();
  this._title=makeLabel(panel,0,450,560,60,34,new Color(255,220,100),Label.HorizontalAlign.CENTER);this._title.string='营地';this._title.isBold=true;
  const sections=Object.keys(SECTION_LABELS) as CampSection[];sections.forEach((section,index)=>makeFlatButton(panel,SECTION_LABELS[section],-225+index*150,370,138,58,()=>this.showSection(section),new Color(24,72,118,190),{noArt:true,border:new Color(255,214,110,190)}));
  this._content=makeLabel(panel,0,45,570,540,24,new Color(225,238,255),Label.HorizontalAlign.LEFT);this._content.verticalAlign=Label.VerticalAlign.TOP;this._content.overflow=Label.Overflow.SHRINK;
  this._actionRoot=new Node('SectionActions');this._actionRoot.setParent(panel);this._actionRoot.setPosition(0,-330);this._actionRoot.addComponent(UITransform).setContentSize(570,90);
  makeFlatButton(panel,'刷新',-140,-450,220,60,()=>this._callbacks.onRefresh(),new Color(30,100,105,190),{noArt:true,border:new Color(120,225,220)});
  makeFlatButton(panel,'返回大厅',140,-450,220,60,()=>this._callbacks.onClose(),new Color(105,65,45,190),{noArt:true,border:new Color(255,190,120)});
  void Promise.all([loadUiSprite('pve/backgrounds/bg_pve_camp'),loadUiSprite('pve/camp/panel_camp_main_9s')]).then(([background,panelArt])=>{if(!this._overlay.isValid)return;if(background)ensureArtCover(this._overlay,'CampBackground',background,720,1280).node.setSiblingIndex(0);if(panelArt)ensureArtStretch(panel,'CampPanelArt',panelArt,660,1040).node.setSiblingIndex(0);}).catch(()=>null);
 }
 setProfile(profile:PveProfile):void{this._profile=profile;this.showSection(this._section);}
 showLoading():void{this._content.string='正在整理营地档案…';}
 showError(message:string):void{this._content.string=`营地加载失败\n\n${message}`;}
 showSection(section:CampSection):void{this._section=section;this._title.string=`营地 · ${SECTION_LABELS[section]}`;this._callbacks.onSectionChanged?.(section);for(const child of [...this._actionRoot.children])child.destroy();const p=this._profile;if(!p){this.showLoading();return;}this._content.string=this._describe(section,p);const action=(text:string,x:number,callback:()=>void)=>makeFlatButton(this._actionRoot,text,x,0,250,58,callback,new Color(25,75,110,190),{noArt:true,border:new Color(255,214,110,190)});if(section==='MINGHEN'){action('装配收藏前8枚',-135,()=>this._callbacks.onAutoEquipMinghen());action('清空命痕',135,()=>this._callbacks.onClearMinghen());}if(section==='EQUIPMENT'){action('各槽装配首件',-135,()=>this._callbacks.onAutoEquipItems());action('卸下全部',135,()=>this._callbacks.onClearEquipment());}if(section==='PROFESSION'){(Object.keys(PROFESSION_NAMES) as Array<keyof typeof PROFESSION_NAMES>).forEach((id,index)=>{const mastery=p.professions[id];const button=makeFlatButton(this._actionRoot,mastery.unlocked?`切换${PROFESSION_NAMES[id]}`:`${PROFESSION_NAMES[id]}未解锁`,-190+index*190,0,172,58,()=>{if(mastery.unlocked)this._callbacks.onSelectProfession(id);},id===p.selectedProfessionId?new Color(110,90,35,210):new Color(25,75,110,190),{noArt:true,border:new Color(255,214,110,190)});const component=button.getComponent(Button);if(component)component.interactable=mastery.unlocked;});}}
 destroy():void{this._overlay.destroy();}
 get node():Node{return this._overlay;}
 private _describe(section:CampSection,p:PveProfile):string{
  if(section==='MINGHEN'){const owned=Object.values(p.minghenCollection);const equipped=p.minghenLoadout.map(x=>`${x.id} · ${['','I','II','III'][x.level]}`).join('\n')||'尚未装配';return`已收集 ${owned.length}/24　装配 ${p.minghenLoadout.length}/8\n命尘 ${p.minghenDust}\n\n当前方案\n${equipped}\n\n追踪目标\n${p.tracking?`${p.tracking.minghenId} · 第${p.tracking.floor}层 · ${p.tracking.state}`:'未选择追踪命痕'}\n\n命痕可自由搭配职业；同名副本用于升级，不可重复占槽。`;}
  if(section==='EQUIPMENT'){const equipped=Object.entries(p.equipmentLoadout).map(([slot,id])=>`${slot}：${id}`).join('\n')||'尚未穿戴';return`永久背包 ${p.equipmentInventory.length}/60　金币 ${p.gold}\n\n当前装备\n${equipped}\n\n固定装备没有随机词条；品质与强化只改变白名单数值。\n锁定装备不可出售，进入楼层后配置冻结。`;}
  if(section==='INTEL'){const floor=p.highestUnlockedFloor;return`下一目标：第 ${floor} 层\n最高通关：第 ${p.highestClearedFloor} 层\n\n${this._floorIntel(floor)}\n\n通关后可继续远征，或返回大厅重新调整命痕、装备和职业。`;}
  const lines=(Object.keys(PROFESSION_NAMES) as Array<keyof typeof PROFESSION_NAMES>).map(id=>{const m=p.professions[id];return`${id===p.selectedProfessionId?'▶':'　'}${PROFESSION_NAMES[id]}　${m.unlocked?`Lv.${m.level}　${m.xp} XP`:'未解锁'}\n　技法：${m.unlockedTechniqueIds.join('、')||'基础职业规则'}`;});return`${lines.join('\n\n')}\n\n熟练度只解锁主动技法与展示内容，不增加攻击、生命或护甲。`;
 }
 private _floorIntel(floor:number):string{const text=['','钥匙探索：找到钥匙并开启出口','精英猎杀：击败断旗哨长','波次生存：存活并清空三波敌人','目标追击：阻止传令兵逃离','突围抵达：穿过封锁并支付 1 AP 离开','据点清剿：摧毁三座号角祭坛','Boss 挑战：击败哥布林酋长'];return text[floor]??'后续章节情报尚未开放';}
}
