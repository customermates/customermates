import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { Filter } from "@/core/base/base-get.schema";
import type { FilterOperatorKey } from "@/core/base/base-query-builder";
import type { PalettePlan } from "./palette-field-plan";
import type { RootStore } from "@/core/stores/root.store";

import { action, computed, makeObservable, observable, toJS } from "mobx";

import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { isStandaloneOperator } from "@/core/base/base-query-builder";
import { nextFilterSelection } from "@/components/data-view/filter-modal/inputs/filter-selection";
import { shouldPreserveFilterValue } from "@/components/data-view/filter-modal/filter-value-class";
import { BaseModalStore } from "@/core/base/base-modal.store";

import { palettePlan, toAppliedFilter } from "./palette-field-plan";

export const FILTER_AUTO_APPLY_DELAY_MS = 300;

export const MAX_APPLIED_FILTERS = 50;

export type FilterPalettePage =
  | { kind: "root" }
  | { kind: "value"; field: string; editIndex?: number }
  | { kind: "dateInput"; field: string; operator: FilterOperatorKey; editIndex?: number };

export type PaletteDraft = {
  field: string;
  operator: FilterOperatorKey | undefined;
  value: unknown;
};

type FilterPaletteForm = { draft: PaletteDraft };

const DRAFT_PATH_PREFIX = "draft";

const ROOT_PAGE: FilterPalettePage = { kind: "root" };

function emptyDraft(): PaletteDraft {
  return { field: "", operator: undefined, value: undefined };
}

export class FilterPaletteStore extends BaseModalStore<FilterPaletteForm> {
  tableStore?: BaseDataViewStore<HasId>;
  pages: FilterPalettePage[] = [ROOT_PAGE];
  query = "";
  pendingIndex: number | undefined = undefined;
  private autoApplyTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  constructor(rootStore: RootStore) {
    super(rootStore, { draft: emptyDraft() });

    makeObservable(this, {
      tableStore: observable.ref,
      pages: observable.ref,
      query: observable,
      pendingIndex: observable,

      page: computed,
      appliedFilters: computed,
      isAtFilterLimit: computed,

      openFor: action,
      openAt: action,
      push: action,
      pop: action,
      setQuery: action,
      pickField: action,
      setDraftOperator: action,
      editFilterAt: action,
      pushDateInput: action,
      toggleValue: action,
      commitNow: action,
      commitDraft: action,
      clearFilters: action,
    });
  }

  get page(): FilterPalettePage {
    return this.pages[this.pages.length - 1] ?? ROOT_PAGE;
  }

  get appliedFilters(): Filter[] {
    return toJS(this.tableStore?.filters) ?? [];
  }

  get isAtFilterLimit(): boolean {
    return this.appliedFilters.length >= MAX_APPLIED_FILTERS;
  }

  planFor = (field: string): PalettePlan =>
    palettePlan(field, this.tableStore?.filterableFields ?? [], this.tableStore?.customColumns);

  openFor = (tableStore: BaseDataViewStore<any>) => {
    this.cancelPending();
    this.tableStore = tableStore;
    this.pages = [ROOT_PAGE];
    this.query = "";
    this.pendingIndex = undefined;
    this.openWith({ draft: emptyDraft() });
  };

  openAt = (tableStore: BaseDataViewStore<any>, page: FilterPalettePage) => {
    this.openFor(tableStore);
    if (page.kind !== "root") this.push(page);
  };

  setQuery = (query: string) => {
    this.query = query;
  };

  push = (page: FilterPalettePage) => {
    this.flushPendingChanges();
    this.pages = [...this.pages, page];
    this.query = "";
    this.seedDraftFor(page);
  };

  pop = () => {
    this.flushPendingChanges();

    if (this.pages.length <= 1) {
      this.close();
      return;
    }

    this.pages = this.pages.slice(0, -1);
    this.query = "";
    this.seedDraftFor(this.page);
  };

  pickField = (field: string) => {
    if (this.isAtFilterLimit) return;

    this.push({ kind: "value", field });
  };

  editFilterAt = (index: number) => {
    const filter = this.appliedFilters[index];
    if (!filter) return;

    this.push({ kind: "value", field: filter.field, editIndex: index });
  };

  pushDateInput = (operator: FilterOperatorKey) => {
    const page = this.page;
    if (page.kind === "root") return;

    this.push({ kind: "dateInput", field: page.field, operator, editIndex: page.editIndex });
  };

  toggleValue = (key: string, maxSelectedValues?: number) => {
    const selected = this.selectedValues;

    this.onChange("draft.value", nextFilterSelection(selected, key, maxSelectedValues));
  };

