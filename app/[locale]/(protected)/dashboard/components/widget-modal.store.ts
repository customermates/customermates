import type { FilterableField } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import { ACTIVITY_KINDS } from "@/ee/messaging/activities/activities.schema";
import { recordActivityFilterCount } from "@/ee/messaging/activities/record-activity-sources";
import type { DiscoveredRecordTypes } from "@/features/records/discover-record-types.interactor";
import { RecordActivityWidgetInputSchema } from "@/features/widget/record-activity-widget.schema";
import { RecordWidgetInputSchema } from "@/features/widget/record-widget.schema";
import type { WidgetGallery, WidgetGalleryTemplate } from "@/features/widget/widget-gallery";
import type { CompanyWidget, WidgetDto } from "@/features/widget/widget.schema";
import { isRecordActivityWidget, isRecordWidget } from "@/features/widget/widget.schema";
import type { FormEvent } from "react";
import { z } from "zod";
import { upsertRecordActivityWidgetAction, upsertRecordWidgetAction } from "../actions";
import type { RecordActivityWidgetForm, RecordWidgetForm } from "./record-widget-form";
import { isRecordActivityWidgetForm, isRecordWidgetForm } from "./record-widget-form";

import { Resource, WidgetKind } from "@/generated/prisma";
import { cloneDeep, omit } from "lodash";
import { action, computed, makeObservable, observable, reaction, runInAction, toJS } from "mobx";

import { deleteWidgetAction, getCompanyWidgetsAction, getWidgetByIdAction, getWidgetGalleryAction } from "../actions";
import { browserTimeZone } from "./widget-time-zone";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { ChartColor, DisplayType } from "@/features/widget/widget.schema";

type WidgetModalSection = "config" | "filters" | "dealFilters" | "activityFilters" | "display";
type WidgetCreationStep = "choose" | "configure";
export type WidgetModalForm = RecordWidgetForm | RecordActivityWidgetForm;

type WidgetFormCommon = { id?: string; name: string; isTemplate: boolean };

