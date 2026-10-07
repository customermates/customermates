import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable } from "mobx";

import { BaseModalStore } from "@/core/base/base-modal.store";

export type ViewPickerOption = { id: string; name: string };

export type ViewPickerSurface = {
  options: () => readonly ViewPickerOption[];
  activeViewKey: () => string;
  select: (viewKey: string) => void;
};

export class ViewPickerStore extends BaseModalStore {
  surface: ViewPickerSurface | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, {});
    makeObservable(this, { surface: observable.ref, register: action, unregister: action });
  }

  register = (surface: ViewPickerSurface) => {
    this.surface = surface;
  };

  unregister = (surface: ViewPickerSurface) => {
    if (this.surface !== surface) return;
    this.surface = null;
    if (this.isOpen) this.close();
  };
}
