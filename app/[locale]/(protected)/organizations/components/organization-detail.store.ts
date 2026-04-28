import type { CreateOrganizationData } from "@/features/organizations/upsert/create-organization.interactor";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { RootStore } from "@/core/stores/root.store";

import { Resource } from "@/generated/prisma";

import {
  deleteOrganizationAction,
  getOrganizationByIdAction,
  createOrganizationAction,
  updateOrganizationAction,
} from "../actions";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

export class OrganizationDetailStore extends BaseCustomColumnEntityModalStore<
  CreateOrganizationData & { id?: string },
  OrganizationDto
> {
  constructor(public readonly rootStore: RootStore) {
    super(
      rootStore,
      {
        name: "",
        notes: null,
        contactIds: [],
        userIds: [],
        dealIds: [],
        taskIds: [],
        customFieldValues: [],
      },
      Resource.organizations,
      rootStore.organizationsStore,
      {
        getById: getOrganizationByIdAction,
        create: createOrganizationAction,
        update: updateOrganizationAction,
        delete: deleteOrganizationAction,
      },
    );
  }

  protected initFormWithCustomFieldValues(entity?: OrganizationDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    if (entity) {
      return {
        ...entity,
        ...baseData,
        contactIds: entity.contacts.map((contact) => contact.id),
        userIds: entity.users.map((user) => user.id),
        dealIds: entity.deals.map((deal) => deal.id),
        taskIds: entity.tasks.map((task) => task.id),
      };
    }

    return {
      ...baseData,
      name: "",
      notes: null,
      contactIds: [],
      userIds: [],
      dealIds: [],
    };
  }

  protected buildRecentSearchItem(entity: OrganizationDto) {
    return { type: "organization" as const, id: entity.id, name: entity.name };
  }
}
