import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";

import { getRolesAction } from "../../actions";

import { type UserRoleDto } from "@/features/role/get-roles.interactor";
import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class RolesStore extends BaseDataViewStore<UserRoleDto> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore);
  }

  get columnsDefinition() {
    return [{ uid: "name" }, { uid: "type", sortable: true }, { uid: "description" }];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await getRolesAction(params);
  }
}
