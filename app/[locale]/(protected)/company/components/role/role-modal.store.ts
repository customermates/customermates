import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertRoleData, RoleSystemControls } from "@/features/role/role-management.schema";
import type { RoleEditorContext } from "@/features/role/role-management.schema";
import type { RolePermissionsDto as RoleDto } from "@/features/role/role.schema";
import { action, computed, makeObservable, observable, runInAction, toJS } from "mobx";
import { Resource, Action } from "@/generated/prisma";
import { deleteRoleAction, upsertRoleAction, getRoleEditorAction } from "../../actions";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { reportApplicationError } from "@/core/errors/report-application-error";

function defaultRolePermissions(): RoleSystemControls {
  return {
    users: { canManage: "no", readAccess: "own" },
    company: { canManage: "no" },
    dataModel: { canManage: "no" },
    api: { canManage: "no", readAccess: "none" },
    inboxMessages: { canManage: "no", readAccess: "none" },
    auditLog: { readAccess: "none" },
    routines: { canManage: "no", readAccess: "none" },
  };
}

type RoleForm = {
  id?: string;
  name: string;
  description: string;
  permissions: RoleSystemControls;
  recordGrants: Array<{
    typeId: string;
    create: boolean;
    update: boolean;
    delete: boolean;
    readAccess: "none" | "own" | "all";
  }>;
};

function roleForm(role?: RoleDto | null): RoleForm {
  const permissions = defaultRolePermissions();
  for (const resourceKey of Object.keys(permissions) as Array<keyof typeof permissions>) {
    const resource = permissions[resourceKey];
    if (role && "readAccess" in resource) resource.readAccess = "none";
    if (role?.isSystemRole) {
      if ("canManage" in resource) resource.canManage = "yes";
      if ("readAccess" in resource) resource.readAccess = "all";
    } else {
      for (const permission of role?.permissions ?? []) {
        if (permission.resource !== resourceKey) continue;
        if (
          "canManage" in resource &&
          [Action.create, Action.update, Action.delete].some((action) => action === permission.action)
        )
          resource.canManage = "yes";
        if ("readAccess" in resource && permission.action === Action.readAll) resource.readAccess = "all";
        else if ("readAccess" in resource && resource.readAccess === "none" && permission.action === Action.readOwn)
          resource.readAccess = "own";
      }
    }
  }
  return { id: role?.id, name: role?.name ?? "", description: role?.description ?? "", permissions, recordGrants: [] };
}

