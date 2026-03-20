import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { XTableColumn } from "@/core/base/base-data-view.store";
import type { DealDto } from "@/features/deals/deal.schema";

import { EntityType, Resource } from "@/generated/prisma";

import { getDealsAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class DealsStore extends BaseDataViewStore<DealDto> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, Resource.deals, EntityType.deal);
  }

  get canAccessOrganizations() {
    return this.rootStore.userStore.canAccess(Resource.organizations);
  }

  get canAccessContacts() {
    return this.rootStore.userStore.canAccess(Resource.contacts);
  }

  get canAccessServices() {
    return this.rootStore.userStore.canAccess(Resource.services);
  }

  get columnsDefinition() {
    const columns: (XTableColumn | false)[] = [
      { uid: "name", sortable: true },
      { uid: "totalValue", sortable: true },
      { uid: "totalQuantity", sortable: true },
      this.canAccessContacts && { uid: "contacts" },
      this.canAccessOrganizations && { uid: "organizations" },
      this.canAccessServices && { uid: "services" },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label })),
      { uid: "users" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];

    return columns.filter((col): col is XTableColumn => Boolean(col));
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await getDealsAction(params);
  }
}