  get selectedValues(): string[] {
    const value = toJS(this.form.draft.value);

    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  }

  setDraftOperator = (operator: FilterOperatorKey) => {
    this.cancelPending();

    const draft = toJS(this.form.draft);
    const previous = { field: draft.field, operator: draft.operator, value: draft.value } as Filter;
    const keepsValue = Boolean(draft.operator) && shouldPreserveFilterValue(previous, operator, this.customColumns);

    this.onInitOrRefresh({ draft: { ...draft, operator, value: keepsValue ? draft.value : undefined } });

    if (keepsValue || isStandaloneOperator(operator)) this.commitDraft();
  };

  commitNow = (patch: Partial<PaletteDraft>) => {
    this.cancelPending();
    this.onInitOrRefresh({ draft: { ...toJS(this.form.draft), ...patch } });
    this.commitDraft();
  };

  commitDebounced = () => {
    this.cancelPending();
    this.autoApplyTimer = setTimeout(() => {
      this.autoApplyTimer = undefined;
      this.commitDraft();
    }, FILTER_AUTO_APPLY_DELAY_MS);
  };

  cancelPending = () => {
    if (this.autoApplyTimer === undefined) return;

    clearTimeout(this.autoApplyTimer);
    this.autoApplyTimer = undefined;
  };

  flushPendingChanges = () => {
    if (this.autoApplyTimer === undefined) return;

    this.cancelPending();
    this.commitDraft();
  };

  commitDraft = () => {
    this.cancelPending();

    const tableStore = this.tableStore;
    if (!tableStore) return;

    const draft = toJS(this.form.draft);
    const filters = [...this.appliedFilters];
    const index = this.boundIndex(draft.field);
    const applied = this.draftFilter(draft);

    if (!applied) {
      if (index === undefined) {
        this.markCommitted();
        return;
      }

      filters.splice(index, 1);
      this.pendingIndex = undefined;
      this.applyFilters(tableStore, filters);
      return;
    }

    if (index === undefined) {
      if (filters.length >= MAX_APPLIED_FILTERS) {
        this.markCommitted();
        return;
      }

      filters.push(applied);
      this.pendingIndex = filters.length - 1;
    } else filters[index] = applied;

    this.applyFilters(tableStore, filters);
  };

  clearFilters = () => {
    this.cancelPending();
    this.pendingIndex = undefined;
    this.pages = [ROOT_PAGE];
    this.query = "";
    this.onInitOrRefresh({ draft: emptyDraft() });
    this.tableStore?.setQueryOptions({ filters: [], forceRefresh: true, refreshMode: "background" });
  };

  protected override afterChange(id: string): void {
    if (!this.isOpen || !this.tableStore) return;
    if (!id.startsWith(DRAFT_PATH_PREFIX)) return;

    this.commitDebounced();
  }

  protected override prepareToClose(): boolean {
    this.flushPendingChanges();
    return true;
  }

  private seedDraftFor = (page: FilterPalettePage) => {
    if (page.kind === "root") {
      this.pendingIndex = undefined;
      this.onInitOrRefresh({ draft: emptyDraft() });
      return;
    }

    const bound = page.editIndex ?? this.boundIndex(page.field);
    const existing = bound === undefined ? undefined : this.appliedFilters[bound];
    const operator =
      page.kind === "dateInput" ? page.operator : (existing?.operator ?? this.planFor(page.field).impliedOperator);
    const keepsValue = Boolean(existing) && shouldPreserveFilterValue(existing as Filter, operator, this.customColumns);

    this.pendingIndex = existing ? bound : undefined;
    this.onInitOrRefresh({
      draft: {
        field: page.field,
        operator,
        value: keepsValue && existing && "value" in existing ? existing.value : undefined,
      },
    });
  };

  private get customColumns() {
    return this.tableStore?.customColumns;
  }

  private boundIndex = (field: string): number | undefined => {
    const index = this.pendingIndex;
    if (index === undefined) return undefined;

    return this.appliedFilters[index]?.field === field ? index : undefined;
  };

  private draftFilter = (draft: PaletteDraft): Filter | undefined => {
    if (!draft.field || !draft.operator) return undefined;

    const candidate = { field: draft.field, operator: draft.operator, value: draft.value } as Filter;
    if (!hasValidFilterConfiguration(candidate)) return undefined;

    return toAppliedFilter(candidate);
  };

  private applyFilters = (tableStore: BaseDataViewStore<HasId>, filters: Filter[]) => {
    tableStore.setQueryOptions({ filters, refreshMode: "background" });
    this.markCommitted();
  };

  private markCommitted = () => {
    this.onInitOrRefresh({});
  };
}
