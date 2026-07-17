import { _decorator, Component, Node } from 'cc';
import { loadPveProfile, manageCamp, startMinghenTracking, updateCampConfiguration } from '../../network/PveProgressionService';
import { CampView } from '../views/CampView';
import { getFixedEquipmentDefinition } from '../core/equipment/EquipmentDefinition';
import { getMinghenDefinition } from '../core/minghen/MinghenCatalog';
import { ensureEquipmentAssetsForFloor } from '../EquipmentResourceLoader';
import type { PveProfile, UpdateCampConfigurationRequest } from '../core/PveProgressionTypes';
const { ccclass } = _decorator;
@ccclass('CampController')
export class CampController extends Component {
  private _view: CampView | null = null;
  private _profile: PveProfile | null = null;
  private _busy = false;

  open(parent: Node, onClose?: () => void, initialProfile?: PveProfile | null): void {
    if (this._view?.node.isValid) {
      void this.refresh(true);
      return;
    }
    this._view = new CampView(parent, {
      onClose: () => { this.close(); onClose?.(); },
      onSelectProfession: (id) => void this._selectProfession(id),
      onToggleMinghen: (id) => void this._toggleMinghen(id),
      onTrackMinghen: (id) => void this._trackMinghen(id),
      onSavePreset: () => void this._savePreset(),
      onToggleEquipment: (id) => void this._toggleEquipment(id),
      onManageEquipment: (action, id) => void this._manageEquipment(action, id),
      onSectionChanged: (section) => {
        if (section === 'EQUIPMENT' && this._profile) {
          void ensureEquipmentAssetsForFloor(this._profile.highestUnlockedFloor);
        }
      },
    });
    if (initialProfile) {
      this._profile = initialProfile;
      void ensureEquipmentAssetsForFloor(initialProfile.highestUnlockedFloor);
      this._view.setProfile(initialProfile);
      void this.refresh(false);
      return;
    }
    this._view.showLoading();
    void this.refresh(true);
  }

  async refresh(force = false): Promise<void> {
    if ((this._busy && !force) || !this._view) return;
    this._busy = true;
    try {
      const { profile } = await loadPveProfile();
      this._profile = profile;
      void ensureEquipmentAssetsForFloor(profile.highestUnlockedFloor);
      if (this._view?.node.isValid) this._view.setProfile(profile);
    } catch (err: unknown) {
      if (this._view?.node.isValid) this._view.showError(err instanceof Error ? err.message : String(err));
    } finally {
      this._busy = false;
    }
  }

  close(): void {
    this._view?.destroy();
    this._view = null;
  }

  private async _selectProfession(selectedProfessionId: 'WARRIOR' | 'ARCHER' | 'RANGER'): Promise<void> {
    await this._saveConfig({ selectedProfessionId });
  }

  private async _saveConfig(request: UpdateCampConfigurationRequest): Promise<void> {
    if (this._busy || !this._view) return;
    this._busy = true;
    try {
      const { profile } = await updateCampConfiguration(request);
      this._profile = profile;
      if (this._view?.node.isValid) this._view.setProfile(profile);
    } catch (err: unknown) {
      if (this._view?.node.isValid) {
        this._view.showNotice(err instanceof Error ? err.message : String(err));
      }
    } finally {
      this._busy = false;
    }
  }

  private async _toggleMinghen(id: string): Promise<void> {
    if (!this._profile) return;
    const old = this._profile.minghenLoadout;
    const existing = old.find((x) => x.id === id);
    if (existing) {
      await this._saveConfig({ minghenLoadout: old.filter((x) => x.id !== id) });
      return;
    }
    if (old.length >= 8) {
      this._view?.showNotice('命痕槽已满，请先卸下一枚');
      return;
    }
    const owned = this._profile.minghenCollection[id];
    if (owned) await this._saveConfig({ minghenLoadout: [...old, { id, level: owned.level }] });
  }

