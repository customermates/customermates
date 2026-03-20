import type { UpdateUserDetailsData } from "@/features/user/upsert/update-user-details.interactor";
import type { UpdateUserSettingsData } from "@/features/user/upsert/update-user-settings.interactor";
import type { ExtendedUser } from "@/features/user/user.service";
import type { RootStore } from "@/core/stores/root.store";

import { makeObservable } from "mobx";
import { action, observable } from "mobx";
import { Action, CountryCode, Resource } from "@/generated/prisma";

export class UserStore {
  public user: ExtendedUser | null = null;
  public permissions: Map<string, boolean> = new Map();

  constructor(public readonly rootStore: RootStore) {
    makeObservable(this, {
      user: observable,
      permissions: observable,
      setUser: action,
      can: action,
      canManage: action,
      canAccess: action,
    });
  }

  can = (resource: Resource, action: Action): boolean => {
    void this.user;
    const key = `${resource}:${action}`;

    return this.permissions.get(key) ?? false;
  };

  canManage = (resource: Resource): boolean => {
    void this.user;
    return this.can(resource, Action.create) && this.can(resource, Action.update) && this.can(resource, Action.delete);
  };

  canAccess = (resource: Resource): boolean => {
    void this.user;
    return this.can(resource, Action.readOwn) || this.can(resource, Action.readAll);
  };

  setUser = (user: ExtendedUser | null) => {
    this.user = user;

    if (user) this.permissions = this.createPermissionsMap(user);
    else this.permissions.clear();

    if (user) {
      this.rootStore.userDetailsCardStore.onInitOrRefresh({
        firstName: user.firstName,
        lastName: user.lastName,
        country: user.country ?? CountryCode.de,
        avatarUrl: user.avatarUrl,
      });
      this.rootStore.userSettingsCardStore.onInitOrRefresh({
        marketingEmails: user.marketingEmails,
        displayLanguage: user.displayLanguage,
        formattingLocale: user.formattingLocale,
        theme: user.theme,
      });
    }
  };

  updateUserDetails = (details: UpdateUserDetailsData) => {
    if (this.user) this.setUser({ ...this.user, ...details });
  };

  updateUserSettings = (settings: UpdateUserSettingsData) => {
    if (this.user) this.setUser({ ...this.user, ...settings });
  };

  private createPermissionsMap(user: ExtendedUser): Map<string, boolean> {
    const permissionsMap = new Map<string, boolean>();

    const allResources = Object.values(Resource);
    const allActions = Object.values(Action);

    for (const resource of allResources) {
      for (const action of allActions) {
        const key = `${resource as string}:${action as string}`;
        const hasPermission = this.hasPermission(user, resource, action);

        permissionsMap.set(key, hasPermission);
      }
    }

    return permissionsMap;
  }

  private hasPermission(user: ExtendedUser, resource: Resource, action: Action): boolean {
    if (!user.role) return false;

    if (user.role?.isSystemRole) return true;

    const { permissions } = user.role;

    return permissions.some((p) => p.resource === resource && p.action === action);
  }
}
