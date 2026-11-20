import type { WorkspaceBookingLinkDto } from "@/ee/calendar/booking.schema";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { groupBookingLinks } from "./booking-panel-model";

export type BookingPanelActions = {
  setEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refresh: () => void;
};

export class BookingPanelStore {
  links: WorkspaceBookingLinkDto[];
  pending = new Set<string>();

  constructor(
    links: readonly WorkspaceBookingLinkDto[],
    private readonly actions: BookingPanelActions,
  ) {
    this.links = [...links];
    makeObservable(this, {
      links: observable.ref,
      pending: observable,
      groups: computed,
      sync: action,
    });
  }

  get groups() {
    return groupBookingLinks(this.links);
  }

  sync = (links: readonly WorkspaceBookingLinkDto[]) => {
    this.links = [...links];
  };

  private patch = (id: string, change: Partial<WorkspaceBookingLinkDto>) => {
    this.links = this.links.map((link) => (link.id === id ? { ...link, ...change } : link));
  };

  toggle = async (id: string, enabled: boolean) => {
    const link = this.links.find((item) => item.id === id);
    if (!link || !link.own || this.pending.has(id)) return false;

    const previous = link.enabled;
    runInAction(() => {
      this.pending.add(id);
      this.patch(id, { enabled });
    });
    let saved = false;
    try {
      saved = await this.actions.setEnabled(id, enabled);
    } finally {
      runInAction(() => {
        if (!saved) this.patch(id, { enabled: previous });
        this.pending.delete(id);
      });
    }
    if (saved) this.actions.refresh();
    return saved;
  };

  remove = async (id: string) => {
    const link = this.links.find((item) => item.id === id);
    if (!link || !link.own) return false;

    const removed = await this.actions.remove(id);
    if (removed) {
      runInAction(() => {
        this.links = this.links.filter((item) => item.id !== id);
      });
      this.actions.refresh();
    }
    return removed;
  };
}
