import type { CreateDealData } from "@/features/deals/upsert/create-deal.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { DealDto } from "@/features/deals/deal.schema";

import { action, computed, makeObservable, observable } from "mobx";
import { Resource } from "@/generated/prisma";

import { deleteDealAction, getDealByIdAction, createDealAction, updateDealAction } from "../actions";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

export class DealDetailStore extends BaseCustomColumnEntityModalStore<CreateDealData & { id?: string }, DealDto> {
  serviceAmountById = new Map<string, number>();

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
        taskIds: [],
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
      serviceAmountById: observable,
      rememberServiceAmounts: action,
      totalQuantity: computed,
      totalValue: computed,
    });
  }

  protected initFormWithCustomFieldValues(entity?: DealDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    this.serviceAmountById = new Map(entity?.services.map((service) => [service.id, service.amount]) ?? []);

    if (entity) {
      return {
        ...entity,
        ...baseData,
        organizationIds: entity.organizations.map((org) => org.id),
        userIds: entity.users.map((user) => user.id),
        contactIds: entity.contacts.map((contact) => contact.id),
        taskIds: entity.tasks.map((task) => task.id),
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

  rememberServiceAmounts = (items: ReadonlyArray<{ id: string; amount: number }>) => {
    if (items.length === 0) return;
    const next = new Map(this.serviceAmountById);
    let changed = false;
    for (const item of items) {
      if (next.get(item.id) !== item.amount) {
        next.set(item.id, item.amount);
        changed = true;
      }
    }
    if (changed) this.serviceAmountById = next;
  };

  get totalQuantity(): number {
    let total = 0;
    for (const entry of this.form.services ?? []) total += entry.quantity ?? 0;
    return total;
  }

  get totalValue(): number {
    let total = 0;
    for (const entry of this.form.services ?? []) {
      const amount = entry.serviceId ? (this.serviceAmountById.get(entry.serviceId) ?? 0) : 0;
      total += amount * (entry.quantity ?? 0);
    }
    return total;
  }

  protected buildRecentSearchItem(entity: DealDto) {
    return { type: "deal" as const, id: entity.id, name: entity.name };
  }
}
