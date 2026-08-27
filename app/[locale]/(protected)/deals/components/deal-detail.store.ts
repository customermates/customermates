import type { CreateDealData } from "@/features/deals/upsert/create-deal.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { DealDto } from "@/features/deals/deal.schema";

import { action, computed, makeObservable, observable } from "mobx";
import { Action, CustomColumnType, Resource } from "@/generated/prisma";

import { deleteDealAction, getDealByIdAction, createDealAction, updateDealAction } from "../actions";
import { createServiceByNameAction, getServicesAction } from "../../services/actions";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

export class DealDetailStore extends BaseCustomColumnEntityModalStore<CreateDealData & { id?: string }, DealDto> {
  serviceAmountById = new Map<string, number>();
  serviceReferenceById = new Map<string, { id: string; name: string; amount: number }>();

  constructor(rootStore: RootStore) {
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
      serviceReferenceById: observable,
      rememberServiceAmounts: action,
      selectedServices: computed,
      totalQuantity: computed,
      totalValue: computed,
      weightedValueBreakdown: computed,
    });
  }

  protected initFormWithCustomFieldValues(entity?: DealDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    this.serviceAmountById = new Map(entity?.services.map((service) => [service.id, service.amount]) ?? []);
    this.serviceReferenceById = new Map(
      entity?.services.map((service) => [service.id, { id: service.id, name: service.name, amount: service.amount }]) ??
        [],
    );

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
      taskIds: [],
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

  searchServiceOptions = async (params: { searchTerm?: string }) => {
    const result = await getServicesAction(params);
    this.rememberServiceAmounts(result.items);
    return {
      ...result,
      items: result.items.map((service) => ({ ...service, quantity: 1 })),
    };
  };

  createServiceOption = async (name: string) => {
    const res = await createServiceByNameAction(name, this.rootStore.userStore.user?.id);
    if (!res.ok) return res;
    this.rememberServiceAmounts([res.data]);
    return { ok: true as const, data: { ...res.data, quantity: 1 } };
  };

  rememberServiceAmounts = (items: ReadonlyArray<{ id: string; amount: number; name?: string }>) => {
    if (items.length === 0) return;
    const nextAmounts = new Map(this.serviceAmountById);
    const nextReferences = new Map(this.serviceReferenceById);
    let amountsChanged = false;
    let referencesChanged = false;
    for (const item of items) {
      if (nextAmounts.get(item.id) !== item.amount) {
        nextAmounts.set(item.id, item.amount);
        amountsChanged = true;
      }
      if (item.name) {
        const current = nextReferences.get(item.id);
        if (!current || current.name !== item.name || current.amount !== item.amount) {
          nextReferences.set(item.id, { id: item.id, name: item.name, amount: item.amount });
          referencesChanged = true;
        }
      }
    }
    if (amountsChanged) this.serviceAmountById = nextAmounts;
    if (referencesChanged) this.serviceReferenceById = nextReferences;
  };

  get selectedServices(): Array<{ id: string; name: string; amount: number; quantity: number }> {
    return (this.form.services ?? []).flatMap((entry) => {
      if (!entry.serviceId) return [];
      const service = this.serviceReferenceById.get(entry.serviceId);
      return service ? [{ ...service, quantity: entry.quantity ?? 0 }] : [];
    });
  }

  get totalQuantity(): number {
    if (this.fetchedEntity && !this.rootStore.userStore.can(Resource.services, Action.readAll))
      return this.fetchedEntity.totalQuantity;

    let total = 0;
    for (const entry of this.form.services ?? []) total += entry.quantity ?? 0;
    return total;
  }

  get totalValue(): number {
    if (this.fetchedEntity && !this.rootStore.userStore.can(Resource.services, Action.readAll))
      return this.fetchedEntity.totalValue;

    let total = 0;
    for (const entry of this.form.services ?? []) {
      const amount = entry.serviceId ? (this.serviceAmountById.get(entry.serviceId) ?? 0) : 0;
      total += amount * (entry.quantity ?? 0);
    }
    return total;
  }

  get weightedValueBreakdown(): { value: number; percent: number; stage: string; weightedValue: number } | null {
    if (!this.fetchedEntity) return null;

    const weightingColumnId = this.rootStore.companyStore.company?.dealWeightingColumnId;
    if (!weightingColumnId) return null;

    const column = this.customColumns.find((it) => it.id === weightingColumnId);
    if (column?.type !== CustomColumnType.singleSelect) return null;

    const selectedValue = this.form.customFieldValues.find((it) => it.columnId === weightingColumnId)?.value;
    if (!selectedValue) return null;

    const option = column.options.options.find((it) => it.value === selectedValue);
    if (!option || option.weight === undefined) return null;

    const value = this.totalValue;

    return {
      value,
      percent: option.weight,
      stage: option.label,
      weightedValue: value * (option.weight / 100),
    };
  }

  protected buildRecentSearchItem(entity: DealDto) {
    return { type: "deal" as const, id: entity.id, name: entity.name, pictureUrl: null };
  }
}
