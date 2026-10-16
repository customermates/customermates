import type { RootStore } from "@/core/stores/root.store";
import { ACTIVITY_KINDS } from "@/ee/messaging/activities/activities.schema";
import { recordActivityFilterCount } from "@/ee/messaging/activities/record-activity-sources";
import type { DiscoveredRecordTypes } from "@/features/records/discover-record-types.interactor";
import { RecordActivityWidgetInputSchema } from "@/features/widget/record-activity-widget.schema";
import { RecordWidgetInputSchema } from "@/features/widget/record-widget.schema";
import type { CompanyWidget, WidgetDto } from "@/features/widget/widget.schema";
import { isRecordActivityWidget, isRecordWidget } from "@/features/widget/widget.schema";
import type { FormEvent } from "react";
import { z } from "zod";
import { previewRecordWidgetAction, upsertRecordActivityWidgetAction, upsertRecordWidgetAction } from "../actions";
import { getRecordModelAction } from "../../records/actions";
import { resolveSearchReferencesAction } from "../../search/actions";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { RecordSearchHit } from "@/features/records/record-search.schema";
import type { RecordWidgetPreview } from "@/features/widget/record-widget-reader";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import type { RecordActivityWidgetForm, RecordWidgetForm } from "./record-widget-form";
import { isRecordActivityWidgetForm, isRecordWidgetForm } from "./record-widget-form";

import { Resource, WidgetKind } from "@/generated/prisma";
import { cloneDeep, omit } from "lodash";
import { action, comparer, computed, makeObservable, observable, reaction, runInAction, toJS } from "mobx";

import { deleteWidgetAction, getCompanyWidgetsAction, getWidgetByIdAction } from "../actions";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { GRID_COLS } from "./grid.constants";
import { type WidgetLayoutGeometry, widgetDefaultSize, widgetLayoutGeometry } from "@/features/widget/widget-grid";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { ChartColor, DisplayType } from "@/features/widget/widget.schema";