function chartDisplayDefaults(): NonNullable<RecordWidgetForm["displayOptions"]> {
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

export class WidgetModalStore extends BaseModalStore<WidgetModalForm> {
  public recordTypes: DiscoveredRecordTypes | null = null;
  private recordSubmission: { payload: string; key: string } | null = null;
  public companyWideWidgets: CompanyWidget[] = [];
  public galleryTemplates: WidgetGalleryTemplate[] = [];
  private gallerySchemaRevision: number | null = null;
  private galleryGeneration = 0;
  public expandedSection: WidgetModalSection = "config";
  public expandedFilterField: string | undefined = undefined;
  public creationStep: WidgetCreationStep = "choose";
  public isHydrating = false;
  public activityFilterableFields: FilterableField[] = [];
  private skipReactions = false;
  private loadGeneration = 0;
  private sessionGeneration = 0;
  private companyWidgetsGeneration = 0;
  private previewGeneration = 0;

  constructor(rootStore: RootStore) {
    super(rootStore, {
      kind: "chart",
      name: "",
      isTemplate: false,
      expectedRevision: 0,
      idempotencyKey: crypto.randomUUID(),
      displayOptions: chartDisplayDefaults(),
      measure: {
        source: { typeId: "", filters: [], relationships: [] },
        aggregation: "count",
        valueFieldId: null,
        groupBy: null,
        groupLimit: 100,
      },
    });

    makeObservable(this, {
      recordTypes: observable.ref,
      setRecordTypes: action,
      companyWideWidgets: observable,
      galleryTemplates: observable.ref,
      expandedSection: observable,
      expandedFilterField: observable,
      creationStep: observable,
      isHydrating: observable,
      activityFilterableFields: observable,

      add: action,
      delete: action,
      onSubmit: action,
      loadById: action,
      loadTemplate: action,
      fetchCompanyWidgets: action,
      fetchGallery: action,
      setActivityFilterableFields: action,
      setExpandedSection: action,
      setExpandedFilterField: action,
      setCreationStep: action,
      startFromKind: action,
      openWithFilter: action,

      activeTimelineFiltersCount: computed,
      availableKinds: computed,
    });

    reaction(
      () => (isRecordWidgetForm(this.form) ? this.form.measure.source.typeId : undefined),
      (typeId, previous) => {
        if (this.skipReactions || !previous || !typeId || typeId === previous || !isRecordWidgetForm(this.form)) return;
        runInAction(() => {
          if (!isRecordWidgetForm(this.form)) return;
          this.form.measure = {
            ...this.form.measure,
            source: { typeId, filters: [], relationships: [] },
            aggregation: "count",
            valueFieldId: null,
            groupBy: null,
          };
        });
      },
    );
    reaction(
      () => this.isOpen,
      (isOpen) => {
        if (!isOpen) runInAction(() => this.advanceSession());
      },
    );
  }
  get activeTimelineFiltersCount() {
    return isRecordActivityWidgetForm(this.form) ? recordActivityFilterCount(this.form.activityQuery) : 0;
  }
  get availableKinds() {
    const kinds: WidgetKind[] = [];
    if (
      this.recordTypes?.types.some((type) =>
        type.permittedActions.some((action) => action === "readAll" || action === "readOwn"),
      )
    )
      kinds.push(WidgetKind.chart);
    if (
      this.recordTypes &&
      (this.rootStore.userStore.canAccess(Resource.auditLog) ||
        this.rootStore.userStore.canAccess(Resource.inboxMessages))
    )
      kinds.push(WidgetKind.activityTimeline);
    return kinds;
  }

  startFromKind = (kind: WidgetKind, defaultActivityName?: string) => {
    if (this.form.id || !this.availableKinds.includes(kind)) return;

    this.invalidateLoads();
    this.withSuppressedReactions(() => {
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
    return this.loadById(id);
  };

  add = (defaultActivityName?: string) => {
    this.expandedSection = "config";
    this.expandedFilterField = undefined;
    this.creationStep = "choose";

    const defaultKind = this.availableKinds[0];
    if (!defaultKind) return;

    this.advanceSession();
    this.withSuppressedReactions(() => {
      this.replaceForm(this.buildNewForm(defaultKind, defaultActivityName));
    });

    this.open();

    void this.fetchCompanyWidgets().catch(reportApplicationError);
    void this.fetchGallery().catch(reportApplicationError);
  };

  fetchGallery = async () => {
    const generation = ++this.galleryGeneration;
    if (!this.availableKinds.includes(WidgetKind.chart)) {
      this.galleryTemplates = [];
      return;
    }
    const result = await getWidgetGalleryAction();
    if (!result.ok || generation !== this.galleryGeneration) return;
    runInAction(() => {
      if (JSON.stringify(result.data.templates) !== JSON.stringify(this.galleryTemplates))
        this.galleryTemplates = result.data.templates;
      this.gallerySchemaRevision = result.data.schemaRevision;
    });
  };

  startFromGallery = (template: WidgetGalleryTemplate, name: string) => {
    if (this.form.id || !this.availableKinds.includes(WidgetKind.chart)) return;

    const measure = cloneDeep(template.measure);
    if (measure.groupBy?.dateInterval) measure.groupBy.timeZone = browserTimeZone();
    runInAction(() => this.invalidateLoads());
    this.withSuppressedReactions(() => {
      runInAction(() => {
        this.expandedSection = "config";
        this.expandedFilterField = undefined;
        const form = this.buildNewForm(WidgetKind.chart);
        if (!isRecordWidgetForm(form)) return;
        this.replaceForm({
          ...form,
          name,
          expectedRevision: this.gallerySchemaRevision ?? form.expectedRevision,
          measure,
          displayOptions: cloneDeep(template.displayOptions),
        });
      });
    });
    runInAction(() => {
      this.creationStep = "configure";
    });
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
      if (!res.ok) {
        if (session === this.sessionGeneration && this.isOpen) toastZodErrorTree(res.error);
        return false;
      }

      await this.rootStore.widgetsStore.removeItem(res.data);
      if (session === this.sessionGeneration && this.isOpen) this.close();
      return true;
    } finally {
      if (session === this.sessionGeneration) this.setIsLoading(false);
    }
  };

  loadById = async (id: string) => {
    this.advanceSession();
    const generation = ++this.loadGeneration;
    this.setIsLoading(true);
    const cached = this.rootStore.widgetsStore.items.find((widget) => widget.id === id);
    if (cached) this.hydrateWidget(cached, false);
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

  setRecordTypes = (types: DiscoveredRecordTypes, gallery?: WidgetGallery) => {
    this.recordTypes = types;
    if (!gallery) {
      void this.fetchGallery().catch(reportApplicationError);
      return;
    }
    this.galleryGeneration += 1;
    this.galleryTemplates = this.availableKinds.includes(WidgetKind.chart) ? gallery.templates : [];
    this.gallerySchemaRevision = gallery.schemaRevision;
  };

  setActivityFilterableFields = (filterableFields: FilterableField[]) => {
    this.activityFilterableFields = filterableFields;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isLoading || !this.form.name.trim()) return;
    const session = this.sessionGeneration;
    this.setIsLoading(true);

    const form = toJS(this.form);
    if (isRecordActivityWidgetForm(form)) {
      try {
        const input = omit(form, ["kind", "idempotencyKey"]);
        const payload = JSON.stringify(input);
        if (this.recordSubmission?.payload !== payload) this.recordSubmission = { payload, key: crypto.randomUUID() };
        const parsed = RecordActivityWidgetInputSchema.safeParse({
          ...input,
          idempotencyKey: this.recordSubmission.key,
        });
        if (!parsed.success) {
          this.setError(z.treeifyError(parsed.error));
          return;
        }
        const result = await upsertRecordActivityWidgetAction(parsed.data);
        if (!result.ok) {
          if (session === this.sessionGeneration && this.isOpen) this.setError(result.error);
          return;
        }
        if (session === this.sessionGeneration && this.isOpen) this.hydrateWidget(result.data, false);
        await this.rootStore.widgetsStore.refresh();
        if (session === this.sessionGeneration && this.isOpen) this.close();
      } finally {
        if (session === this.sessionGeneration) this.setIsLoading(false);
      }
      return;
    }
    if (isRecordWidgetForm(form)) {
      try {
        const input = omit(form, ["kind", "idempotencyKey"]);
        const payload = JSON.stringify(input);
        if (this.recordSubmission?.payload !== payload) this.recordSubmission = { payload, key: crypto.randomUUID() };
        const parsed = RecordWidgetInputSchema.safeParse({ ...input, idempotencyKey: this.recordSubmission.key });
        if (!parsed.success) {
          this.setError(z.treeifyError(parsed.error));
          return;
        }
        const result = await upsertRecordWidgetAction(parsed.data);
        if (!result.ok) {
          if (session === this.sessionGeneration && this.isOpen) this.setError(result.error);
          return;
        }
        if (session === this.sessionGeneration && this.isOpen) this.hydrateWidget(result.data, false);
        await this.rootStore.widgetsStore.refresh();
        if (session === this.sessionGeneration && this.isOpen) this.close();
      } finally {
        if (session === this.sessionGeneration) this.setIsLoading(false);
      }
      return;
    }
  };
  runPreview = async <T>(run: () => Promise<T>): Promise<T | undefined> => {
    if (!this.isOpen) return undefined;
    const session = this.sessionGeneration;
    const generation = ++this.previewGeneration;
    const form = this.form;
    const query = this.previewQuery();
    const isCurrent = () =>
      this.isOpen &&
      session === this.sessionGeneration &&
      generation === this.previewGeneration &&
      form === this.form &&
      query === this.previewQuery();
    try {
      const result = await run();
      return isCurrent() ? result : undefined;
    } catch (error) {
      if (isCurrent()) throw error;
      return undefined;
    }
  };

  private previewQuery = () =>
    JSON.stringify(
      isRecordWidgetForm(this.form)
        ? this.form.measure
        : isRecordActivityWidgetForm(this.form)
          ? this.form.activityQuery
          : null,
    );

  private buildNewForm = (kind: WidgetKind, defaultActivityName?: string): WidgetModalForm => {
    const common = {
      name: "",
      isTemplate: false,
      expectedRevision: this.recordTypes?.schemaRevision ?? 0,
      idempotencyKey: crypto.randomUUID(),
    };
    if (kind === WidgetKind.activityTimeline) {
      return {
        ...common,
        kind,
        name: defaultActivityName ?? "",
        displayOptions: { showFilters: true },
        activityQuery: { scope: { typeIds: [], records: [] }, kinds: [...ACTIVITY_KINDS], filters: [] },
      };
    }
    const type = this.recordTypes?.types.find((type) =>
      type.permittedActions.some((action) => action === "readAll" || action === "readOwn"),
    );
    return {
      ...common,
      kind: "chart",
      displayOptions: chartDisplayDefaults(),
      measure: {
        source: { typeId: type?.id ?? "", filters: [], relationships: [] },
        aggregation: "count",
        valueFieldId: null,
        groupBy: null,
        groupLimit: 100,
      },
    };
  };

  private buildFormFromWidget = (widget: WidgetDto, asTemplate: boolean): { form: WidgetModalForm } => {
    const common: Partial<WidgetFormCommon> = {
      id: asTemplate ? undefined : widget.id,
      name: widget.name,
      isTemplate: asTemplate ? false : widget.isTemplate,
    };

    if (isRecordActivityWidget(widget)) {
      return {
        form: {
          kind: "activityTimeline",
          ...common,
          name: widget.name,
          isTemplate: common.isTemplate ?? false,
          expectedVersion: asTemplate ? undefined : widget.version,
          expectedRevision: widget.schemaRevision,
          idempotencyKey: crypto.randomUUID(),
          activityQuery: cloneDeep(widget.activityQuery),
          displayOptions: cloneDeep(widget.displayOptions),
        },
      };
    }
    if (isRecordWidget(widget)) {
      return {
        form: {
          kind: "chart",
          ...common,
          name: widget.name,
          isTemplate: common.isTemplate ?? false,
          expectedVersion: asTemplate ? undefined : widget.version,
          expectedRevision: widget.data?.schemaRevision ?? this.recordTypes?.schemaRevision ?? 0,
          idempotencyKey: crypto.randomUUID(),
          measure: cloneDeep(widget.measure),
          displayOptions: cloneDeep(widget.displayOptions),
        },
      };
    }
    throw new Error("Unsupported widget kind");
  };

  private hydrateWidget = (widget: WidgetDto, asTemplate: boolean) => {
    const hydrated = this.buildFormFromWidget(widget, asTemplate);
    this.withSuppressedReactions(() => {
      runInAction(() => {
        this.replaceForm(hydrated.form);
      });
    });
  };

  private replaceForm = (form: WidgetModalForm) => {
    this.initializeGroupFilter(form);
    this.error = undefined;
    this.form = form;
    this.savedState = cloneDeep(form);
  };

  protected override afterChange(id: string): void {
    if (id === "measure" || id.startsWith("measure.") || id === "activityQuery" || id.startsWith("activityQuery."))
      this.previewGeneration += 1;
    if (id === "measure.groupBy") this.initializeGroupFilter(this.form);
  }

  private initializeGroupFilter(form: WidgetModalForm): void {
    if (isRecordWidgetForm(form) && form.measure.groupBy)
      form.measure.groupBy.filter ??= { filters: [], relationships: [] };
  }

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
}
