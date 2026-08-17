import type { FormEvent } from "react";
import type {
  UpsertActivityWidgetData,
  UpsertChartWidgetData,
  UpsertWidgetData,
} from "@/features/widget/upsert-widget.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { CompanyWidget, WidgetDto } from "@/features/widget/widget.schema";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { action, computed, makeObservable, observable, toJS, reaction, runInAction } from "mobx";
import { cloneDeep } from "lodash";
import equal from "fast-deep-equal/es6";
import { EntityType, WidgetGroupByType, AggregationType, Resource, WidgetKind } from "@/generated/prisma";

import { upsertWidgetAction, deleteWidgetAction, getWidgetByIdAction, getCompanyWidgetsAction } from "../actions";

import { ChartColor, DisplayType, supportsDealFilters } from "@/features/widget/widget.schema";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { mergeActivityFiltersForForm } from "./activity-filter-form";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

type WidgetModalSection = "config" | "filters" | "dealFilters" | "activityFilters" | "display";
type WidgetCreationStep = "choose" | "configure";
type ActivityWidgetModalForm = Omit<UpsertActivityWidgetData, "timelineFilters"> & { timelineFilters?: Filter[] };
export type WidgetModalForm = UpsertChartWidgetData | ActivityWidgetModalForm;

type WidgetFormCommon = { id?: string; name: string; isTemplate: boolean };

function getActiveActivityFilters(filterableFields: FilterableField[], filters: Filter[] | undefined) {
  const visibleFields = new Set(filterableFields.map((field) => field.field));
  return (filters ?? []).filter((filter) => visibleFields.has(filter.field) && hasValidFilterConfiguration(filter));
}

function activityFiltersForSave(filters: Filter[] | undefined) {
  return (filters ?? []).filter(hasValidFilterConfiguration).map((filter) => {
    if (filter.operator !== FilterOperatorKey.hasSome && filter.operator !== FilterOperatorKey.hasNone) return filter;

    return { field: filter.field, operator: filter.operator };
  }) as UpsertActivityWidgetData["timelineFilters"];
}

function chartDisplayDefaults(): NonNullable<UpsertChartWidgetData["displayOptions"]> {
  return {
    barColors: [ChartColor.primary1],
    displayType: DisplayType.verticalBarChart,
    reverseXAxis: false,
    reverseYAxis: false,
    useGroupColors: true,
    showLegend: true,
    showFilters: true,
  };
}

function activityDisplayDefaults(): NonNullable<ActivityWidgetModalForm["displayOptions"]> {
  return { showFilters: true };
}

function chartFormDefaults(entityType: EntityType, common?: Partial<WidgetFormCommon>): UpsertChartWidgetData {
  return {
    id: common?.id,
    kind: WidgetKind.chart,
    name: common?.name ?? "",
    entityType,
    entityFilters: undefined,
    dealFilters: undefined,
    displayOptions: chartDisplayDefaults(),
    groupByType: WidgetGroupByType.none,
    groupByCustomColumnId: undefined,
    aggregationType: AggregationType.count,
    isTemplate: common?.isTemplate ?? false,
  };
}

function activityFormDefaults(common?: Partial<WidgetFormCommon>): ActivityWidgetModalForm {
  return {
    id: common?.id,
    kind: WidgetKind.activityTimeline,
    name: common?.name ?? "",
    timelineFilters: [],
    displayOptions: activityDisplayDefaults(),
    isTemplate: common?.isTemplate ?? false,
  };
}

function mergeDisplayOptions<T extends Record<string, unknown>>(defaults: T, saved: Partial<T> | null | undefined): T {
  const merged = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = saved?.[key];
    if (value !== undefined && value !== null) merged[key] = value as T[keyof T];
  }
  return merged;
}

export class WidgetModalStore extends BaseModalStore<WidgetModalForm> {
  public companyWideWidgets: CompanyWidget[] = [];
  public groupByValue: string = WidgetGroupByType.none;
  public expandedSection: WidgetModalSection = "config";
  public expandedFilterField: string | undefined = undefined;
  public creationStep: WidgetCreationStep = "choose";
  public isHydrating = false;
  public activityFilterableFields: FilterableField[] = [];
  private skipReactions = false;
  private loadGeneration = 0;
  private sessionGeneration = 0;
  private companyWidgetsGeneration = 0;
  public filterableFieldsByEntityType: Record<EntityType, FilterableField[]> = {
    [EntityType.contact]: [],
    [EntityType.organization]: [],
    [EntityType.deal]: [],
    [EntityType.service]: [],
    [EntityType.task]: [],
  };
  public customColumnsByEntityType: Record<EntityType, CustomColumnDto[]> = {
    [EntityType.contact]: [],
    [EntityType.organization]: [],
    [EntityType.deal]: [],
    [EntityType.service]: [],
    [EntityType.task]: [],
  };

