import type { UserProfileData } from "@/features/user/upsert/update-user-details.interactor";
import type { TenantUser } from "@/features/user/user.schema";
import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";
import type { Locale, Theme } from "@/generated/prisma";

import { makeObservable } from "mobx";
import { action, observable } from "mobx";
import { Action, CountryCode, Resource } from "@/generated/prisma";

import { updatePreferencesAction } from "@/app/[locale]/(protected)/dashboard/actions";
import { resendVerificationEmailFromAppAction } from "../actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { normalizeStoredDisplayLanguage, normalizeStoredFormattingLocale } from "@/i18n/user-locale";
import { appLocaleCookie, displayLanguageNavigationTarget, expiredAppLocaleCookie } from "@/i18n/locale-preference";

export class UserStore extends BaseStore {
  public user: TenantUser | null = null;
  public permissions: Map<string, boolean> = new Map();

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      user: observable,
      permissions: observable,
      setUser: action,
      can: action,
      canAccess: action,
      updateTheme: action,
      updateDisplayLanguage: action,
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

    const res = await updatePreferencesAction({ theme });
    if (!res.ok) {
      toastZodErrorTree(res.error);
      return;
    }

    this.applyUserUpdate(res.data);
  };

  updateDisplayLanguage = async (displayLanguage: Locale, pathname: string): Promise<void> => {
    if (!this.user) return;

    const res = await updatePreferencesAction({ displayLanguage });
    if (!res.ok) {
      toastZodErrorTree(res.error);
      return;
    }

    this.applyUserUpdate(res.data);
    this.applyDisplayLanguage(displayLanguage, pathname);
  };

  applyDisplayLanguage = (displayLanguage: Locale, pathname: string) => {
    if (displayLanguage === "system") document.cookie = expiredAppLocaleCookie();
    else document.cookie = appLocaleCookie(displayLanguage);
    const target = displayLanguageNavigationTarget(displayLanguage, pathname);
    this.rootStore.navigationGuard.tryNavigate(() => {
      window.location.href = target;
    });
  };

  can = (resource: Resource, action: Action): boolean => {
    void this.user;
    const key = `${resource}:${action}`;

    return this.permissions.get(key) ?? false;
  };

  canAccess = (resource: Resource): boolean => {
    void this.user;
    return this.can(resource, Action.readOwn) || this.can(resource, Action.readAll);
  };

  setUser = (user: TenantUser | null) => {
    const normalizedUser = user
      ? {
          ...user,
          displayLanguage: normalizeStoredDisplayLanguage(user.displayLanguage),
          formattingLocale: normalizeStoredFormattingLocale(user.formattingLocale),
        }
      : null;

    this.user = normalizedUser;

    if (normalizedUser) this.permissions = this.createPermissionsMap(normalizedUser);
    else this.permissions.clear();

    if (normalizedUser) {
      this.rootStore.profileSettingsStore.onInitOrRefresh({
        firstName: normalizedUser.firstName,
        lastName: normalizedUser.lastName,
        country: normalizedUser.country ?? CountryCode.de,
        avatarUrl: normalizedUser.avatarUrl,
        theme: normalizedUser.theme,
        displayLanguage: normalizedUser.displayLanguage,
        formattingLocale: normalizedUser.formattingLocale,
      });
    }
  };

  applyUserUpdate = (profile: UserProfileData) => {
    if (this.user) this.setUser({ ...this.user, ...profile });
  };

  private createPermissionsMap(user: TenantUser): Map<string, boolean> {
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

  private hasPermission(user: TenantUser, resource: Resource, action: Action): boolean {
    if (!user.role) return false;

    if (user.role?.isSystemRole) return true;

    const { permissions } = user.role;

    return permissions.some((p) => p.resource === resource && p.action === action);
  }
}
