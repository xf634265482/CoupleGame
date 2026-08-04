import { _decorator, Component, Node } from 'cc';
import { loadPveProfile, manageCamp, updateCampConfiguration } from '../../network/PveProgressionService';
import type { PveProfile } from '../core/PveProgressionTypes';
import type { PartnerId } from '../core/partner/PartnerTypes';
import { PartnerView } from '../views/PartnerView';

const { ccclass } = _decorator;

@ccclass('PartnerController')
export class PartnerController extends Component {
  private _view: PartnerView | null = null;
  private _profile: PveProfile | null = null;
  private _busy = false;

  open(parent: Node, onClose?: () => void, initialProfile?: PveProfile | null): void {
    if (this._view?.node.isValid) {
      void this.refresh();
      return;
    }
    this._view = new PartnerView(parent, {
      onClose: () => {
        this.close();
        onClose?.();
      },
      onEquip: (id) => void this._equip(id),
      onEvolve: (id) => void this._evolve(id),
    });
    if (initialProfile) {
      this._profile = initialProfile;
      this._view.setProfile(initialProfile);
      return;
    }
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (this._busy || !this._view) return;
    this._busy = true;
    try {
      const { profile } = await loadPveProfile();
      this._profile = profile;
      if (this._view?.node.isValid) this._view.setProfile(profile);
    } catch (err: unknown) {
      this._view?.showNotice(err instanceof Error ? err.message : String(err));
    } finally {
      this._busy = false;
    }
  }

  close(): void {
    this._view?.destroy();
    this._view = null;
  }

  private async _equip(partnerId: PartnerId): Promise<void> {
    if (this._busy || !this._view) return;
    if (this._profile?.partners[partnerId]?.unlocked !== true) {
      this._view.showNotice('伙伴未解锁');
      return;
    }
    this._busy = true;
    try {
      const { profile } = await updateCampConfiguration({ equippedPartnerId: partnerId });
      this._profile = profile;
      this._view.setProfile(profile);
      this._view.showNotice('已装备伙伴');
    } catch (err: unknown) {
      this._view.showNotice(err instanceof Error ? err.message : String(err));
    } finally {
      this._busy = false;
    }
  }

  private async _evolve(partnerId: PartnerId): Promise<void> {
    if (this._busy || !this._view) return;
    if (this._profile?.partners[partnerId]?.unlocked !== true) {
      this._view.showNotice('伙伴未解锁');
      return;
    }
    this._busy = true;
    try {
      const { profile } = await manageCamp({ type: 'PARTNER', action: 'EVOLVE', partnerId });
      this._profile = profile;
      this._view.setProfile(profile);
      this._view.showNotice('进化成功');
    } catch (err: unknown) {
      this._view.showNotice(err instanceof Error ? err.message : String(err));
    } finally {
      this._busy = false;
    }
  }
}