  private readonly entityTypeToGroupByType: Record<EntityType, WidgetGroupByType | undefined> = {
    [EntityType.contact]: WidgetGroupByType.contact,
    [EntityType.organization]: WidgetGroupByType.organization,
    [EntityType.deal]: WidgetGroupByType.deal,
    [EntityType.service]: WidgetGroupByType.service,
    [EntityType.task]: undefined,
  };

  private readonly entityTypeToResource: Record<EntityType, Resource> = {
    [EntityType.contact]: Resource.contacts,
    [EntityType.organization]: Resource.organizations,
    [EntityType.deal]: Resource.deals,
    [EntityType.service]: Resource.services,
    [EntityType.task]: Resource.tasks,
  };

  private readonly groupByTypeToResource: Record<WidgetGroupByType, Resource | null> = {
    [WidgetGroupByType.none]: null,
    [WidgetGroupByType.contact]: Resource.contacts,
    [WidgetGroupByType.organization]: Resource.organizations,
    [WidgetGroupByType.deal]: Resource.deals,
    [WidgetGroupByType.service]: Resource.services,
    [WidgetGroupByType.customColumn]: null,
  };

  constructor(rootStore: RootStore) {
    super(rootStore, chartFormDefaults(EntityType.deal));

    makeObservable(this, {
      companyWideWidgets: observable,
      groupByValue: observable,
      expandedSection: observable,
      expandedFilterField: observable,
      creationStep: observable,
      isHydrating: observable,
      activityFilterableFields: observable,
      filterableFieldsByEntityType: observable,
      customColumnsByEntityType: observable,

      add: action,
      delete: action,
      onSubmit: action,
      loadById: action,
      loadTemplate: action,
      fetchCompanyWidgets: action,
      onGroupByChange: action,
      setFilterableFields: action,
      setActivityFilterableFields: action,
      clearActivityThreadFilter: action,
      setCustomColumns: action,
      setExpandedSection: action,
      setExpandedFilterField: action,
      setCreationStep: action,
      startFromKind: action,
      openWithFilter: action,

      groupBySelectOptions: computed,
      groupBySelectValue: computed,
      aggregationTypeOptions: computed,
      filterableFields: computed,
      dealFilterableFields: computed,
      customColumns: computed,
      activeFiltersCount: computed,
      activeDealFiltersCount: computed,
      activeTimelineFilters: computed,
      activeTimelineFiltersCount: computed,
      previewTimelineFilters: computed,
      showDealFiltersTab: computed,
      availableEntityTypes: computed,
      availableKinds: computed,
    });

    this.resetFormDefaultsOnEntityTypeChange();
    this.preventEntityTypeGroupingWhenCounting();
    this.updateFormStateWhenGroupByValueChanges();
    this.updateGroupByValueWhenFormStateChanges();
    reaction(
      () => this.isOpen,
      (isOpen) => {
        if (!isOpen) runInAction(() => this.advanceSession());
      },
    );
  }

  private get chartForm(): UpsertChartWidgetData | undefined {
    return this.form.kind === WidgetKind.chart ? this.form : undefined;
  }

  get customColumns() {
    const form = this.chartForm;
    return form ? (this.customColumnsByEntityType[form.entityType] ?? []) : [];
  }

  get filterableFields() {
    const form = this.chartForm;
    return form ? (this.filterableFieldsByEntityType[form.entityType] ?? []) : [];
  }

  get dealFilterableFields() {
    return this.filterableFieldsByEntityType[EntityType.deal] ?? [];
  }

  get activeFiltersCount() {
    return (this.chartForm?.entityFilters || []).filter(hasValidFilterConfiguration).length;
  }

  get activeDealFiltersCount() {
    if (!this.showDealFiltersTab) return 0;
    return (this.chartForm?.dealFilters || []).filter(hasValidFilterConfiguration).length;
  }

