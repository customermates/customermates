import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { BaseDataViewStore } from "./base-data-view.store";
import type { CustomFieldValueDto } from "./base-entity.schema";

import { action, computed, makeObservable, observable, toJS } from "mobx";
import { CustomColumnType } from "@/generated/prisma";

import type { Resource } from "@/generated/prisma";

import { BaseModalStore } from "./base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import type { GlobalSearchResultItem } from "@/features/search/global-search.interactor";

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

type EntityActionResult<T> = { ok: true; data: T } | { ok: false; error: unknown };

export type EntityLoadState = "idle" | "loading" | "ready" | "not-found" | "error";

type EntityActions<TForm, TDto extends EntityDto> = {
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
  public lastCreatedId: string | null = null;
  public requestedEntityId: string | null = null;
  public entityLoadState: EntityLoadState = "idle";
  private entityLoadGeneration = 0;

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
      lastCreatedId: observable,
      requestedEntityId: observable,
      entityLoadState: observable,

      add: action,
      delete: action,
      loadById: action,
      hydrate: action,
      recordRecentItem: action,
      initialize: action,
      onSubmit: action,
      consumeLastCreatedId: action,

      customColumns: computed,
    });
  }

  consumeLastCreatedId = (): string | null => {
    const id = this.lastCreatedId;
    this.lastCreatedId = null;
    return id;
  };

  get customColumns() {
    return this.entityStore.customColumns;
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
    this.onInitOrRefresh({
      id: undefined,
      ...this.initFormWithCustomFieldValues(),
    });
  };

  add = async (): Promise<boolean> => {
    const generation = ++this.entityLoadGeneration;
    this.fetchedEntity = null;
    this.requestedEntityId = null;
    this.entityLoadState = "idle";
    this.setIsLoading(false);

    if (this.customColumns.length === 0) {
      try {
        await this.rootStore.loadingOverlayStore.withLoading(() => this.entityStore.refreshCustomColumns());
      } catch {
        if (this.entityLoadGeneration === generation) this.entityLoadState = "error";
        return false;
      }
    }

    if (this.entityLoadGeneration !== generation) return false;

    this.initialize();
    this.open();
    return true;
  };

  delete = async (): Promise<boolean> => {
    const id = this.form.id;
    if (!id) return false;

    this.setIsLoading(true);

    try {
      const res = await this.actions.delete({ id });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.entityStore.removeItem(id);
      this.rootStore.globalSearchModalStore.removeRecentItem(id);
      this.close();
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  loadById = async (id: string): Promise<boolean> => {
    const generation = ++this.entityLoadGeneration;
    const isCurrentRequest = () => this.entityLoadGeneration === generation && this.requestedEntityId === id;

    this.fetchedEntity = null;
    this.requestedEntityId = id;
    this.entityLoadState = "loading";
    this.initialize();
    this.setIsLoading(true);

    try {
      const result = await this.actions.getById({ id });
      if (!isCurrentRequest()) return false;

      if (result.entity) {
        this.hydrate(result.entity, result.customColumns);
        this.recordRecentItem(result.entity);
        return true;
      } else {
        this.entityStore.setCustomColumns(result.customColumns);
        this.entityLoadState = "not-found";
        this.close();
        return false;
      }
    } catch {
      if (!isCurrentRequest()) return false;
      this.entityLoadState = "error";
      return false;
    } finally {
      if (isCurrentRequest()) this.setIsLoading(false);
    }
  };

  hydrate = (entity: TDto, customColumns: CustomColumnDto[]) => {
    const currentIds = new Set(this.entityStore.customColumns.map((column) => column.id));
    const columnsUnchanged =
      this.entityStore.customColumns.length === customColumns.length &&
      customColumns.every((column) => currentIds.has(column.id));
    if (!columnsUnchanged) this.entityStore.setCustomColumns(customColumns);
    this.fetchedEntity = entity;
    this.entityLoadState = "ready";
    this.setError(undefined);
    const formData = this.initFormWithCustomFieldValues(entity);
    this.onInitOrRefresh(formData);
  };

  recordRecentItem = (entity: TDto) => {
    const recentItem = this.buildRecentSearchItem(entity);
    if (recentItem) this.rootStore.globalSearchModalStore.pushRecentItem(recentItem);
  };

  protected buildRecentSearchItem(_entity: TDto): GlobalSearchResultItem | null {
    return null;
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (this.form.id && !this.hasUnsavedChanges) return;

    this.setIsLoading(true);

    try {
      const formData = toJS(this.form);
      const res = formData.id
        ? await this.actions.update({ ...formData, id: formData.id })
        : await this.actions.create(formData);
      const isCreate = !formData.id;

      if (res.ok) {
        this.setError(undefined);
        await this.entityStore.upsertItem(res.data);
        if (this.fetchedEntity) this.fetchedEntity = res.data;
        this.onInitOrRefresh(this.initFormWithCustomFieldValues(res.data));
        if (isCreate) this.lastCreatedId = res.data.id;
        this.rootStore.activitiesStore.refreshFor(res.data.id);
        this.close();
      } else this.setError(res.error as any);
    } finally {
      this.setIsLoading(false);
    }
  };
}
