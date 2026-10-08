import type { RootStore } from "@/core/stores/root.store";
import type { KeyboardPreferences } from "@/features/p13n/keyboard-preferences.schema";
import type { ShortcutDestination } from "@/components/keyboard/shortcut-registry";

import { action, makeObservable, observable, runInAction } from "mobx";

import { upsertP13nAction } from "@/app/actions";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { DEFAULT_KEYBOARD_PREFERENCES, KEYBOARD_P13N_ID } from "@/features/p13n/keyboard-preferences.schema";

export type ShortcutDestinations = {
  pages: Partial<Record<ShortcutDestination, string>>;
  lists: string[];
};

export class KeyboardShortcutsStore extends BaseModalStore {
  preferences: KeyboardPreferences = DEFAULT_KEYBOARD_PREFERENCES;
  destinations: ShortcutDestinations = { pages: {}, lists: [] };

  constructor(rootStore: RootStore) {
    super(rootStore, {});
    makeObservable(this, {
      preferences: observable.ref,
      destinations: observable.ref,
      setPreferences: action,
      setDestinations: action,
    });
  }

  get singleKeyShortcutsEnabled() {
    return this.preferences.singleKeyShortcuts;
  }

  setPreferences = (preferences: KeyboardPreferences | null) => {
    this.preferences = preferences ?? DEFAULT_KEYBOARD_PREFERENCES;
  };

  setDestinations = (destinations: ShortcutDestinations) => {
    this.destinations = destinations;
  };

  setSingleKeyShortcuts = async (enabled: boolean) => {
    const previous = this.preferences;
    const next = { ...previous, singleKeyShortcuts: enabled };
    this.setPreferences(next);
    const rollBack = () =>
      runInAction(() => {
        if (this.preferences === next) this.preferences = previous;
      });
    try {
      const result = await upsertP13nAction({ p13nId: KEYBOARD_P13N_ID, settings: next });
      if (result.ok) return;
      toastZodErrorTree(result.error);
      rollBack();
    } catch (error) {
      rollBack();
      throw error;
    }
  };
}