  get activeTimelineFiltersCount() {
    return this.activeTimelineFilters.length;
  }

  get activeTimelineFilters() {
    const filters = this.form.kind === WidgetKind.activityTimeline ? this.form.timelineFilters : undefined;
    return getActiveActivityFilters(this.activityFilterableFields, filters);
  }

  get previewTimelineFilters() {
    if (this.form.kind !== WidgetKind.activityTimeline) return [];
    return activityFiltersForSave(this.form.timelineFilters) ?? [];
  }

  get showDealFiltersTab() {
    const form = this.chartForm;
    if (!form) return false;

    return supportsDealFilters(form);
  }

  get availableEntityTypes() {
    return Object.values(EntityType).filter((entityType) => {
      const resource = this.entityTypeToResource[entityType];

      return this.rootStore.userStore.canAccess(resource);
    });
  }

  get availableKinds() {
    const kinds: WidgetKind[] = [];

    if (this.availableEntityTypes.length) kinds.push(WidgetKind.chart);

    if (this.activityFilterableFields.length) kinds.push(WidgetKind.activityTimeline);

    return kinds;
  }

  get aggregationTypeOptions() {
    const base = [{ key: AggregationType.count }];
    const canAccessDeals = this.rootStore.userStore.canAccess(Resource.deals);
    const form = this.chartForm;

    if (!form || !canAccessDeals) return form ? base : [];

    if (form.entityType === EntityType.task) return base;

    if (form.entityType === EntityType.service)
      return [...base, { key: AggregationType.dealValue }, { key: AggregationType.dealQuantity }];

    return [...base, { key: AggregationType.dealValue }];
  }

  get groupBySelectOptions() {
    const form = this.chartForm;
    if (!form) return [];

    const options: Array<{
      key: string;
      label?: string;
      entityType?: EntityType;
    }> = [{ key: WidgetGroupByType.none }];

    if (form.aggregationType !== AggregationType.count) {
      const groupByType = this.entityTypeToGroupByType[form.entityType];
      if (groupByType) {
        const resource = this.groupByTypeToResource[groupByType];
        if (resource && this.rootStore.userStore.canAccess(resource)) options.push({ key: groupByType });
      }
    }

    const custom = this.customColumns
      .filter((c) => {
        const canAccessEntity = this.rootStore.userStore.canAccess(this.entityTypeToResource[c.entityType]);
        return c.entityType === form.entityType && c.type === "singleSelect" && canAccessEntity;
      })
      .map((c) => ({
        key: `custom:${c.id}`,
        entityType: c.entityType,
        label: c.label,
      }));

    return [...options, ...custom];
  }

  get groupBySelectValue() {
    return this.groupByValue;
  }

  onGroupByChange = (value: string) => {
    if (!value || !this.chartForm) return;
    this.groupByValue = value;
  };

  startFromKind = (kind: WidgetKind, defaultActivityName?: string) => {
    if (this.form.id || !this.availableKinds.includes(kind)) return;

    this.invalidateLoads();
    this.withSuppressedReactions(() => {
      this.groupByValue = WidgetGroupByType.none;
      this.expandedSection = "config";
      this.expandedFilterField = undefined;
      this.replaceForm(this.buildNewForm(kind, defaultActivityName));
    });
    this.creationStep = "configure";
  };

  setExpandedSection = (section: string) => {
    this.expandedSection = (section as WidgetModalSection) || "config";
  };

  setExpandedFilterField = (field: string | undefined) => {
    this.expandedFilterField = field;
  };

  setCreationStep = (step: WidgetCreationStep) => {
    if (this.form.id) return;
    this.creationStep = step;
  };

  openWithFilter = (id: string, section: WidgetModalSection, field?: string) => {
    this.expandedSection = section;
    this.expandedFilterField = field;
    void this.loadById(id);
  };

  add = (defaultActivityName?: string) => {
    this.expandedSection = "config";
    this.expandedFilterField = undefined;
    this.creationStep = "choose";

    const defaultKind = this.availableKinds[0];
    if (!defaultKind) return;

    this.advanceSession();
    this.withSuppressedReactions(() => {
      this.groupByValue = WidgetGroupByType.none;
      this.replaceForm(this.buildNewForm(defaultKind, defaultActivityName));
    });

    this.open();

    void this.fetchCompanyWidgets();
  };

