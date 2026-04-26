import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { ContactDto } from "@/features/contacts/contact.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";

import { EntityType, Resource } from "@/generated/prisma";

import { getContactsAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class ContactsStore extends BaseDataViewStore<ContactDto> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, Resource.contacts, EntityType.contact);
  }

  get canAccessOrganizations() {
    return this.rootStore.userStore.canAccess(Resource.organizations);
  }

  get canAccessDeals() {
    return this.rootStore.userStore.canAccess(Resource.deals);
  }

  get columnsDefinition() {
    const columns: (TableColumn | false)[] = [
      { uid: "name", sortable: true },
      this.canAccessOrganizations && { uid: "organizations" },
      this.canAccessDeals && { uid: "deals" },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label, sortable: true })),
      { uid: "users" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];

    return columns.filter((col): col is TableColumn => Boolean(col));
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getContactsAction(params);
  }
}
