import type { FormEvent } from "react";
import type { UpsertCustomColumnData } from "@/features/custom-column/upsert-custom-column.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { CustomColumnOption, CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { action, makeObservable, toJS } from "mobx";

import { CustomColumnType, EntityType, Currency, Resource } from "@/generated/prisma";

import { type ChipColor } from "@/constants/chip-colors";
import { type DateDisplayFormat } from "@/constants/date-format";
import { deleteCustomColumnAction, upsertCustomColumnAction } from "@/app/actions";
import { BaseModalStore } from "@/core/base/base-modal.store";

export class XCustomColumnModalStore extends BaseModalStore<UpsertCustomColumnData> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, {
      id: undefined,
      label: "",
      type: CustomColumnType.plain,
      entityType: EntityType.contact,
    });

    makeObservable(this, {
      onSubmit: action,
      initialize: action,
      openWithColumn: action,
      addOption: action,
      deleteOption: action,
      deleteColumn: action,
      toggleDefaultOption: action,
      changeType: action,
      reorderOptions: action,
    });
  }

  override get isDisabled(): boolean {
    if (this.isLoading) return true;

    if (!this.rootStore) return false;

    const entityTypeToResource: Record<EntityType, Resource> = {
      [EntityType.contact]: Resource.contacts,
      [EntityType.organization]: Resource.organizations,
      [EntityType.deal]: Resource.deals,
      [EntityType.service]: Resource.services,
      [EntityType.task]: Resource.tasks,
    };

    const resource = entityTypeToResource[this.form.entityType];
    if (!resource) return false;

    return !this.rootStore.userStore.canManage(resource);
  }

  get customColumns() {
    return this.tableStoreMap[this.form.entityType].customColumns;
  }

  private get tableStoreMap() {
    return {
      contact: this.rootStore.contactsStore,
      organization: this.rootStore.organizationsStore,
      deal: this.rootStore.dealsStore,
      service: this.rootStore.servicesStore,
      task: this.rootStore.tasksStore,
    } as const;
  }

  private get entityModalMap() {
    return {
      contact: this.rootStore.contactModalStore,
      organization: this.rootStore.organizationModalStore,
      deal: this.rootStore.dealModalStore,
      service: this.rootStore.serviceModalStore,
      task: this.rootStore.taskModalStore,
    } as const;
  }

  initialize = (type: CustomColumnType, entityType: EntityType) => {
    this.onInitOrRefresh(this.createFormData({ type, entityType }));
  };

  openWithColumn = (column: CustomColumnDto) => {
    this.onInitOrRefresh(
      this.createFormData({
        type: column.type,
        entityType: column.entityType,
        id: column.id,
        label: column.label,
        currency: column.type === CustomColumnType.currency ? column.options?.currency : undefined,
        options:
          column.type === CustomColumnType.singleSelect
            ? column.options.options.map((option, index) => ({
                ...option,
                index: option.index ?? index,
              }))
            : [],
        emailOptions: column.type === CustomColumnType.email ? column.options : undefined,
        phoneOptions: column.type === CustomColumnType.phone ? column.options : undefined,
        linkOptions: column.type === CustomColumnType.link ? column.options : undefined,
        dateOptions: column.type === CustomColumnType.date ? column.options : undefined,
        dateTimeOptions: column.type === CustomColumnType.dateTime ? column.options : undefined,
      }),
    );
    this.open();
  };

  changeType = (type: CustomColumnType) => {
    this.onInitOrRefresh(
      this.createFormData({
        type,
        entityType: this.form.entityType,
        id: this.form.id,
        label: this.form.label,
      }),
    );
  };

  toggleDefaultOption = (option: CustomColumnOption) => {
    if (this.form.type !== CustomColumnType.singleSelect) return;

    const innerOptions = this.form.options.options;

    const index = innerOptions.findIndex((opt) => opt.value === option.value);
    if (index === -1) return;

    const options = [...innerOptions];
    options[index].isDefault = !options[index].isDefault;

    innerOptions.forEach((opt, idx) => {
      if (idx !== index && opt.isDefault) options[idx].isDefault = false;
    });

    this.form = {
      ...this.form,
      options: { options },
    };
  };

  addOption = () => {
    if (this.form.type !== CustomColumnType.singleSelect) return;

    const currentOptions = this.form.options.options;
    const newOption = {
      value: crypto.randomUUID(),
      label: "Option " + (currentOptions.length + 1),
      color: "default" as const,
      isDefault: currentOptions.length === 0,
      index: currentOptions.length,
    };

    this.form = {
      ...this.form,
      options: {
        options: [...currentOptions, newOption],
      },
    };
  };

  reorderOptions = (oldIndex: number, newIndex: number) => {
    if (this.form.type !== CustomColumnType.singleSelect) return;

    const options = [...this.form.options.options].sort((a, b) => a.index - b.index);
    const [moved] = options.splice(oldIndex, 1);
    options.splice(newIndex, 0, moved);

    const reordered = options.map((opt, idx) => ({ ...opt, index: idx }));

    this.form = {
      ...this.form,
      options: {
        options: reordered,
      },
    };
  };

  deleteOption = (option: CustomColumnOption) => {
    if (this.form.type !== CustomColumnType.singleSelect) return;

    const innerOptions = this.form.options.options;
    const index = innerOptions.findIndex((opt) => opt.value === option.value);
    if (index === -1) return;

    const options = [...innerOptions];
    const wasDefault = options[index].isDefault;

    options.splice(index, 1);

    if (wasDefault && options.length > 0) options[0].isDefault = true;

    this.form = {
      ...this.form,
      options: { options },
    };
  };

  deleteColumn = async () => {
    if (!this.form.id) return;

    this.setIsLoading(true);

    try {
      await deleteCustomColumnAction(this.form.id);

      await this.refresh();
      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await upsertCustomColumnAction(toJS(this.form));
      if (res.ok) {
        await this.refresh();
        this.close();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };

  private refresh = async () => {
    const modalStore = this.entityModalMap[this.form.entityType];
    const tableStore = this.tableStoreMap[this.form.entityType];
    const entityId = modalStore.form.id;

    await tableStore.refresh();
    if (entityId) await modalStore.loadById(entityId);
    else await modalStore.add();
  };

  private createFormData(params: {
    type: CustomColumnType;
    entityType: EntityType;
    id?: string;
    label?: string;
    currency?: Currency;
    options?: CustomColumnOption[];
    emailOptions?: { color?: ChipColor; allowMultiple?: boolean };
    phoneOptions?: { color?: ChipColor; allowMultiple?: boolean };
    linkOptions?: { color?: ChipColor; allowMultiple?: boolean };
    dateOptions?: {
      displayFormat?: DateDisplayFormat;
    };
    dateTimeOptions?: {
      displayFormat?: DateDisplayFormat;
    };
  }): UpsertCustomColumnData {
    const base = {
      id: params.id,
      label: params.label ?? "",
      type: params.type,
      entityType: params.entityType,
    };

    switch (params.type) {
      case CustomColumnType.currency:
        return {
          ...base,
          type: CustomColumnType.currency,
          options: { currency: params.currency || Currency.eur },
        };
      case CustomColumnType.singleSelect:
        const defaultOptions =
          params.options && params.options.length > 0
            ? params.options
            : [
                {
                  value: crypto.randomUUID(),
                  label: "Option 1",
                  color: "default" as const,
                  isDefault: true,
                  index: 0,
                },
              ];

        return {
          ...base,
          type: CustomColumnType.singleSelect,
          options: {
            options: defaultOptions,
          },
        };
      case CustomColumnType.email:
        return {
          ...base,
          type: CustomColumnType.email,
          options: {
            color: params.emailOptions?.color ?? "default",
            allowMultiple: params.emailOptions?.allowMultiple ?? false,
          },
        };
      case CustomColumnType.phone:
        return {
          ...base,
          type: CustomColumnType.phone,
          options: {
            color: params.phoneOptions?.color ?? "default",
            allowMultiple: params.phoneOptions?.allowMultiple ?? false,
          },
        };
      case CustomColumnType.plain:
        return {
          ...base,
          type: CustomColumnType.plain,
        };
      case CustomColumnType.link:
        return {
          ...base,
          type: CustomColumnType.link,
          options: {
            color: params.linkOptions?.color ?? "default",
            allowMultiple: params.linkOptions?.allowMultiple ?? false,
          },
        };
      case CustomColumnType.date:
        return {
          ...base,
          type: CustomColumnType.date,
          options: {
            displayFormat: params.dateOptions?.displayFormat ?? "descriptiveLong",
          },
        };
      case CustomColumnType.dateTime:
        return {
          ...base,
          type: CustomColumnType.dateTime,
          options: {
            displayFormat: params.dateTimeOptions?.displayFormat ?? "descriptiveLong",
          },
        };
    }
  }
}