  fetchCompanyWidgets = async () => {
    if (this.form.id) return;

    const session = this.sessionGeneration;
    const generation = ++this.companyWidgetsGeneration;
    const result = await getCompanyWidgetsAction();
    if (
      result.ok &&
      generation === this.companyWidgetsGeneration &&
      session === this.sessionGeneration &&
      this.isOpen &&
      !this.form.id
    ) {
      runInAction(() => {
        this.companyWideWidgets = result.data.widgets.filter((widget) => this.availableKinds.includes(widget.kind));
      });
    }
  };

  delete = async () => {
    if (this.isLoading || !this.form.id) return false;

    const session = this.sessionGeneration;
    const id = this.form.id;
    this.setIsLoading(true);

    try {
      const res = await deleteWidgetAction({ id });
      if (session !== this.sessionGeneration || !this.isOpen) return false;
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.rootStore.widgetsStore.removeItem(res.data);
      if (session !== this.sessionGeneration || !this.isOpen) return false;
      this.close();
      return true;
    } finally {
      if (session === this.sessionGeneration) this.setIsLoading(false);
    }
  };

  loadById = async (id: string) => {
    this.advanceSession();
    const generation = ++this.loadGeneration;
    this.setIsLoading(true);
    runInAction(() => {
      this.isHydrating = true;
    });
    this.open();
    this.creationStep = "configure";

    try {
      const widget = await getWidgetByIdAction({ id });

      if (generation !== this.loadGeneration || !this.isOpen) return;

      if (!widget) {
        this.close();
        return;
      }

      this.hydrateWidget(widget, false);
    } finally {
      if (generation === this.loadGeneration) {
        runInAction(() => {
          this.setIsLoading(false);
          this.isHydrating = false;
        });
      }
    }
  };

  loadTemplate = async (widgetId: string): Promise<boolean> => {
    const generation = ++this.loadGeneration;
    this.setIsLoading(true);
    runInAction(() => {
      this.isHydrating = true;
    });

    try {
      const widget = await getWidgetByIdAction({ id: widgetId });

      if (generation !== this.loadGeneration || !this.isOpen) return false;
      if (!widget || !this.availableKinds.includes(widget.kind)) return false;

      this.hydrateWidget(widget, true);

      runInAction(() => {
        this.creationStep = "configure";
      });
      return true;
    } finally {
      if (generation === this.loadGeneration) {
        runInAction(() => {
          this.setIsLoading(false);
          this.isHydrating = false;
        });
      }
    }
  };

  setFilterableFields = (filterableFields: Record<EntityType, FilterableField[]>) => {
    this.filterableFieldsByEntityType = filterableFields;
  };

  setActivityFilterableFields = (filterableFields: FilterableField[]) => {
    this.activityFilterableFields = filterableFields;
  };

  clearActivityThreadFilter = () => {
    if (this.form.kind !== WidgetKind.activityTimeline) return;
    const threadIndex = this.form.timelineFilters?.findIndex(
      (filter) => filter.field === FilterFieldKey.timelineThreadId.toString(),
    );
    if (threadIndex === undefined || threadIndex < 0) return;

    this.onChange(`timelineFilters[${threadIndex}].operator`, undefined);
    this.onChange(`timelineFilters[${threadIndex}].value`, undefined);
  };

  setCustomColumns = (customColumns: CustomColumnDto[]) => {
    const byEntityType: Record<EntityType, CustomColumnDto[]> = {
      [EntityType.contact]: [],
      [EntityType.organization]: [],
      [EntityType.deal]: [],
      [EntityType.service]: [],
      [EntityType.task]: [],
    };

    customColumns.forEach((col) => byEntityType[col.entityType].push(col));

    this.customColumnsByEntityType = byEntityType;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isLoading || !this.form.name.trim()) return;
    const session = this.sessionGeneration;
    this.setIsLoading(true);

