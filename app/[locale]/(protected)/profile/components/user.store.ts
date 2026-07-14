import type { UserProfileData } from "@/features/user/upsert/update-user-details.interactor";
import type { ExtendedUser } from "@/features/user/user.types";
import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";
import type { Theme } from "@/generated/prisma";

import { makeObservable } from "mobx";
import { action, observable } from "mobx";
import { Action, CountryCode, Resource } from "@/generated/prisma";

import { updateThemeAction } from "@/app/[locale]/(protected)/dashboard/actions";
import { resendVerificationEmailFromAppAction } from "../actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class UserStore extends BaseStore {
  public user: ExtendedUser | null = null;
  public permissions: Map<string, boolean> = new Map();

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      user: observable,
      permissions: observable,
      setUser: action,
      can: action,
      canManage: action,
      canAccess: action,
      updateTheme: action,
    });
  }

  resendVerificationEmail = async (): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await resendVerificationEmailFromAppAction();
      if (result.ok) this.toastSuccess("EmailVerification.resendSuccess");
    });
  };

  updateTheme = async (theme: Theme): Promise<void> => {
    if (!this.user) return;

    const res = await updateThemeAction({ theme });
    if (!res.ok) {
      toastZodErrorTree(res.error);
      return;
    }

    this.applyUserUpdate(res.data);
  };

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
      this.rootStore.profileSettingsStore.onInitOrRefresh({
        firstName: user.firstName,
        lastName: user.lastName,
        country: user.country ?? CountryCode.de,
        avatarUrl: user.avatarUrl,
        theme: user.theme,
        displayLanguage: user.displayLanguage,
        formattingLocale: user.formattingLocale,
      });
    }
  };

  applyUserUpdate = (profile: UserProfileData) => {
    if (this.user) this.setUser({ ...this.user, ...profile });
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
