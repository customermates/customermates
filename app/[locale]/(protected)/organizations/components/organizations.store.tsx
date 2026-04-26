import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { OrganizationDto } from "@/features/organizations/organization.schema";

import { EntityType, Resource } from "@/generated/prisma";

import { getOrganizationsAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class OrganizationsStore extends BaseDataViewStore<OrganizationDto> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, Resource.organizations, EntityType.organization);
  }

  get canAccessContacts() {
    return this.rootStore.userStore.canAccess(Resource.contacts);
  }

  get canAccessDeals() {
    return this.rootStore.userStore.canAccess(Resource.deals);
  }

  get columnsDefinition() {
    const columns: (TableColumn | false)[] = [
      { uid: "name", sortable: true },
      this.canAccessContacts && { uid: "contacts" },
      this.canAccessDeals && { uid: "deals" },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label, sortable: true })),
      { uid: "users" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];

    return columns.filter((col): col is TableColumn => Boolean(col));
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await getOrganizationsAction(params);
  }
}
