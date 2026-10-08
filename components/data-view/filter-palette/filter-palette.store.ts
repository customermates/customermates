import type { Filter } from "@/core/base/base-get.schema";
import type { FilterOperatorKey } from "@/core/base/base-query-builder";
import type { PalettePlan } from "./palette-field-plan";
import type { RootStore } from "@/core/stores/root.store";
import type { FilterTarget, FilterTargetGroup } from "./filter-target";

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
  | { kind: "root"; group?: FilterTargetGroup }
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
  target?: FilterTarget;
  pages: FilterPalettePage[] = [ROOT_PAGE];
  query = "";
  pendingIndex: number | undefined = undefined;
  private autoApplyTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  constructor(rootStore: RootStore, options = { register: true }) {
    super(rootStore, { draft: emptyDraft() }, undefined, options);

    makeObservable(this, {
      target: observable.ref,
      pages: observable.ref,
      query: observable,
      pendingIndex: observable,

      page: computed,
      activeTarget: computed,
      activeGroup: computed,
      appliedFilters: computed,
      isAtFilterLimit: computed,

      openFor: action,
      openGroup: action,
      dispose: action,
      removeFilterAt: action,
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

  get activeGroup(): FilterTargetGroup | undefined {
    const page = this.pages.findLast((page) => page.kind === "root" && page.group);
    return page?.kind === "root" ? page.group : undefined;
  }

  get activeTarget(): FilterTarget | undefined {
    return this.activeGroup?.target ?? this.target;
  }

  override get isDisabled(): boolean {
    return super.isDisabled || this.activeTarget?.isDisabled === true;
  }

  get appliedFilters(): Filter[] {
    return toJS(this.activeTarget?.filters) ?? [];
  }

  get isAtFilterLimit(): boolean {
    return this.appliedFilters.length >= (this.activeTarget?.maxFilters ?? MAX_APPLIED_FILTERS);
  }

  planFor = (field: string): PalettePlan =>
    palettePlan(field, this.activeTarget?.filterableFields ?? [], this.activeTarget?.filterColumns);

  openFor = (target: FilterTarget) => {
    this.cancelPending();
    this.target = target;
    this.pages = [ROOT_PAGE];
    this.query = "";
    this.pendingIndex = undefined;
    this.openWith({ draft: emptyDraft() });
  };

  openGroup = (group: FilterTargetGroup) => {
    this.push({ kind: "root", group });
  };

  dispose = () => {
    this.cancelPending();
    this.target = undefined;
    this.pages = [ROOT_PAGE];
    this.pendingIndex = undefined;
    this.onInitOrRefresh({ draft: emptyDraft() });
    this.isOpen = false;
  };

  removeFilterAt = (index: number) => {
    if (this.isDisabled) return;
    this.cancelPending();
    this.pendingIndex = undefined;
    this.activeTarget?.removeFilterAt(index);
    this.onInitOrRefresh({ draft: emptyDraft() });
  };

  openAt = (target: FilterTarget, page: FilterPalettePage) => {
    this.openFor(target);
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
    if (this.isDisabled) return;
    const existing = this.activeTarget?.uniqueFields?.includes(field)
      ? this.appliedFilters.findIndex((filter) => filter.field === field)
      : -1;
    if (existing !== undefined && existing >= 0) {
      this.editFilterAt(existing);
      return;
    }
    if (this.activeTarget?.canAddField ? !this.activeTarget.canAddField(field) : this.isAtFilterLimit) return;
    const nested = this.activeTarget?.openField?.(field);
    if (nested) {
      this.openGroup(nested.group);
      this.push({ kind: "value", field: nested.field });
    } else this.push({ kind: "value", field });
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

    const target = this.activeTarget;
    if (!target || this.isDisabled) return;

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
      this.applyFilters(target, filters);
      return;
    }

    if (index === undefined) {
      if (target.canAddField ? !target.canAddField(draft.field) : this.isAtFilterLimit) {
        this.markCommitted();
        return;
      }

      filters.push(applied);
      this.pendingIndex = filters.length - 1;
    } else filters[index] = applied;

    this.applyFilters(target, filters);
  };

  clearFilters = () => {
    if (this.isDisabled) return;
    const target = this.activeTarget;
    this.cancelPending();
    this.pendingIndex = undefined;
    this.pages = this.pages.filter((page) => page.kind === "root");
    this.query = "";
    this.onInitOrRefresh({ draft: emptyDraft() });
    target?.setQueryOptions({ filters: [], forceRefresh: true, refreshMode: "background" });
  };

  protected override afterChange(id: string): void {
    if (!this.isOpen || !this.activeTarget || this.isDisabled) return;
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
    return this.activeTarget?.filterColumns;
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

  private applyFilters = (target: FilterTarget, filters: Filter[]) => {
    target.setQueryOptions({ filters, refreshMode: "background" });
    this.markCommitted();
  };

  private markCommitted = () => {
    this.onInitOrRefresh({});
  };
}
