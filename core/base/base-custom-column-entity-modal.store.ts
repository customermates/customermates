import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { BaseDataViewStore } from "./base-data-view.store";
import type { CustomFieldValueDto } from "./base-entity.schema";

import { action, computed, makeObservable, observable, toJS } from "mobx";
import { addToast } from "@heroui/toast";
import { CustomColumnType } from "@/generated/prisma";

import type { Resource } from "@/generated/prisma";

import { BaseModalStore } from "./base-modal.store";

export type EntityDto = {
  id: string;
  users: Array<{ id: string }>;
  customFieldValues: CustomFieldValueDto[];
};

export type FormEntityDto = {
  id?: string;
  notes?: any;
  customFieldValues: CustomFieldValueDto[];
};

export type EntityActionResult<T> = { ok: true; data: T } | { ok: false; error: unknown };

export type EntityActions<TForm, TDto extends EntityDto> = {
  getById: (data: { id: string }) => Promise<{ entity: TDto | null; customColumns: CustomColumnDto[] }>;
  create: (data: TForm) => Promise<EntityActionResult<TDto>>;
  update: (data: TForm & { id: string }) => Promise<EntityActionResult<TDto>>;
  delete: (data: { id: string }) => Promise<EntityActionResult<unknown>>;
};

export abstract class BaseCustomColumnEntityModalStore<
  TForm extends FormEntityDto,
  TDto extends EntityDto = EntityDto,
> extends BaseModalStore<TForm> {
  public fetchedEntity: TDto | null = null;

  constructor(
    rootStore: RootStore,
    initialState: TForm,
    resource: Resource,
    protected readonly entityStore: BaseDataViewStore<TDto>,
    protected readonly actions: EntityActions<TForm, TDto>,
  ) {
    super(rootStore, initialState, resource);

    makeObservable(this, {
      fetchedEntity: observable,

      add: action,
      delete: action,
      loadById: action,
      initialize: action,
      onSubmit: action,

      isAssignedToCurrentUser: computed,
      customColumns: computed,
    });
  }

  get customColumns() {
    return this.entityStore.customColumns;
  }

  get isAssignedToCurrentUser(): boolean {
    const userIds = (this.form as { userIds?: string[] }).userIds;
    return userIds?.includes(this.rootStore.userStore.user?.id ?? "") ?? false;
  }

  protected initFormWithCustomFieldValues(entity?: TDto): Partial<TForm> {
    const customFieldValues = this.customColumns.map((column) => {
      if (!entity) {
        return {
          columnId: column.id,
          value:
            column.type === CustomColumnType.singleSelect && column.options?.options
              ? (column.options.options.find((opt) => opt.isDefault)?.value ?? "")
              : "",
        };
      }

      const existingField = entity.customFieldValues.find((field) => field.columnId === column.id);
      return existingField
        ? { columnId: existingField.columnId, value: existingField.value ?? "" }
        : { columnId: column.id, value: "" };
    });

    return { customFieldValues } as Partial<TForm>;
  }

  initialize = () => {
    this.onInitOrRefresh({ id: undefined, ...this.initFormWithCustomFieldValues() });
  };

  add = async () => {
    this.fetchedEntity = null;

    if (this.customColumns.length === 0)
      await this.rootStore.loadingOverlayStore.withLoading(() => this.entityStore.refreshCustomColumns());

    this.initialize();
    this.open();
  };

  delete = async () => {
    const id = this.form.id;
    if (!id) return;

    this.setIsLoading(true);

    try {
      const res = await this.actions.delete({ id });

      if (res.ok) await this.entityStore.removeItem(id);

      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  loadById = async (id: string) => {
    this.fetchedEntity = null;
    this.initialize();
    this.setIsLoading(true);
    this.open();

    try {
      const result = await this.actions.getById({ id });

      this.entityStore.setCustomColumns(result.customColumns);

      if (result.entity) {
        this.fetchedEntity = result.entity;
        this.setError(undefined);

        const formData = this.initFormWithCustomFieldValues(result.entity);
        this.onInitOrRefresh(formData);
      } else this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!(this.canReadAll || this.isAssignedToCurrentUser)) {
      this.isSubmittingWithGuard = true;
      return;
    }

    this.setIsLoading(true);

    try {
      const formData = toJS(this.form);
      const res = formData.id
        ? await this.actions.update({ ...formData, id: formData.id })
        : await this.actions.create(formData);

      if (res.ok) {
        await this.entityStore.upsertItem(res.data);
        this.close();
      } else {
        this.setError(res.error as any);

        const notesError = this.getError("notes");
        if (notesError) addToast({ description: notesError, color: "danger" });
      }
    } finally {
      this.setIsLoading(false);
    }
  };
}
