import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertRoleData } from "@/features/role/upsert-role.interactor";
import type { RoleDto } from "@/features/role/get-roles.interactor";

import { action, computed, makeObservable, toJS } from "mobx";
import { Resource, Action } from "@/generated/prisma";

import { deleteRoleAction, upsertRoleAction } from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

function defaultRolePermissions() {
  return {
    contacts: { canManage: "no", readAccess: "own" },
    deals: { canManage: "no", readAccess: "own" },
    organizations: { canManage: "no", readAccess: "own" },
    services: { canManage: "no", readAccess: "own" },
    users: { canManage: "no", readAccess: "own" },
    company: { canManage: "no" },
    api: { canManage: "no", readAccess: "none" },
    tasks: { canManage: "no", readAccess: "own" },
    inboxMessages: { canManage: "no", readAccess: "none" },
    auditLog: { readAccess: "none" },
  } as const;
}

export class RoleModalStore extends BaseModalStore<UpsertRoleData> {
  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        name: "",
        description: "",
        permissions: defaultRolePermissions(),
      },
      Resource.users,
    );

    makeObservable(this, {
      add: action,
      delete: action,
      setRole: action,
      onSubmit: action,
      isSystemRole: computed,
      isOwnRole: computed,
      isDisabledOrSystemRole: computed,
      hasUsersAssigned: computed,
      canDeleteRole: computed,
    });
  }

  get isOwnRole() {
    const signedInRoleId = this.rootStore.userStore.user?.roleId;

    return Boolean(this.form.id) && this.form.id === signedInRoleId;
  }

  get isReadOnly(): boolean {
    return this.isSystemRole || this.isOwnRole || super.isReadOnly;
  }

  get isSystemRole() {
    if (!this.form.id) return false;

    const role = this.rootStore.rolesStore.items.find((r) => r.id === this.form.id);

    return Boolean(role?.isSystemRole);
  }

  get isDisabledOrSystemRole() {
    return this.isDisabled;
  }

  get hasUsersAssigned() {
    if (!this.form.id) return false;

    const role = this.rootStore.rolesStore.items.find((item) => item.id === this.form.id);

    return Boolean(role?.hasUsersAssigned);
  }

  get canDeleteRole() {
    return Boolean(this.form.id && !this.isDisabledOrSystemRole && !this.hasUsersAssigned);
  }

  add = () => {
    this.openWith({
      id: undefined,
      name: "",
      description: "",
      permissions: defaultRolePermissions(),
    });
  };

  delete = async (): Promise<boolean> => {
    if (!this.form.id) return false;

    this.setIsLoading(true);

    try {
      const res = await deleteRoleAction({ id: this.form.id });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.rootStore.rolesStore.removeItem(this.form.id);
      this.close();
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  setRole = (role: RoleDto) => {
    this.setError(undefined);

    const permissions: UpsertRoleData["permissions"] = {
      contacts: { canManage: "no", readAccess: "none" },
      deals: { canManage: "no", readAccess: "none" },
      organizations: { canManage: "no", readAccess: "none" },
      services: { canManage: "no", readAccess: "none" },
      users: { canManage: "no", readAccess: "own" },
      company: { canManage: "no" },
      api: { canManage: "no", readAccess: "none" },
      tasks: { canManage: "no", readAccess: "none" },
      inboxMessages: { canManage: "no", readAccess: "none" },
      auditLog: { readAccess: "none" },
    };

    if (role.isSystemRole) {
      Object.keys(permissions).forEach((resourceKey) => {
        const resource = permissions[resourceKey as keyof typeof permissions];
        if ("canManage" in resource) resource.canManage = "yes";
        if ("readAccess" in resource) resource.readAccess = "all";
      });
    } else {
      role.permissions.forEach((permission) => {
        const resourceKey = permission.resource;
        const resource = permissions[resourceKey];

        if (!resource) return;

        if ("canManage" in resource) {
          if (
            permission.action === Action.create ||
            permission.action === Action.update ||
            permission.action === Action.delete
          )
            resource.canManage = "yes";
        }

        if ("readAccess" in resource) {
          if (permission.action === Action.readAll) resource.readAccess = "all";
          else if (permission.action === Action.readOwn && resource.readAccess === "none") resource.readAccess = "own";
        }
      });
    }

    this.onInitOrRefresh({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      permissions,
    });
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isReadOnly) return;

    this.setIsLoading(true);

    try {
      const res = await upsertRoleAction(toJS(this.form));

      if (res.ok) {
        const currentRole = this.rootStore.rolesStore.items.find((role) => role.id === res.data.id);
        await this.rootStore.rolesStore.upsertItem({
          ...res.data,
          hasUsersAssigned: currentRole?.hasUsersAssigned ?? false,
        });
        this.close();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
