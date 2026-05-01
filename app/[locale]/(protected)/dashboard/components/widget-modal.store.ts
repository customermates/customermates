import type { FormEvent } from "react";
import type { UpsertWidgetData, DisplayOptions } from "@/features/widget/upsert-widget.interactor";
import type { ExtendedWidget } from "@/features/widget/widget.types";
import type { RootStore } from "@/core/stores/root.store";
import type { CompanyWidget } from "@/features/widget/get-company-widgets.interactor";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { action, computed, makeObservable, observable, toJS, reaction, runInAction } from "mobx";
import { cloneDeep } from "lodash";
import { EntityType, WidgetGroupByType, AggregationType, Resource } from "@/generated/prisma";

import { upsertWidgetAction, deleteWidgetAction, getWidgetByIdAction, getCompanyWidgetsAction } from "../actions";

import { ChartColor, DisplayType } from "@/features/widget/widget.types";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";

export type WidgetModalSection = "config" | "filters" | "dealFilters" | "display";

export class WidgetModalStore extends BaseModalStore<UpsertWidgetData> {
  public fetchedWidget: ExtendedWidget | null = null;
  public companyWideWidgets: CompanyWidget[] = [];
  public groupByValue: string = WidgetGroupByType.none;
  public expandedSection: WidgetModalSection = "config";
  public expandedFilterField: string | undefined = undefined;
  private skipReactions = false;
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

  constructor(public readonly rootStore: RootStore) {
    super(rootStore, {
      name: "",
      entityType: EntityType.deal,
      entityFilters: undefined,
      dealFilters: undefined,
      displayOptions: {
        barColors: [ChartColor.primary1],
        displayType: DisplayType.verticalBarChart,
        reverseXAxis: false,
        reverseYAxis: false,
        useGroupColors: true,
        showLegend: true,
        showFilters: true,
      } as DisplayOptions,
      groupByType: WidgetGroupByType.none,
      groupByCustomColumnId: undefined,
      aggregationType: AggregationType.count,
      isTemplate: false,
    });

    makeObservable(this, {
      fetchedWidget: observable,
      companyWideWidgets: observable,
      groupByValue: observable,
      expandedSection: observable,
      expandedFilterField: observable,
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
      setCustomColumns: action,
      setExpandedSection: action,
      setExpandedFilterField: action,
      openWithFilter: action,

      groupBySelectOptions: computed,
      groupBySelectValue: computed,
      aggregationTypeOptions: computed,
      filterableFields: computed,
      dealFilterableFields: computed,
      customColumns: computed,
      activeFiltersCount: computed,
      activeDealFiltersCount: computed,
      showDealFiltersTab: computed,
      availableEntityTypes: computed,
    });

    this.resetFormDefaultsOnEntityTypeChange();
    this.preventEntityTypeGroupingWhenCounting();
    this.updateFormStateWhenGroupByValueChanges();
    this.updateGroupByValueWhenFormStateChanges();
  }

  get customColumns() {
    return this.customColumnsByEntityType[this.form.entityType] ?? [];
  }

  get filterableFields() {
    return this.filterableFieldsByEntityType[this.form.entityType] ?? [];
  }

  get dealFilterableFields() {
    return this.filterableFieldsByEntityType[EntityType.deal] ?? [];
  }

  get activeFiltersCount() {
    return (this.form.entityFilters || []).filter(hasValidFilterConfiguration).length;
  }

  get activeDealFiltersCount() {
    return (this.form.dealFilters || []).filter(hasValidFilterConfiguration).length;
  }

  get showDealFiltersTab() {
    return (
      this.form.entityType !== EntityType.deal &&
      (this.form.aggregationType === AggregationType.dealValue ||
        this.form.aggregationType === AggregationType.dealQuantity)
    );
  }

  get availableEntityTypes() {
    return Object.values(EntityType).filter((entityType) => {
      const resource = this.entityTypeToResource[entityType];

      return this.rootStore.userStore.canAccess(resource);
    });
  }

  get aggregationTypeOptions() {
    const base = [{ key: AggregationType.count }];
    const canAccessDeals = this.rootStore.userStore.canAccess(Resource.deals);

    if (!canAccessDeals) return base;

    if (this.form.entityType === EntityType.task) return base;

    if (this.form.entityType === EntityType.service)
      return [...base, { key: AggregationType.dealValue }, { key: AggregationType.dealQuantity }];

    return [...base, { key: AggregationType.dealValue }];
  }

