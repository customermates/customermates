import type { CreateServiceData } from "@/features/services/upsert/create-service.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { ServiceDto } from "@/features/services/service.schema";

import { Resource } from "@/generated/prisma";

import { deleteServiceAction, getServiceByIdAction, createServiceAction, updateServiceAction } from "../actions";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

export class ServiceDetailStore extends BaseCustomColumnEntityModalStore<
  CreateServiceData & { id?: string },
  ServiceDto
> {
  constructor(public readonly rootStore: RootStore) {
    super(
      rootStore,
      {
        name: "",
        amount: 0,
        notes: null,
        userIds: [],
        dealIds: [],
        taskIds: [],
        customFieldValues: [],
      },
      Resource.services,
      rootStore.servicesStore,
      {
        getById: getServiceByIdAction,
        create: createServiceAction,
        update: updateServiceAction,
        delete: deleteServiceAction,
      },
    );
  }

  protected initFormWithCustomFieldValues(entity?: ServiceDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    if (entity) {
      return {
        ...entity,
        ...baseData,
        userIds: entity.users.map((user) => user.id),
        dealIds: entity.deals.map((deal) => deal.id),
        taskIds: entity.tasks.map((task) => task.id),
      };
    }

    return {
      ...baseData,
      name: "",
      amount: 0,
      notes: null,
      userIds: [],
      dealIds: [],
    };
  }

  protected buildRecentSearchItem(entity: ServiceDto) {
    return { type: "service" as const, id: entity.id, name: entity.name };
  }
}
