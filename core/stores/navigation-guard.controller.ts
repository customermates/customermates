import { makeObservable, observable, computed, action, when, type IReactionDisposer } from "mobx";

import type { BaseFormStore } from "../base/base-form.store";

export class NavigationGuardController {
  pendingNavigation: (() => void) | null = null;
  private stores = observable.map<BaseFormStore, number>([], { deep: false });
  private pendingRouteRefresh: (() => void) | null = null;
  private pendingRouteRefreshDisposer: IReactionDisposer | null = null;
  private bypass = false;

  constructor() {
    makeObservable(this, {
      pendingNavigation: observable.ref,
      isGuarding: computed,
      isRouteRefreshBlocked: computed,
      isPending: computed,
      register: action,
      unregister: action,
      tryNavigate: action,
      confirm: action,
      cancel: action,
      requestRouteRefreshWhenSafe: action,
    });
  }

  register = (store: BaseFormStore): void => {
    this.stores.set(store, (this.stores.get(store) ?? 0) + 1);
  };

  unregister = (store: BaseFormStore): void => {
    const registrations = this.stores.get(store) ?? 0;
    if (registrations <= 1) this.stores.delete(store);
    else this.stores.set(store, registrations - 1);
  };

  get isGuarding(): boolean {
    for (const store of this.stores.keys()) if (store.withUnsavedChangesGuard && store.hasUnsavedChanges) return true;
    return false;
  }

  get isPending(): boolean {
    return this.pendingNavigation !== null;
  }

  get isRouteRefreshBlocked(): boolean {
    for (const store of this.stores.keys())
      if ((store.withUnsavedChangesGuard && store.hasUnsavedChanges) || store.isLoading) return true;

    return false;
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

  requestRouteRefreshWhenSafe = (refresh: () => void): void => {
    this.pendingRouteRefresh = refresh;
    if (!this.isRouteRefreshBlocked) {
      this.flushPendingRouteRefresh();
      return;
    }
    if (this.pendingRouteRefreshDisposer) return;

    this.pendingRouteRefreshDisposer = when(
      () => !this.isRouteRefreshBlocked,
      () => this.flushPendingRouteRefresh(),
    );
  };

  private flushPendingRouteRefresh() {
    const refresh = this.pendingRouteRefresh;
    const dispose = this.pendingRouteRefreshDisposer;
    this.pendingRouteRefresh = null;
    this.pendingRouteRefreshDisposer = null;
    dispose?.();
    refresh?.();
  }
}
