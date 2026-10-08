import type { FormEvent } from "react";
import type { AdminUpdateUserDetailsData } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, computed, makeObservable, observable, toJS } from "mobx";
import { Action, CountryCode, Resource, Status } from "@/generated/prisma";

import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { adminUpdateUserDetailsAction, getRolesAction, getUserByIdAction } from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";

type RemovableMember = { status: Status; roleId: string | null; firstName: string; lastName: string };

export function isRemovableMember(member: RemovableMember) {
  return member.status === Status.active && Boolean(member.roleId && member.firstName && member.lastName);
}

export class UserModalStore extends BaseModalStore<AdminUpdateUserDetailsData> {
  public loadedUserId: string | null = null;
  private loadSequence = 0;

  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        email: "",
        firstName: "",
        lastName: "",
        country: CountryCode.de,
        status: Status.active,
        avatarUrl: null,
        roleId: "",
      },
      Resource.users,
    );

    makeObservable(this, {
      onSubmit: action,
      loadById: action,
      remove: action,
      setLoadedUserId: action,

      loadedUserId: observable,
      isOwnProfile: computed,
      canRemove: computed,
    });
  }

  get isOwnProfile() {
    const signedInUserId = this.rootStore.userStore.user?.id;

    return signedInUserId !== undefined && this.loadedUserId === signedInUserId;
  }

  get isReadOnly(): boolean {
    return this.isOwnProfile || super.isReadOnly;
  }

  get canRemove() {
    return Boolean(
      this.loadedUserId && !this.isOwnProfile && this.allows(Action.update) && isRemovableMember(this.savedState),
    );
  }

  setLoadedUserId = (loadedUserId: string | null) => {
    this.loadedUserId = loadedUserId;
  };

  loadById = async (id: string) => {
    const sequence = ++this.loadSequence;
    this.setIsLoading(true);
    this.setLoadedUserId(null);

    try {
      const [{ user }, roles] = await Promise.all([getUserByIdAction({ id }), getRolesAction()]);

      if (sequence !== this.loadSequence) return;

      this.rootStore.rolesStore.setItems(roles);

      if (!user) return;

      this.setError(undefined);
      this.setLoadedUserId(user.id);

      this.openWith({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        country: user.country,
        status: user.status as typeof Status.active | typeof Status.inactive,
        avatarUrl: user.avatarUrl,
        roleId: user.roleId ?? "",
      });
    } finally {
      if (sequence === this.loadSequence) this.setIsLoading(false);
    }
  };

  remove = async (memberId: string): Promise<boolean> => {
    if (this.loadedUserId !== memberId || !this.canRemove || this.isLoading) return false;

    this.setIsLoading(true);

    try {
      const res = await adminUpdateUserDetailsAction({ ...toJS(this.savedState), status: Status.inactive });

      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.rootStore.usersStore.refresh();
      this.close();
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isReadOnly) return;

    this.setIsLoading(true);

    try {
      const res = await adminUpdateUserDetailsAction(toJS(this.form));

      if (res.ok) {
        await this.rootStore.usersStore.refresh();
        this.close();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
