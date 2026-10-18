import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { MemberDto } from "@/features/user/user.schema";

import { Resource } from "@/generated/prisma";

import { getUsersAction } from "../../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class UsersStore extends BaseDataViewStore<MemberDto> {
  constructor(rootStore: RootStore) {
    super(rootStore, Resource.users);
  }

  get columnsDefinition() {
    return [
      { uid: "name", sortable: true },
      { uid: "email" },
      { uid: "role" },
      { uid: "status" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await getUsersAction(params);
  }
}
