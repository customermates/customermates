import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { RoleEditorContext } from "@/features/role/role-management.schema";
import type { AccessRow } from "@/features/role/resource-access";
import type { RolePermissionsDto as RoleDto } from "@/features/role/role.schema";
import { action, computed, makeObservable, observable, runInAction, toJS } from "mobx";
import { Resource, Action } from "@/generated/prisma";
import {
  accessRow,
  MANAGE_ACTIONS,
  manageImpliesReadAll,
  RECORD_TYPE_ACCESS,
  RESOURCE_ACCESS,
  rowActions,
} from "@/features/role/resource-access";
import { deleteRoleAction, upsertRoleAction, getRoleEditorAction } from "../../actions";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { reportApplicationError } from "@/core/errors/report-application-error";

type RoleForm = {
  id?: string;
  name: string;
  description: string;
  permissions: Record<Resource, AccessRow>;
  recordGrants: Array<AccessRow & { typeId: string }>;
};

const SYSTEM_RESOURCES = Object.keys(RESOURCE_ACCESS) as Resource[];

const NEW_ROLE_ACTIONS: Partial<Record<Resource, Action[]>> = {
  [Resource.users]: [Action.readOwn],
  [Resource.wiki]: [Action.readAll],
};

function fullAccess(access: { manage: readonly string[]; read: readonly string[] }): AccessRow {
  return accessRow([...access.manage, ...(access.read.includes("all") ? [Action.readAll] : [])]);
}

function roleForm(role?: RoleDto | null): RoleForm {
  const permissions = Object.fromEntries(
    SYSTEM_RESOURCES.map((resource) => {
      if (role?.isSystemRole) return [resource, fullAccess(RESOURCE_ACCESS[resource])];
      if (!role) return [resource, accessRow(NEW_ROLE_ACTIONS[resource] ?? [])];
      const row = accessRow(
        role.permissions.filter((permission) => permission.resource === resource).map(({ action }) => action),
      );
      if (manageImpliesReadAll(resource) && MANAGE_ACTIONS.some((action) => row[action])) row.readAccess = "all";
      return [resource, row];
    }),
  ) as Record<Resource, AccessRow>;
  return { id: role?.id, name: role?.name ?? "", description: role?.description ?? "", permissions, recordGrants: [] };
}

export class RoleModalStore extends BaseModalStore<RoleForm> {
  context: RoleEditorContext | null = null;
  loadFailed = false;
  private loadSequence = 0;
  private sessionGeneration = 0;
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
    this.sessionGeneration += 1;
    this.context = null;
    this.lastSubmission = null;
    this.openWith(roleForm());
    void this.loadContext();
  };

  setRole = (role: RoleDto) => {
    this.sessionGeneration += 1;
    this.loadSequence += 1;
    this.context = null;
    this.lastSubmission = null;
    this.onInitOrRefresh(roleForm(role));
  };

  editRole = (role: RoleDto) => {
    this.setRole(role);
    this.open();
    void this.loadContext();
  };
  protected override prepareToClose() {
    this.sessionGeneration += 1;
    this.loadSequence += 1;
    return true;
  }

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
        form.recordGrants = result.data.types.map((type) => ({
          typeId: type.id,
          ...(result.data.role?.isSystemRole
            ? fullAccess(RECORD_TYPE_ACCESS)
            : accessRow(result.data.role?.recordGrants?.find((grant) => grant.typeId === type.id)?.actions ?? [])),
        }));
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
    if (!this.isOpen || !this.form.id || !this.context || !this.canDeleteRole) return false;
    const session = this.sessionGeneration;
    const isCurrent = () => session === this.sessionGeneration && this.isOpen;
    this.setIsLoading(true);
    try {
      const data = { id: this.form.id, expectedRevision: this.context.schemaRevision };
      const result = await deleteRoleAction({
        ...data,
        idempotencyKey: this.submissionKey({ action: "delete", ...data }),
      });
      if (!result.ok) {
        if (isCurrent()) toastZodErrorTree(result.error);
        return false;
      }
      await this.rootStore.rolesStore.removeItem(data.id);
      if (isCurrent()) this.close();
      return true;
    } finally {
      if (isCurrent()) this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!this.isOpen || this.isReadOnly || this.isLoading || !this.context) return;
    const session = this.sessionGeneration;
    const isCurrent = () => session === this.sessionGeneration && this.isOpen;
    this.setIsLoading(true);
    try {
      const form = toJS(this.form);
      const data = {
        id: form.id,
        name: form.name,
        description: form.description,
        permissions: SYSTEM_RESOURCES.flatMap((resource) => {
          const actions = rowActions(form.permissions[resource], RESOURCE_ACCESS[resource]);
          const saved = rowActions(this.savedState.permissions[resource], RESOURCE_ACCESS[resource]);
          return form.id && actions.join() === saved.join() ? [] : [{ resource, actions }];
        }),
        expectedRevision: this.context.schemaRevision,
        recordGrants: form.recordGrants.map(({ typeId, ...row }) => ({
          typeId,
          actions: rowActions(row, RECORD_TYPE_ACCESS),
        })),
      };
      const result = await upsertRoleAction({ ...data, idempotencyKey: this.submissionKey(data) });
      if (result.ok) {
        const role = result.data.role;
        const currentRole = this.rootStore.rolesStore.items.find((item) => item.id === role.id);
        await this.rootStore.rolesStore.upsertItem(
          { ...role, hasUsersAssigned: currentRole?.hasUsersAssigned ?? false },
          { created: !form.id },
        );
        if (isCurrent()) this.close();
      } else if (isCurrent()) this.setError(result.error);
    } finally {
      if (isCurrent()) this.setIsLoading(false);
    }
  };

  protected override afterChange(id: string, value: unknown): void {
    const [, resource, action] = id.split(".");
    if (id.startsWith("permissions.") && value === true && manageImpliesReadAll(resource as Resource)) {
      if (MANAGE_ACTIONS.some((manage) => manage === action))
        this.form.permissions[resource as Resource].readAccess = "all";
    }
  }
}