type WidgetModalSection = "config" | "filters" | "activityFilters" | "display";
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
  public expandedSection: WidgetModalSection = "config";
  public creationStep: WidgetCreationStep = "choose";
  public isHydrating = false;
  private skipReactions = false;
  private loadGeneration = 0;
  private sessionGeneration = 0;
  private companyWidgetsGeneration = 0;
  private previewGeneration = 0;
  public recordModel: RecordModelView | null | undefined = undefined;
  public recordPreview: ({ key: string } & RecordWidgetPreview) | null = null;
  public recordPreviewLoading = false;
  public recordPreviewFailed = false;
  public scopeRecordHits: RecordSearchHit[] = [];
  private recordModelRequest = 0;
  private recordPreviewRequest = 0;
  private scopeRecordsRequest = 0;

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
      expandedSection: observable,
      creationStep: observable,
      isHydrating: observable,
      recordModel: observable.ref,
      recordPreview: observable.ref,
      recordPreviewLoading: observable,
      recordPreviewFailed: observable,
      scopeRecordHits: observable.ref,
      loadRecordModel: action,
      runRecordPreview: action,
      loadScopeRecords: action,
      recordMeasureKey: computed,

      add: action,
      delete: action,
      onSubmit: action,
      loadById: action,
      loadTemplate: action,
      fetchCompanyWidgets: action,
      setExpandedSection: action,
      setCreationStep: action,
      startFromKind: action,
      openWithFilter: action,

      activeTimelineFiltersCount: computed,
      availableKinds: computed,
      previewGeometry: computed,
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
    reaction(
      () => (this.isOpen && isRecordWidgetForm(this.form) ? this.form.measure.source.typeId : null),
      (typeId) => {
        if (typeId) void this.loadRecordModel();
        else {
          runInAction(() => {
            this.recordModelRequest += 1;
            this.recordModel = undefined;
          });
        }
      },
    );
    reaction(
      () => [this.form, this.recordMeasureKey, this.recordModel?.revision, this.isOpen],
      () =>
        runInAction(() => {
          this.recordPreviewRequest += 1;
          this.recordPreviewLoading = false;
          this.recordPreviewFailed = false;
        }),
      { equals: comparer.shallow },
    );
    reaction(
      () =>
        this.isOpen && isRecordActivityWidgetForm(this.form)
          ? JSON.stringify(this.form.activityQuery.scope.records)
          : null,
      (key) => {
        if (key && isRecordActivityWidgetForm(this.form))
          void this.loadScopeRecords(this.form.activityQuery.scope.records);
      },
    );
  }

  get recordMeasureKey() {
    return isRecordWidgetForm(this.form) ? JSON.stringify(this.form.measure) : null;
  }

  loadRecordModel = async () => {
    const request = ++this.recordModelRequest;
    this.recordModel = undefined;
    try {
      const model = await getRecordModelAction();
      runInAction(() => {
        if (request === this.recordModelRequest) this.recordModel = model;
      });
    } catch (error) {
      if (request !== this.recordModelRequest) return;
      reportApplicationError(error);
      runInAction(() => {
        this.recordModel = null;
      });
    }
  };

  runRecordPreview = async () => {
    const form = this.form;
    if (!isRecordWidgetForm(form)) return;
    const previewed = JSON.stringify(form.measure);
    const request = ++this.recordPreviewRequest;
    const isCurrent = () => request === this.recordPreviewRequest;
    this.recordPreviewLoading = true;
    this.recordPreviewFailed = false;
    try {
      const parsed = RecordMeasureSchema.safeParse(form.measure);
      if (!parsed.success) {
        runInAction(() => {
          this.recordPreviewFailed = true;
        });
        return;
      }
      const result = await this.runPreview(() => previewRecordWidgetAction(parsed.data));
      if (!result || !isCurrent()) return;
      if (!result.ok) {
        runInAction(() => {
          this.recordPreviewFailed = true;
        });
        return;
      }
      if (this.recordModel && result.data.result.schemaRevision !== this.recordModel.revision) {
        void this.loadRecordModel();
        return;
      }
      runInAction(() => {
        this.recordPreview = { key: previewed, ...result.data };
      });
      if (this.hasUnsavedChanges) this.onChange("expectedRevision", result.data.result.schemaRevision);
    } catch (error) {
      if (!isCurrent()) return;
      reportApplicationError(error);
      runInAction(() => {
        this.recordPreviewFailed = true;
      });
    } finally {
      runInAction(() => {
        if (isCurrent()) this.recordPreviewLoading = false;
      });
    }
  };

  loadScopeRecords = async (refs: RecordActivityWidgetForm["activityQuery"]["scope"]["records"]) => {
    const request = ++this.scopeRecordsRequest;
    if (refs.length === 0) {
      this.scopeRecordHits = [];
      return;
    }
    try {
      const result = await resolveSearchReferencesAction({ refs: toJS(refs) });
      runInAction(() => {
        if (request === this.scopeRecordsRequest && result.ok) this.scopeRecordHits = result.data.results;
      });
    } catch (error) {
      if (request === this.scopeRecordsRequest) reportApplicationError(error);
    }
  };
  get activeTimelineFiltersCount() {
    return isRecordActivityWidgetForm(this.form) ? recordActivityFilterCount(this.form.activityQuery) : 0;
  }
  get previewGeometry(): WidgetLayoutGeometry {
    const displayType = isRecordWidgetForm(this.form) ? this.form.displayOptions.displayType : undefined;
    if (this.form.id) {
      const saved = this.rootStore.widgetsStore.layouts.lg?.find((item) => item.i === this.form.id);
      return widgetLayoutGeometry(this.form.kind, GRID_COLS.lg, saved, displayType);
    }
    return widgetLayoutGeometry(
      this.form.kind,
      GRID_COLS.lg,
      widgetDefaultSize(this.form.kind, displayType),
      displayType,
    );
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
      (this.rootStore.userStore.canAccess(Resource.activityLog) ||
        this.rootStore.userStore.canAccess(Resource.inboxMessages))
    )
      kinds.push(WidgetKind.activityTimeline);
    return kinds;
  }

  startFromKind = (kind: WidgetKind, options: { activityName?: string; displayType?: DisplayType } = {}) => {
    if (this.form.id || !this.availableKinds.includes(kind)) return;

    this.invalidateLoads();
    this.withSuppressedReactions(() => {
      this.expandedSection = "config";
      const form = this.buildNewForm(kind, options.activityName);
      this.replaceForm(
        isRecordWidgetForm(form) && options.displayType
          ? { ...form, displayOptions: { ...form.displayOptions, displayType: options.displayType } }
          : form,
      );
    });
    this.creationStep = "configure";
  };

  setExpandedSection = (section: string) => {
    this.expandedSection = (section as WidgetModalSection) || "config";
  };

  setCreationStep = (step: WidgetCreationStep) => {
    if (this.form.id) return;
    this.creationStep = step;
  };

  openWithFilter = (id: string, section: WidgetModalSection) => {
    this.expandedSection = section;
    return this.loadById(id);
  };

  add = (defaultActivityName?: string) => {
    this.expandedSection = "config";
    this.creationStep = "choose";

    const defaultKind = this.availableKinds[0];
    if (!defaultKind) return;

    this.advanceSession();
    this.withSuppressedReactions(() => {
      this.replaceForm(this.buildNewForm(defaultKind, defaultActivityName));
    });

    this.open();

    void this.fetchCompanyWidgets().catch(reportApplicationError);
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

      await this.rootStore.widgetsStore.removeItem(res.data.id);
      if (session === this.sessionGeneration && this.isOpen) this.close();
      return { trashBatchId: res.data.trashBatchId };
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

  setRecordTypes = (types: DiscoveredRecordTypes) => {
    this.recordTypes = types;
  };

  private submissionKey(input: object) {
    const payload = JSON.stringify(input);
    if (this.recordSubmission?.payload !== payload) this.recordSubmission = { payload, key: crypto.randomUUID() };
    return this.recordSubmission.key;
  }

  private targetView(id: string | undefined) {
    if (id) return {};
    const viewKey = this.rootStore.widgetsStore.activeViewKey;
    return { viewId: viewKey === ALL_VIEW_KEY ? null : viewKey };
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isLoading || !this.form.name.trim()) return;
    const session = this.sessionGeneration;
    this.setIsLoading(true);

    const form = toJS(this.form);
    if (isRecordActivityWidgetForm(form)) {
      try {
        const input = { ...omit(form, ["kind", "idempotencyKey"]), ...this.targetView(form.id) };
        const parsed = RecordActivityWidgetInputSchema.safeParse({
          ...input,
          idempotencyKey: this.submissionKey(input),
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
        const input = { ...omit(form, ["kind", "idempotencyKey"]), ...this.targetView(form.id) };
        const parsed = RecordWidgetInputSchema.safeParse({ ...input, idempotencyKey: this.submissionKey(input) });
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
    this.recordPreview = null;
    this.recordSubmission = null;
    this.companyWidgetsGeneration += 1;
    this.invalidateLoads();
  };
}
