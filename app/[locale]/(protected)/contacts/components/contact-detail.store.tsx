import type { RootStore } from "@/core/stores/root.store";
import type { ContactDto, ContactIdentifierDto, IdentifierInput } from "@/features/contacts/contact.schema";
import type { CreateContactData } from "@/features/contacts/upsert/create-contact.interactor";

import { action, computed, makeObservable } from "mobx";
import { Resource } from "@/generated/prisma";

import { deleteContactAction, getContactByIdAction, createContactAction, updateContactAction } from "../actions";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";
import { identifierKey } from "@/features/contacts/upsert/validate-identifiers";

function toIdentifierInput(identifier: ContactIdentifierDto): IdentifierInput {
  return {
    provider: identifier.provider,
    value: identifier.value,
    messagingId: identifier.messagingId ?? undefined,
    displayName: identifier.displayName ?? undefined,
    profileUrl: identifier.profileUrl ?? undefined,
  };
}

export class ContactDetailStore extends BaseCustomColumnEntityModalStore<
  CreateContactData & { id?: string },
  ContactDto
> {
  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        firstName: "",
        lastName: "",
        notes: null,
        organizationIds: [],
        userIds: [],
        dealIds: [],
        taskIds: [],
        customFieldValues: [],
        identifiers: [],
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

    makeObservable(this, {
      channels: computed,
      addChannel: action,
      removeChannel: action,
    });
  }

  get channels(): IdentifierInput[] {
    return this.form.identifiers ?? [];
  }

  addChannel = (identifier: IdentifierInput): void => {
    const key = identifierKey(identifier.provider, identifier.value);
    const exists = this.channels.some((existing) => identifierKey(existing.provider, existing.value) === key);
    if (exists) return;

    this.onChange("identifiers", [...this.channels, identifier]);
  };

  removeChannel = (index: number): void => {
    this.onChange(
      "identifiers",
      this.channels.filter((_, i) => i !== index),
    );
  };

  protected initFormWithCustomFieldValues(entity?: ContactDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    if (entity) {
      return {
        ...entity,
        ...baseData,
        organizationIds: entity.organizations.map((org) => org.id),
        userIds: entity.users.map((user) => user.id),
        dealIds: entity.deals.map((deal) => deal.id),
        taskIds: entity.tasks.map((task) => task.id),
        identifiers: entity.identifiers.map(toIdentifierInput),
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
      taskIds: [],
      identifiers: [],
    };
  }

  protected buildRecentSearchItem(entity: ContactDto) {
    const name = `${entity.firstName ?? ""} ${entity.lastName ?? ""}`.trim();
    if (!name) return null;
    return {
      type: "contact" as const,
      id: entity.id,
      name,
      pictureUrl: entity.avatarUrl ?? null,
    };
  }
}
