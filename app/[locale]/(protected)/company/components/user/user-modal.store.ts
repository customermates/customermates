import type { FormEvent } from "react";
import type { AdminUpdateUserDetailsData } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { UserDto } from "@/features/user/user.schema";
import type { RootStore } from "@/core/stores/root.store";

import { action, computed, makeObservable, observable, toJS } from "mobx";

import { CountryCode, Resource, Status } from "@/generated/prisma";

import { adminUpdateUserDetailsAction, getRolesAction, getUserByIdAction } from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";

export class UserModalStore extends BaseModalStore<AdminUpdateUserDetailsData> {
  public fetchedUser: UserDto | null = null;

  constructor(public readonly rootStore: RootStore) {
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
      fetchedUser: observable,

      onSubmit: action,
      loadById: action,

      isOwnProfile: computed,
      isDisabledOrOwnProfile: computed,
      customColumns: computed,
    });
  }

  get customColumns() {
    return this.rootStore.usersStore.customColumns;
  }

  get isOwnProfile() {
    return this.form.email === this.rootStore.userStore.user?.email;
  }

  get isDisabledOrOwnProfile() {
    return this.isOwnProfile || this.isDisabled;
  }

  loadById = async (id: string) => {
    this.fetchedUser = null;
    this.setIsLoading(true);
    this.open();

    try {
      const [{ user }, roles] = await Promise.all([getUserByIdAction({ id }), getRolesAction()]);

      this.rootStore.rolesStore.setItems(roles);

      if (user) {
        this.fetchedUser = user;
        this.setError(undefined);

        this.onInitOrRefresh({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          country: user.country,
          status: user.status as typeof Status.active | typeof Status.inactive,
          avatarUrl: user.avatarUrl,
          roleId: user.roleId ?? "",
        });
      } else this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
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