  get groupBySelectOptions() {
    const options: Array<{ key: string; label?: string; entityType?: EntityType }> = [{ key: WidgetGroupByType.none }];

    if (this.form.aggregationType !== AggregationType.count) {
      const groupByType = this.entityTypeToGroupByType[this.form.entityType];
      if (groupByType) {
        const resource = this.groupByTypeToResource[groupByType];
        if (resource && this.rootStore.userStore.canAccess(resource)) options.push({ key: groupByType });
      }
    }

    const custom = this.customColumns
      .filter((c) => {
        const canAccessEntity = this.rootStore.userStore.canAccess(this.entityTypeToResource[c.entityType]);
        return c.entityType === this.form.entityType && c.type === "singleSelect" && canAccessEntity;
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
    if (!value) return;
    this.groupByValue = value;
  };

  setExpandedSection = (section: string) => {
    this.expandedSection = (section as WidgetModalSection) || "config";
  };

  setExpandedFilterField = (field: string | undefined) => {
    this.expandedFilterField = field;
  };

  openWithFilter = (id: string, section: WidgetModalSection, field?: string) => {
    this.expandedSection = section;
    this.expandedFilterField = field;
    void this.loadById(id);
  };

  add = () => {
    this.fetchedWidget = null;
    this.expandedSection = "config";
    this.expandedFilterField = undefined;

    const availableEntityTypes = this.availableEntityTypes;
    if (availableEntityTypes.length === 0) return;

    const defaultEntityType = availableEntityTypes[0];

    this.skipReactions = true;
    this.groupByValue = WidgetGroupByType.none;

    this.onInitOrRefresh({
      id: undefined,
      name: "",
      entityType: defaultEntityType,
      entityFilters: this.mergeFiltersWithFilterableFields(defaultEntityType),
      dealFilters: this.mergeFiltersWithFilterableFields(EntityType.deal),
      displayOptions: {
        barColors: [ChartColor.primary1],
        displayType: DisplayType.verticalBarChart,
        reverseXAxis: false,
        reverseYAxis: false,
        useGroupColors: true,
        showLegend: true,
        showFilters: true,
      },
      groupByType: WidgetGroupByType.none,
      groupByCustomColumnId: undefined,
      aggregationType: AggregationType.count,
      isTemplate: false,
    });
    this.skipReactions = false;

    this.open();

    void this.fetchCompanyWidgets();
  };

  fetchCompanyWidgets = async () => {
    if (this.form.id) return;

    const result = await getCompanyWidgetsAction();
    if (result.widgets) this.companyWideWidgets = result.widgets;
  };

  delete = async () => {
    if (!this.form.id) return;

    this.setIsLoading(true);

    try {
      const res = await deleteWidgetAction({ id: this.form.id });

      await this.rootStore.widgetsStore.removeItem(res);
      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  loadById = async (id: string) => {
    this.fetchedWidget = null;
    this.setIsLoading(true);
    this.open();

    try {
      const widget = await getWidgetByIdAction({ id });

      if (widget) {
        this.fetchedWidget = widget;
        this.setError(undefined);

        const groupByType = widget.groupByType ?? WidgetGroupByType.none;
        const groupByCustomColumnId = widget.groupByCustomColumnId ?? undefined;

        this.skipReactions = true;
        runInAction(() => {
          if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
            this.groupByValue = `custom:${groupByCustomColumnId}`;
          else this.groupByValue = groupByType;

          this.onInitOrRefresh({
            id: widget.id,
            name: widget.name,
            entityType: widget.entityType,
            displayOptions: {
              barColors: widget.displayOptions?.barColors ?? [ChartColor.primary1],
              displayType: widget.displayOptions?.displayType ?? DisplayType.verticalBarChart,
              reverseXAxis: widget.displayOptions?.reverseXAxis ?? false,
              reverseYAxis: widget.displayOptions?.reverseYAxis ?? false,
              useGroupColors: widget.displayOptions?.useGroupColors ?? true,
              showLegend: widget.displayOptions?.showLegend ?? true,
              showFilters: widget.displayOptions?.showFilters ?? true,
            },
            groupByType,
            groupByCustomColumnId,
            aggregationType: widget.aggregationType,
            isTemplate: widget.isTemplate,
            entityFilters: this.mergeFiltersWithFilterableFields(widget.entityType, widget.entityFilters),
            dealFilters: this.mergeFiltersWithFilterableFields(EntityType.deal, widget.dealFilters),
          });
        });
        this.skipReactions = false;
      } else this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  loadTemplate = async (widgetId: string) => {
    this.setIsLoading(true);

    try {
      const widget = await getWidgetByIdAction({ id: widgetId });

      if (widget) {
        const groupByType = widget.groupByType ?? WidgetGroupByType.none;
        const groupByCustomColumnId = widget.groupByCustomColumnId ?? undefined;

        this.skipReactions = true;
        this.form = {
          id: undefined,
          name: widget.name,
          entityType: widget.entityType,
          entityFilters: this.mergeFiltersWithFilterableFields(widget.entityType, widget.entityFilters),
          dealFilters: this.mergeFiltersWithFilterableFields(EntityType.deal, widget.dealFilters),
          displayOptions: {
            barColors: widget.displayOptions?.barColors ?? [ChartColor.primary1],
            displayType: widget.displayOptions?.displayType ?? DisplayType.verticalBarChart,
            reverseXAxis: widget.displayOptions?.reverseXAxis ?? false,
            reverseYAxis: widget.displayOptions?.reverseYAxis ?? false,
            useGroupColors: widget.displayOptions?.useGroupColors ?? true,
            showLegend: widget.displayOptions?.showLegend ?? true,
            showFilters: widget.displayOptions?.showFilters ?? true,
          },
          groupByType,
          groupByCustomColumnId,
          aggregationType: widget.aggregationType,
          isTemplate: false,
        };

        if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
          this.groupByValue = `custom:${groupByCustomColumnId}`;
        else this.groupByValue = groupByType;
        this.skipReactions = false;
      }
    } finally {
      this.setIsLoading(false);
    }
  };

  setFilterableFields = (filterableFields: Record<EntityType, FilterableField[]>) => {
    this.filterableFieldsByEntityType = filterableFields;
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
    this.setIsLoading(true);

    const form = toJS(this.form);
    if (form.entityFilters) form.entityFilters = form.entityFilters.filter(hasValidFilterConfiguration);
    if (form.dealFilters) form.dealFilters = form.dealFilters.filter(hasValidFilterConfiguration);

    try {
      const res = await upsertWidgetAction(form);

      if (res.ok) {
        await this.rootStore.widgetsStore.refresh();
        this.close();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };

  private mergeFiltersWithFilterableFields = (entityType: EntityType, currentFilters: Filter[] = []) => {
    const filterableFields = this.filterableFieldsByEntityType[entityType] ?? [];
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

  private resetFormDefaultsOnEntityTypeChange = () => {
    reaction(
      () => this.form.entityType,
      (entityType) => {
        if (this.skipReactions) return;
        const canAccessEntityType = this.availableEntityTypes.includes(entityType);

        runInAction(() => {
          if (!canAccessEntityType && this.availableEntityTypes.length > 0)
            this.form.entityType = this.availableEntityTypes[0];

          this.form.groupByType = WidgetGroupByType.none;
          this.form.groupByCustomColumnId = undefined;
          this.form.aggregationType = AggregationType.count;
          this.groupByValue = WidgetGroupByType.none;
          this.form.entityFilters = this.mergeFiltersWithFilterableFields(this.form.entityType);
        });
      },
    );
  };

  private preventEntityTypeGroupingWhenCounting = () => {
    reaction(
      () => ({
        aggregationType: this.form.aggregationType,
        groupByType: this.form.groupByType,
        entityType: this.form.entityType,
      }),
      ({ aggregationType, groupByType, entityType }) => {
        if (this.skipReactions) return;
        if (aggregationType === AggregationType.count) {
          const matchingGroupByType = this.entityTypeToGroupByType[entityType];
          if (groupByType === matchingGroupByType) {
            runInAction(() => {
              this.form.groupByType = WidgetGroupByType.none;
              this.form.groupByCustomColumnId = undefined;
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
        if (this.skipReactions) return;
        runInAction(() => {
          if (groupByValue === WidgetGroupByType.none) {
            this.form.groupByType = WidgetGroupByType.none;
            this.form.groupByCustomColumnId = undefined;
            return;
          }

          if (groupByValue.startsWith("custom:")) {
            const customColumnId = groupByValue.replace("custom:", "");
            this.form.groupByType = WidgetGroupByType.customColumn;
            this.form.groupByCustomColumnId = customColumnId;
            return;
          }

          this.form.groupByType = groupByValue as WidgetGroupByType;
          this.form.groupByCustomColumnId = undefined;
        });
      },
    );
  };

  private updateGroupByValueWhenFormStateChanges = () => {
    reaction(
      () => ({
        groupByType: this.form.groupByType,
        groupByCustomColumnId: this.form.groupByCustomColumnId,
      }),
      ({ groupByType, groupByCustomColumnId }) => {
        if (this.skipReactions) return;
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
