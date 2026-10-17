import type { FormEvent } from "react";
import type { AdminUpdateUserDetailsData } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { MemberRemovalRefusal } from "@/features/workspace/member-removal-refusal";
import type { RootStore } from "@/core/stores/root.store";

import { action, computed, makeObservable, observable, toJS } from "mobx";
import { Action, CountryCode, Resource, Status } from "@/generated/prisma";

import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";

import {
  adminUpdateUserDetailsAction,
  getMemberRemovalAction,
  getRolesAction,
  getUserByIdAction,
  removeWorkspaceMemberAction,
} from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";

type RemovalCandidate = { id: string; leftAt: Date | null };

export type MemberRemovalBlock = Extract<MemberRemovalRefusal, "lastAdmin" | "platformOperator">;

function removalBlock(refusal: MemberRemovalRefusal | null | undefined): MemberRemovalBlock | null {
  return refusal === "lastAdmin" || refusal === "platformOperator" ? refusal : null;
}

export class UserModalStore extends BaseModalStore<AdminUpdateUserDetailsData> {
  public loadedUserId: string | null = null;
  public loadedLeftAt: Date | null = null;
  public loadedStatus: Status | null = null;
  public removalRefusal: MemberRemovalRefusal | null | undefined = undefined;
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
      loadedLeftAt: observable,
      loadedStatus: observable,
      removalRefusal: observable,
      isOwnProfile: computed,
      showsRemoval: computed,
      removalBlockedBy: computed,
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

  offersRemovalFor(member: RemovalCandidate) {
    return (
      this.rootStore.appMode !== "demo" &&
      this.allows(Action.update) &&
      member.id !== this.rootStore.userStore.user?.id &&
      !member.leftAt
    );
  }

  get showsRemoval() {
    const { loadedUserId, removalRefusal } = this;
    if (!loadedUserId || removalRefusal === undefined || removalRefusal === "self" || removalRefusal === "left")
      return false;

    return this.offersRemovalFor({ id: loadedUserId, leftAt: this.loadedLeftAt });
  }

  get removalBlockedBy(): MemberRemovalBlock | null {
    return this.showsRemoval ? removalBlock(this.removalRefusal) : null;
  }

  get canRemove() {
    return this.showsRemoval && this.removalRefusal === null;
  }

  setLoadedUserId = (
    loadedUserId: string | null,
    loadedLeftAt: Date | null = null,
    loadedStatus: Status | null = null,
    removalRefusal: MemberRemovalRefusal | null | undefined = undefined,
  ) => {
    this.loadedUserId = loadedUserId;
    this.loadedLeftAt = loadedLeftAt;
    this.loadedStatus = loadedStatus;
    this.removalRefusal = removalRefusal;
  };

  loadById = async (id: string) => {
    const sequence = ++this.loadSequence;
    this.setIsLoading(true);
    this.setLoadedUserId(null);

    try {
      const [{ user }, roles, removal] = await Promise.all([
        getUserByIdAction({ id }),
        getRolesAction(),
        this.offersRemovalFor({ id, leftAt: null }) ? getMemberRemovalAction({ userId: id }) : null,
      ]);

      if (sequence !== this.loadSequence || notifyIfWorkspaceChanged(removal)) return;

      this.rootStore.rolesStore.setItems(roles);

      if (!user) return;

      this.setError(undefined);
      this.setLoadedUserId(user.id, user.leftAt, user.status, removal?.ok ? removal.data.refusal : undefined);

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
      const res = await removeWorkspaceMemberAction({ userId: memberId });

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