  private async _trackMinghen(id: string): Promise<void> {
    if (this._busy || !this._view) return;
    this._busy = true;
    try {
      const floor = getMinghenDefinition(id).sourceFloor;
      const { profile } = await startMinghenTracking({ floor, minghenId: id });
      this._profile = profile;
      if (this._view.node.isValid) this._view.setProfile(profile);
    } catch (err: unknown) {
      if (this._view?.node.isValid) {
        this._view.showNotice(err instanceof Error ? err.message : String(err));
      }
    } finally {
      this._busy = false;
    }
  }

  private async _savePreset(): Promise<void> {
    if (!this._profile) return;
    await this._manageCampRequest({
      type: 'SAVE_MINGHEN_PRESET',
      name: `方案${this._profile.minghenPresets.length + 1}`,
    });
  }

  private async _toggleEquipment(instanceId: string): Promise<void> {
    if (!this._profile) return;
    const item = this._profile.equipmentInventory.find((x) => x.instanceId === instanceId);
    if (!item) return;
    const slot = getFixedEquipmentDefinition(item.definitionId).slot;
    const equipmentLoadout = { ...this._profile.equipmentLoadout };
    if (equipmentLoadout[slot] === instanceId) delete equipmentLoadout[slot];
    else equipmentLoadout[slot] = instanceId;
    await this._saveConfig({ equipmentLoadout });
  }

  private async _manageEquipment(action: 'TOGGLE_LOCK' | 'ENHANCE' | 'SELL', instanceId: string): Promise<void> {
    if (this._busy || !this._view || !this._profile) return;
    const before = this._profile.equipmentInventory.find((x) => x.instanceId === instanceId);
    if (!before) {
      this._view.showResultPopup('操作失败', '未找到该装备');
      return;
    }
    const beforeGold = this._profile.gold;
    const beforeLevel = before.enhanceLevel;
    this._busy = true;
    try {
      const { profile } = await manageCamp({ type: 'EQUIPMENT', action, instanceId });
      this._profile = profile;
      if (!this._view.node.isValid) return;
      this._view.setProfile(profile);
      if (action === 'ENHANCE') {
        const after = profile.equipmentInventory.find((x) => x.instanceId === instanceId) ?? before;
        const name = getFixedEquipmentDefinition(before.definitionId).name;
        const cost = Math.max(0, beforeGold - profile.gold);
        this._view.showResultPopup(
          '强化成功',
          `${name}\n强化等级 +${beforeLevel} → +${after.enhanceLevel}\n消耗星尘 ${cost}\n剩余星尘 ${profile.gold}`,
        );
        return;
      }
      if (action === 'SELL') {
        const name = getFixedEquipmentDefinition(before.definitionId).name;
        const gained = Math.max(0, profile.gold - beforeGold);
        this._view.showResultPopup('出售成功', `${name}\n获得星尘 ${gained}\n剩余星尘 ${profile.gold}`);
        return;
      }
      if (action === 'TOGGLE_LOCK') {
        const after = profile.equipmentInventory.find((x) => x.instanceId === instanceId);
        const name = getFixedEquipmentDefinition(before.definitionId).name;
        this._view.showResultPopup(
          after?.locked ? '已锁定' : '已解锁',
          `${name}\n${after?.locked ? '锁定后不可出售' : '现在可以出售'}`,
        );
      }
    } catch (err: unknown) {
      if (this._view?.node.isValid) {
        this._view.showResultPopup(
          action === 'ENHANCE' ? '强化失败' : '操作失败',
          err instanceof Error ? err.message : String(err),
        );
      }
    } finally {
      this._busy = false;
    }
  }

  private async _manageCampRequest(request: Parameters<typeof manageCamp>[0]): Promise<void> {
    if (this._busy || !this._view) return;
    this._busy = true;
    try {
      const { profile } = await manageCamp(request);
      this._profile = profile;
      if (this._view.node.isValid) this._view.setProfile(profile);
    } catch (err: unknown) {
      if (this._view?.node.isValid) {
        this._view.showNotice(err instanceof Error ? err.message : String(err));
      }
    } finally {
      this._busy = false;
    }
  }

  protected onDestroy(): void {
    this.close();
  }
}
