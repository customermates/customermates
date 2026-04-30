import type { FormEvent } from "react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertFilterPresetData } from "@/features/p13n/upsert-filter-preset.interactor";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";

import { makeObservable, action, observable, computed, reaction, toJS } from "mobx";

import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { upsertFilterPresetAction, deleteFilterPresetAction } from "@/app/actions";
import { BaseModalStore } from "@/core/base/base-modal.store";

export class EditFiltersModalStore extends BaseModalStore<UpsertFilterPresetData> {
  tableStore?: BaseDataViewStore<HasId>;
  expandedField: string | undefined = undefined;

  constructor(public readonly rootStore: RootStore) {
    super(rootStore, { filters: [], presetId: undefined, name: "", p13nId: "" });

    makeObservable(this, {
      tableStore: observable,
      expandedField: observable,

      savedPresets: computed,
      isEditingPreset: computed,
      isCreatingPreset: computed,

      openFor: action,
      onSubmit: action,
      deletePreset: action,
      setExpandedField: action,
    });

    reaction(
      () => this.form.presetId,
      (id) => this.updateFormFromPresetId(id),
    );
  }

  setExpandedField = (field: string | undefined) => {
    this.expandedField = field;
  };

  get isEditingPreset() {
    return this.form.presetId !== undefined && this.form.presetId !== "new";
  }

  get savedPresets() {
    const presets = this.tableStore?.savedFilterPresets;
    return Array.isArray(presets) ? presets : [];
  }

  get isCreatingPreset() {
    return this.form.presetId === "new";
  }

  private updateFormFromPresetId = (presetId: string | undefined) => {
    if (!this.isOpen) return;

    if (presetId === "new") {
      this.onChange("presetId", "new");
      this.onChange("name", "");
    } else if (presetId) {
      const preset = this.tableStore?.savedFilterPresets?.find((p) => p.id === presetId);
      if (preset) {
        this.form = {
          filters: this.mergeFiltersWithFilterableFields(this.tableStore?.filterableFields ?? [], preset.filters),
          presetId: presetId,
          p13nId: this.tableStore?.p13nId ?? "",
          name: preset.name,
        };
      }
    } else {
      this.onChange("presetId", undefined);
      this.onChange("name", "");
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const validFilters = toJS(this.form.filters).filter(hasValidFilterConfiguration);

      if (this.tableStore?.p13nId && (this.isEditingPreset || this.isCreatingPreset)) {
        const presetId = this.isCreatingPreset ? undefined : this.form.presetId;

        const res = await upsertFilterPresetAction({
          p13nId: this.form.p13nId,
          name: this.form.name,
          presetId,
          filters: validFilters,
        });

        if (!res.ok) {
          this.setError(res.error);
          this.setIsLoading(false);
          return;
        }
      }

      this.close();
      this.tableStore?.setQueryOptions({ filters: validFilters, forceRefresh: true });
    } finally {
      this.setIsLoading(false);
    }
  };

  openFor = (tableStore: BaseDataViewStore<any>, expandField?: string) => {
    this.tableStore = tableStore;
    const filterableFields = this.tableStore?.filterableFields ?? [];
    const currentFilters = tableStore.filters ?? [];

    const allFilters = this.mergeFiltersWithFilterableFields(filterableFields, currentFilters);

    this.onInitOrRefresh({
      p13nId: tableStore.p13nId,
      filters: allFilters,
      presetId: undefined,
      name: "",
    });
    this.expandedField = expandField;
    this.open();
  };

  deletePreset = async () => {
    if (!this.form.presetId || !this.tableStore?.p13nId) return;

    await deleteFilterPresetAction({
      p13nId: this.tableStore.p13nId,
      presetId: this.form.presetId,
    });

    this.tableStore?.setQueryOptions({ filters: [], forceRefresh: true });
    this.close();
  };

  private mergeFiltersWithFilterableFields = (filterableFields: FilterableField[], currentFilters: Filter[]) => {
    const existingFiltersMap = new Map<string, Filter>();
    currentFilters.forEach((filter) => {
      existingFiltersMap.set(filter.field, filter);
    });

    return filterableFields.map((field) => {
      const existingFilter = existingFiltersMap.get(field.field);

      if (existingFilter) {
        return {
          field: existingFilter.field,
          operator: existingFilter.operator,
          ...("value" in existingFilter ? { value: existingFilter.value } : {}),
        };
      }

      return {
        field: field.field,
        operator: undefined,
        value: undefined,
      };
    }) as UpsertFilterPresetData["filters"];
  };
}
