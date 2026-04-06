import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertRoleData } from "@/features/role/upsert-role.interactor";
import type { UserRoleDto } from "@/features/role/get-roles.interactor";

import { action, computed, makeObservable, toJS } from "mobx";

import { Resource, Action } from "@/generated/prisma";

import { deleteRoleAction, upsertRoleAction } from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";

export class RoleModalStore extends BaseModalStore<UpsertRoleData> {
  constructor(public readonly rootStore: RootStore) {
    super(
      rootStore,
      {
        name: "",
        description: "",
        permissions: {
          aiAgent: { canManage: "no" },
          contacts: { canManage: "no", readAccess: "own" },
          deals: { canManage: "no", readAccess: "own" },
          organizations: { canManage: "no", readAccess: "own" },
          services: { canManage: "no", readAccess: "own" },
          users: { canManage: "no", readAccess: "own" },
          company: { canManage: "no" },
          api: { canManage: "no", readAccess: "none" },
          tasks: { canManage: "no", readAccess: "own" },
          auditLog: { readAccess: "none" },
        },
      },
      Resource.users,
    );

    makeObservable(this, {
      add: action,
      delete: action,
      setRole: action,
      onSubmit: action,
      initialize: action,
      isSystemRole: computed,
      isDisabledOrSystemRole: computed,
      hasUsersAssigned: computed,
    });
  }

  get isSystemRole() {
    if (!this.form.id) return false;

    const role = this.rootStore.rolesStore.items.find((r) => r.id === this.form.id);

    return Boolean(role?.isSystemRole);
  }

  get isDisabledOrSystemRole() {
    if (this.isDisabled) return true;
    if (!this.form.id) return false;
    const role = this.rootStore.rolesStore.items.find((r) => r.id === this.form.id);

    return Boolean(role?.isSystemRole);
  }

  get hasUsersAssigned() {
    if (!this.form.id) return false;

    const users = this.rootStore.usersStore.items.filter((user) => user.roleId === this.form.id);

    return users.length > 0;
  }

  initialize = () => {
    this.onInitOrRefresh({
      id: undefined,
      name: "",
      description: "",
      permissions: {
        aiAgent: { canManage: "no" },
        contacts: { canManage: "no", readAccess: "own" },
        deals: { canManage: "no", readAccess: "own" },
        organizations: { canManage: "no", readAccess: "own" },
        services: { canManage: "no", readAccess: "own" },
        users: { canManage: "no", readAccess: "own" },
        company: { canManage: "no" },
        api: { canManage: "no", readAccess: "none" },
        tasks: { canManage: "no", readAccess: "own" },
        auditLog: { readAccess: "none" },
      },
    });
  };

  add = () => {
    this.initialize();
    this.open();
  };

  delete = async () => {
    if (!this.form.id) return;

    this.setIsLoading(true);

    try {
      await deleteRoleAction({ id: this.form.id });
      await this.rootStore.rolesStore.removeItem(this.form.id);
      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  setRole = (role: UserRoleDto) => {
    this.setError(undefined);

    const permissions: UpsertRoleData["permissions"] = {
      aiAgent: { canManage: "no" },
      contacts: { canManage: "no", readAccess: "none" },
      deals: { canManage: "no", readAccess: "none" },
      organizations: { canManage: "no", readAccess: "none" },
      services: { canManage: "no", readAccess: "none" },
      users: { canManage: "no", readAccess: "own" },
      company: { canManage: "no" },
      api: { canManage: "no", readAccess: "none" },
      tasks: { canManage: "no", readAccess: "none" },
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
    this.setIsLoading(true);

    try {
      const res = await upsertRoleAction(toJS(this.form));

      if (res.ok) {
        await this.rootStore.rolesStore.upsertItem(res.data);
        this.close();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
