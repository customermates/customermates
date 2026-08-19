import type { FormEvent } from "react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertFilterPresetData } from "@/features/p13n/upsert-filter-preset.interactor";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";

import { makeObservable, action, observable, computed, reaction, toJS } from "mobx";

import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { upsertFilterPresetAction, deleteFilterPresetAction } from "@/app/actions";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export const FILTER_AUTO_APPLY_DELAY_MS = 300;

const FILTER_DRAFT_PATH_PREFIX = "filters";

export class EditFiltersModalStore extends BaseModalStore<UpsertFilterPresetData> {
  tableStore?: BaseDataViewStore<HasId>;
  expandedField: string | undefined = undefined;
  private autoApplyTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  constructor(rootStore: RootStore) {
    super(rootStore, {
      filters: [],
      presetId: undefined,
      name: "",
      p13nId: "",
    });

    makeObservable(this, {
      tableStore: observable,
      expandedField: observable,

      savedPresets: computed,
      isEditingPreset: computed,
      isCreatingPreset: computed,
      isPresetMode: computed,

      openFor: action,
      onSubmit: action,
      deletePreset: action,
      setExpandedField: action,
      syncDraftFromTable: action,
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

  get isPresetMode() {
    return this.isCreatingPreset || this.isEditingPreset;
  }

  protected override afterChange(id: string): void {
    if (!this.isOpen || !this.tableStore) return;
    if (!id.startsWith(FILTER_DRAFT_PATH_PREFIX)) return;

    this.scheduleAutoApply();
  }

  private scheduleAutoApply = () => {
    this.cancelPendingAutoApply();
    this.autoApplyTimer = setTimeout(() => {
      this.autoApplyTimer = undefined;
      this.autoApply();
    }, FILTER_AUTO_APPLY_DELAY_MS);
  };

  cancelPendingAutoApply = () => {
    if (this.autoApplyTimer === undefined) return;

    clearTimeout(this.autoApplyTimer);
    this.autoApplyTimer = undefined;
  };

  flushPendingChanges = () => {
    if (this.autoApplyTimer === undefined) return;

    this.cancelPendingAutoApply();
    this.autoApply();
  };

  private autoApply = () => {
    this.applyDraftToTable();
    if (!this.isPresetMode) this.markDraftApplied();
  };

  private applyDraftToTable = () => {
    const tableStore = this.tableStore;
    if (!tableStore) return;

    tableStore.setQueryOptions({ filters: this.validDraftFilters(), refreshMode: "background" });
  };

  private validDraftFilters = (): Filter[] =>
    toJS(this.form.filters ?? [])
      .filter(hasValidFilterConfiguration)
      .map((filter) =>
        filter.operator === FilterOperatorKey.hasSome || filter.operator === FilterOperatorKey.hasNone
          ? { field: filter.field, operator: filter.operator }
          : filter,
      );

  private markDraftApplied = () => {
    this.onInitOrRefresh({});
  };

  private updateFormFromPresetId = (presetId: string | undefined) => {
    if (!this.isOpen) return;

    if (presetId === "new") {
      this.onChange("presetId", "new");
      this.onChange("name", "");
      return;
    }

    if (!presetId) {
      this.onChange("presetId", undefined);
      this.onChange("name", "");
      return;
    }

    const preset = this.tableStore?.savedFilterPresets?.find((p) => p.id === presetId);
    if (!preset) return;

    this.cancelPendingAutoApply();
    this.form = {
      filters: this.mergeFiltersWithFilterableFields(this.tableStore?.filterableFields ?? [], preset.filters),
      presetId: presetId,
      p13nId: this.tableStore?.p13nId ?? "",
      name: preset.name,
    };
    this.markDraftApplied();
    this.applyDraftToTable();
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.flushPendingChanges();

    if (!this.isPresetMode) return;
    if (!this.tableStore?.p13nId) {
      this.close();
      return;
    }

    this.setIsLoading(true);

    try {
      const res = await upsertFilterPresetAction({
        p13nId: this.form.p13nId,
        name: this.form.name,
        presetId: this.isCreatingPreset ? undefined : this.form.presetId,
        filters: this.validDraftFilters(),
      });

      if (!res.ok) {
        this.setError(res.error);
        return;
      }

      this.markDraftApplied();
      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  openFor = (tableStore: BaseDataViewStore<any>, expandField?: string) => {
    this.cancelPendingAutoApply();
    this.tableStore = tableStore;
    const filterableFields = this.tableStore?.filterableFields ?? [];
    const currentFilters = tableStore.filters ?? [];

    const allFilters = this.mergeFiltersWithFilterableFields(filterableFields, currentFilters);

    this.expandedField = expandField;
    this.openWith({
      p13nId: tableStore.p13nId,
      filters: allFilters,
      presetId: undefined,
      name: "",
    });
  };

  syncDraftFromTable = (tableStore: BaseDataViewStore<any>) => {
    if (!this.isOpen || this.tableStore !== tableStore) return;

    this.cancelPendingAutoApply();
    this.form = {
      ...this.form,
      filters: this.mergeFiltersWithFilterableFields(tableStore.filterableFields ?? [], tableStore.filters ?? []),
    };
    if (!this.isPresetMode) this.markDraftApplied();
  };

  deletePreset = async () => {
    if (!this.form.presetId || !this.tableStore?.p13nId) return;

    const res = await deleteFilterPresetAction({
      p13nId: this.tableStore.p13nId,
      presetId: this.form.presetId,
    });
    if (!res.ok) {
      toastZodErrorTree(res.error);
      return;
    }

    this.cancelPendingAutoApply();
    this.tableStore?.setQueryOptions({ filters: [], forceRefresh: true, refreshMode: "background" });
    this.close();
  };

  protected override prepareToClose(): boolean {
    this.flushPendingChanges();
    return true;
  }

  private mergeFiltersWithFilterableFields = (filterableFields: FilterableField[], currentFilters: Filter[]) => {
    const existingFiltersMap = new Map<string, Filter>();
    const knownFilters = Array.isArray(currentFilters) ? currentFilters : [];

    knownFilters.forEach((filter) => {
      if (!filter || typeof filter !== "object") return;
      if (typeof filter.field !== "string") return;

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