    const form = toJS(this.form);
    const savedForm = toJS(this.savedState);
    const payload: UpsertWidgetData =
      form.kind === WidgetKind.chart
        ? {
            id: form.id,
            kind: WidgetKind.chart,
            name: form.name,
            entityType: form.entityType,
            entityFilters: form.entityFilters?.filter(hasValidFilterConfiguration),
            dealFilters: this.showDealFiltersTab ? form.dealFilters?.filter(hasValidFilterConfiguration) : undefined,
            displayOptions: form.displayOptions,
            groupByType: form.groupByType,
            groupByCustomColumnId: form.groupByCustomColumnId,
            aggregationType: form.aggregationType,
            isTemplate: form.isTemplate,
          }
        : {
            id: form.id,
            kind: WidgetKind.activityTimeline,
            name: form.name,
            ...(!form.id ||
            savedForm.kind !== WidgetKind.activityTimeline ||
            !equal(activityFiltersForSave(form.timelineFilters), activityFiltersForSave(savedForm.timelineFilters))
              ? {
                  timelineFilters: activityFiltersForSave(form.timelineFilters),
                }
              : {}),
            displayOptions: form.displayOptions,
            isTemplate: form.isTemplate,
          };

    try {
      const res = await upsertWidgetAction(payload);
      if (session !== this.sessionGeneration || !this.isOpen) return;

      if (res.ok) {
        runInAction(() => {
          this.form.id = res.data.id;
          this.savedState = cloneDeep(this.form);
        });
        await this.rootStore.widgetsStore.refresh();
        if (session !== this.sessionGeneration || !this.isOpen) return;
        this.close();
      } else this.setError(res.error);
    } finally {
      if (session === this.sessionGeneration) this.setIsLoading(false);
    }
  };

  private buildNewForm = (kind: WidgetKind, defaultActivityName?: string): WidgetModalForm => {
    if (kind === WidgetKind.activityTimeline) {
      return {
        ...activityFormDefaults({ name: defaultActivityName ?? "" }),
        timelineFilters: this.mergeActivityFilters(),
      };
    }

    const entityType = this.availableEntityTypes[0] ?? EntityType.deal;
    return {
      ...chartFormDefaults(entityType),
      entityFilters: this.mergeFiltersWithFilterableFields(entityType),
      dealFilters: this.mergeFiltersWithFilterableFields(EntityType.deal),
    };
  };

  private buildFormFromWidget = (
    widget: WidgetDto,
    asTemplate: boolean,
  ): { form: WidgetModalForm; groupByValue: string } => {
    const common: Partial<WidgetFormCommon> = {
      id: asTemplate ? undefined : widget.id,
      name: widget.name,
      isTemplate: asTemplate ? false : widget.isTemplate,
    };

    if (widget.kind === WidgetKind.activityTimeline) {
      return {
        form: {
          ...activityFormDefaults(common),
          timelineFilters: this.mergeActivityFilters(widget.timelineFilters),
          displayOptions: mergeDisplayOptions(activityDisplayDefaults(), widget.displayOptions),
        },
        groupByValue: WidgetGroupByType.none,
      };
    }

    const groupByType = widget.groupByType ?? WidgetGroupByType.none;
    const groupByCustomColumnId = widget.groupByCustomColumnId ?? undefined;
    return {
      form: {
        ...chartFormDefaults(widget.entityType, common),
        displayOptions: mergeDisplayOptions(chartDisplayDefaults(), widget.displayOptions),
        groupByType,
        groupByCustomColumnId,
        aggregationType: widget.aggregationType,
        entityFilters: this.mergeFiltersWithFilterableFields(widget.entityType, widget.entityFilters),
        dealFilters: this.mergeFiltersWithFilterableFields(EntityType.deal, widget.dealFilters),
      },
      groupByValue:
        groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId
          ? `custom:${groupByCustomColumnId}`
          : groupByType,
    };
  };

  private hydrateWidget = (widget: WidgetDto, asTemplate: boolean) => {
    const hydrated = this.buildFormFromWidget(widget, asTemplate);
    this.withSuppressedReactions(() => {
      runInAction(() => {
        this.groupByValue = hydrated.groupByValue;
        this.replaceForm(hydrated.form);
      });
    });
  };

  private mergeFiltersWithFilterableFields = (entityType: EntityType, currentFilters: Filter[] = []) => {
    const filterableFields = this.filterableFieldsByEntityType[entityType] ?? [];
    return this.mergeFilters(filterableFields, currentFilters);
  };

  private mergeActivityFilters = (currentFilters: Filter[] = []) => {
    return mergeActivityFiltersForForm(this.activityFilterableFields, currentFilters);
  };

  private mergeFilters = (filterableFields: FilterableField[], currentFilters: Filter[] = []) => {
    const existingFiltersMap = new Map<string, Filter>();

    currentFilters.forEach((filter) => {
      existingFiltersMap.set(filter.field, filter);
    });

    return filterableFields.map((field) => {
      const existingFilter = existingFiltersMap.get(field.field);

      if (existingFilter) return cloneDeep(existingFilter);

      return {
        field: field.field,
        operator: undefined,
        value: undefined,
      };
    }) as Filter[];
  };

  private replaceForm = (form: WidgetModalForm) => {
    this.error = undefined;
    this.form = form;
    this.savedState = cloneDeep(form);
  };

  private withSuppressedReactions = <T>(callback: () => T): T => {
    const wasSuppressed = this.skipReactions;
    this.skipReactions = true;
    try {
      return callback();
    } finally {
      this.skipReactions = wasSuppressed;
    }
  };

  private invalidateLoads = () => {
    this.loadGeneration += 1;
    this.skipReactions = false;
    this.isHydrating = false;
    this.setIsLoading(false);
  };

  private advanceSession = () => {
    this.sessionGeneration += 1;
    this.companyWidgetsGeneration += 1;
    this.invalidateLoads();
  };

  private resetFormDefaultsOnEntityTypeChange = () => {
    reaction(
      () => this.chartForm?.entityType,
      (entityType) => {
        if (this.skipReactions || !entityType || equal(this.form, this.savedState)) return;
        const canAccessEntityType = this.availableEntityTypes.includes(entityType);

        runInAction(() => {
          const form = this.chartForm;
          if (!form) return;

          if (!canAccessEntityType && this.availableEntityTypes.length > 0)
            form.entityType = this.availableEntityTypes[0];

          form.groupByType = WidgetGroupByType.none;
          form.groupByCustomColumnId = undefined;
          form.aggregationType = AggregationType.count;
          this.groupByValue = WidgetGroupByType.none;
          form.entityFilters = this.mergeFiltersWithFilterableFields(form.entityType);
        });
      },
    );
  };

  private preventEntityTypeGroupingWhenCounting = () => {
    reaction(
      () => {
        const form = this.chartForm;
        return form
          ? {
              aggregationType: form.aggregationType,
              groupByType: form.groupByType,
              entityType: form.entityType,
            }
          : undefined;
      },
      (state) => {
        if (this.skipReactions || !state) return;
        const { aggregationType, groupByType, entityType } = state;
        if (aggregationType === AggregationType.count) {
          const matchingGroupByType = this.entityTypeToGroupByType[entityType];
          if (groupByType === matchingGroupByType) {
            runInAction(() => {
              const form = this.chartForm;
              if (!form) return;
              form.groupByType = WidgetGroupByType.none;
              form.groupByCustomColumnId = undefined;
              this.groupByValue = WidgetGroupByType.none;
            });
          }
        }
      },
    );
  };

  private updateFormStateWhenGroupByValueChanges = () => {
    reaction(
      () => this.groupByValue,
      (groupByValue) => {
        if (this.skipReactions || !this.chartForm) return;
        runInAction(() => {
          const form = this.chartForm;
          if (!form) return;

          if (groupByValue === WidgetGroupByType.none) {
            form.groupByType = WidgetGroupByType.none;
            form.groupByCustomColumnId = undefined;
            return;
          }

          if (groupByValue.startsWith("custom:")) {
            const customColumnId = groupByValue.replace("custom:", "");
            form.groupByType = WidgetGroupByType.customColumn;
            form.groupByCustomColumnId = customColumnId;
            return;
          }

          form.groupByType = groupByValue as WidgetGroupByType;
          form.groupByCustomColumnId = undefined;
        });
      },
    );
  };

  private updateGroupByValueWhenFormStateChanges = () => {
    reaction(
      () => {
        const form = this.chartForm;
        return form
          ? {
              groupByType: form.groupByType,
              groupByCustomColumnId: form.groupByCustomColumnId,
            }
          : undefined;
      },
      (state) => {
        if (this.skipReactions || !state) return;
        const { groupByType, groupByCustomColumnId } = state;
        runInAction(() => {
          if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
            this.groupByValue = `custom:${groupByCustomColumnId}`;
          else if (!groupByType || groupByType === WidgetGroupByType.none) this.groupByValue = WidgetGroupByType.none;
          else this.groupByValue = groupByType;
        });
      },
    );
  };
}
