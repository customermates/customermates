import type { RootStore } from "@/core/stores/root.store";
import type { ContactDto } from "@/features/contacts/contact.schema";
import type { CreateContactData } from "@/features/contacts/upsert/create-contact.interactor";

import { Resource } from "@/generated/prisma";

import { deleteContactAction, getContactByIdAction, createContactAction, updateContactAction } from "../actions";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

export class ContactModalStore extends BaseCustomColumnEntityModalStore<
  CreateContactData & { id?: string },
  ContactDto
> {
  constructor(public readonly rootStore: RootStore) {
    super(
      rootStore,
      {
        firstName: "",
        lastName: "",
        notes: null,
        organizationIds: [],
        userIds: [],
        dealIds: [],
        customFieldValues: [],
      },
      Resource.contacts,
      rootStore.contactsStore,
      {
        getById: getContactByIdAction,
        create: createContactAction,
        update: updateContactAction,
        delete: deleteContactAction,
      },
    );
  }

  protected initFormWithCustomFieldValues(entity?: ContactDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    if (entity) {
      return {
        ...entity,
        ...baseData,
        organizationIds: entity.organizations.map((org) => org.id),
        userIds: entity.users.map((user) => user.id),
        dealIds: entity.deals.map((deal) => deal.id),
      };
    }

    return {
      ...baseData,
      firstName: "",
      lastName: "",
      notes: null,
      organizationIds: [],
      userIds: [],
      dealIds: [],
    };
  }
}
