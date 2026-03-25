import type { CreateDealData } from "@/features/deals/upsert/create-deal.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { DealDto } from "@/features/deals/deal.schema";

import { action, makeObservable } from "mobx";
import { Resource } from "@/generated/prisma";

import { deleteDealAction, getDealByIdAction, createDealAction, updateDealAction } from "../actions";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

export class DealModalStore extends BaseCustomColumnEntityModalStore<CreateDealData & { id?: string }, DealDto> {
  constructor(public readonly rootStore: RootStore) {
    super(
      rootStore,
      {
        name: "",
        notes: null,
        organizationIds: [],
        userIds: [],
        contactIds: [],
        services: [],
        customFieldValues: [],
      },
      Resource.deals,
      rootStore.dealsStore,
      {
        getById: getDealByIdAction,
        create: createDealAction,
        update: updateDealAction,
        delete: deleteDealAction,
      },
    );

    makeObservable(this, {
      addService: action,
      deleteService: action,
    });
  }

  protected initFormWithCustomFieldValues(entity?: DealDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    if (entity) {
      return {
        ...entity,
        ...baseData,
        organizationIds: entity.organizations.map((org) => org.id),
        userIds: entity.users.map((user) => user.id),
        contactIds: entity.contacts.map((contact) => contact.id),
        services: entity.services.map((it) => ({
          serviceId: it.id,
          quantity: it.quantity,
        })),
      };
    }

    return {
      ...baseData,
      name: "",
      notes: null,
      organizationIds: [],
      userIds: [],
      contactIds: [],
      services: [],
    };
  }

  addService = () => {
    const newServices = [...(this.form.services || [])];

    newServices.push({ serviceId: "", quantity: 1 });

    this.onChange("services", newServices);
  };

  deleteService = (index: number) => {
    const newServices = [...(this.form.services || [])];

    newServices.splice(index, 1);

    this.onChange("services", newServices);
  };
}