export class RoleModalStore extends BaseModalStore<RoleForm> {
  context: RoleEditorContext | null = null;
  loadFailed = false;
  private loadSequence = 0;
  private lastSubmission: { payload: string; key: string } | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, roleForm(), Resource.users);
    makeObservable(this, {
      context: observable.ref,
      loadFailed: observable,
      add: action,
      editRole: action,
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
    return Boolean(this.form.id) && this.form.id === this.rootStore.userStore.user?.roleId;
  }
  get isReadOnly(): boolean {
    return this.isSystemRole || this.isOwnRole || !this.context?.canEdit;
  }
  get isSystemRole() {
    return Boolean(
      this.context?.role?.isSystemRole ??
        this.rootStore.rolesStore.items.find((role) => role.id === this.form.id)?.isSystemRole,
    );
  }
  get isDisabledOrSystemRole() {
    return this.isDisabled;
  }
  get hasUsersAssigned() {
    return Boolean(this.rootStore.rolesStore.items.find((role) => role.id === this.form.id)?.hasUsersAssigned);
  }
  get canDeleteRole() {
    return Boolean(this.form.id && !this.isLoading && this.context?.canDelete && !this.hasUsersAssigned);
  }

  add = () => {
    this.context = null;
    this.lastSubmission = null;
    this.openWith(roleForm());
    void this.loadContext();
  };

  setRole = (role: RoleDto) => {
    this.context = null;
    this.lastSubmission = null;
    this.onInitOrRefresh(roleForm(role));
  };

  editRole = (role: RoleDto) => {
    this.setRole(role);
    this.open();
    void this.loadContext();
  };

  loadContext = async () => {
    const sequence = ++this.loadSequence;
    const id = this.form.id;
    this.setIsLoading(true);
    runInAction(() => {
      this.loadFailed = false;
    });
    try {
      const result = await getRoleEditorAction({ id });
      if (sequence !== this.loadSequence || this.form.id !== id || !this.isOpen) return;
      if (!result.ok) {
        toastZodErrorTree(result.error);
        runInAction(() => {
          this.loadFailed = true;
        });
        return;
      }
      runInAction(() => {
        const form = roleForm(result.data.role);
        form.recordGrants = result.data.types.map((type) => {
          const actions = result.data.role?.recordGrants?.find((grant) => grant.typeId === type.id)?.actions ?? [];
          const admin = result.data.role?.isSystemRole;
          return {
            typeId: type.id,
            create: Boolean(admin || actions.includes("create")),
            update: Boolean(admin || actions.includes("update")),
            delete: Boolean(admin || actions.includes("delete")),
            readAccess: admin || actions.includes("readAll") ? "all" : actions.includes("readOwn") ? "own" : "none",
          };
        });
        this.context = result.data;
        this.onInitOrRefresh(form);
      });
    } catch (error) {
      if (sequence === this.loadSequence) {
        runInAction(() => {
          this.loadFailed = true;
        });
      }
      reportApplicationError(error);
    } finally {
      if (sequence === this.loadSequence) this.setIsLoading(false);
    }
  };

  private submissionKey(payload: unknown): string {
    const encoded = JSON.stringify(payload);
    if (this.lastSubmission?.payload !== encoded) this.lastSubmission = { payload: encoded, key: crypto.randomUUID() };
    return this.lastSubmission.key;
  }

  delete = async (): Promise<boolean> => {
    if (!this.form.id || !this.context || !this.canDeleteRole) return false;
    this.setIsLoading(true);
    try {
      const data = { id: this.form.id, expectedRevision: this.context.schemaRevision };
      const result = await deleteRoleAction({
        ...data,
        idempotencyKey: this.submissionKey({ action: "delete", ...data }),
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }
      await this.rootStore.rolesStore.removeItem(this.form.id);
      this.close();
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isReadOnly || this.isLoading || !this.context) return;
    this.setIsLoading(true);
    try {
      const form = toJS(this.form);
      const permissions = Object.fromEntries(
        Object.entries(form.permissions).flatMap(([resource, rights]) => {
          const saved = this.savedState.permissions[resource as keyof RoleSystemControls];
          const changed = Object.fromEntries(
            Object.entries(rights).filter(([key, value]) => !form.id || Reflect.get(saved, key) !== value),
          );
          return Object.keys(changed).length ? [[resource, changed]] : [];
        }),
      ) as UpsertRoleData["permissions"];
      const data = {
        ...form,
        permissions,
        expectedRevision: this.context.schemaRevision,
        recordGrants: form.recordGrants.map((grant) => ({
          typeId: grant.typeId,
          actions: [
            ...(grant.create ? [Action.create] : []),
            ...(grant.update ? [Action.update] : []),
            ...(grant.delete ? [Action.delete] : []),
            ...(grant.readAccess === "all" ? [Action.readAll] : grant.readAccess === "own" ? [Action.readOwn] : []),
          ],
        })),
      };
      const result = await upsertRoleAction({ ...data, idempotencyKey: this.submissionKey(data) });
      if (result.ok) {
        const role = result.data.role;
        const currentRole = this.rootStore.rolesStore.items.find((item) => item.id === role.id);
        await this.rootStore.rolesStore.upsertItem(
          { ...role, hasUsersAssigned: currentRole?.hasUsersAssigned ?? false },
          { created: !this.form.id },
        );
        this.close();
      } else this.setError(result.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
