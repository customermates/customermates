import { makeObservable, observable, computed, action } from "mobx";

import type { BaseFormStore } from "../base/base-form.store";

export class NavigationGuardController {
  pendingNavigation: (() => void) | null = null;
  private stores = new Set<BaseFormStore>();
  private bypass = false;

  constructor() {
    makeObservable(this, {
      pendingNavigation: observable.ref,
      isGuarding: computed,
      isPending: computed,
      tryNavigate: action,
      confirm: action,
      cancel: action,
    });
  }

  register = (store: BaseFormStore): void => {
    this.stores.add(store);
  };

  unregister = (store: BaseFormStore): void => {
    this.stores.delete(store);
  };

  get isGuarding(): boolean {
    for (const store of this.stores) if (store.withUnsavedChangesGuard && store.hasUnsavedChanges) return true;
    return false;
  }

  get isPending(): boolean {
    return this.pendingNavigation !== null;
  }

  tryNavigate = (navigate: () => void): boolean => {
    if (this.bypass || !this.isGuarding) {
      navigate();
      return true;
    }
    this.pendingNavigation = navigate;
    return false;
  };

  confirm = (): void => {
    const navigate = this.pendingNavigation;
    this.pendingNavigation = null;
    if (!navigate) return;

    this.bypass = true;
    try {
      navigate();
    } finally {
      void Promise.resolve().then(() => {
        this.bypass = false;
      });
    }
  };

  cancel = (): void => {
    this.pendingNavigation = null;
  };
}
