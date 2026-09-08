import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertRoutineData } from "@/ee/routines/routine.schema";
import type { RoutineDto, RoutineOwnerDto } from "@/ee/routines/routine.schema";
import type { RoutineSchedulePreset } from "@/ee/routines/routine-schedule-preset";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { RoutineRunDto } from "@/ee/routines/routine.schema";
import type { RoutineRunPage } from "@/ee/routines/routine-history";

import { action, computed, makeObservable, observable, runInAction, toJS } from "mobx";
import type { EntityType } from "@/generated/prisma";
import { RoutineRunStatus, RoutineTriggerKind } from "@/generated/prisma";

import {
  deleteRoutineAction,
  getRoutineFilterFieldsAction,
  getRoutineRunsAction,
  pauseRoutineAction,
  runRoutineNowAction,
  upsertRoutineAction,
} from "../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { DEFAULT_ROUTINE_TIMEZONE } from "@/ee/routines/routine-schedule";
import {
  DEFAULT_ROUTINE_SCHEDULE,
  cronForSchedule,
  localTimeZone,
  scheduleFromCron,
} from "@/ee/routines/routine-schedule-preset";
import { entityTypeForEvents, isRecordChangeEvent } from "@/ee/routines/routine-event-filter";
import { routineChangeFields } from "@/ee/routines/routine-change-fields";

export const ROUTINE_RUN_POLL_INTERVAL_MS = 2_000;
export const ROUTINE_RUN_POLL_GRACE_MS = 30_000;
export const ROUTINE_RUN_POLL_MAX_MS = 10 * 60 * 1_000;

export type RoutineRunsRequestState = "idle" | "loading" | "ready" | "error";

function mergeFilters(filterableFields: FilterableField[], current: Filter[]): Filter[] {
  const existing = new Map<string, Filter>();
  for (const filter of Array.isArray(current) ? current : [])
    if (filter && typeof filter.field === "string") existing.set(filter.field, filter);

  const availableFieldIds = new Set(filterableFields.map((field) => field.field));
  const availableRows = filterableFields.map((field) => {
    const match = existing.get(field.field);
    if (!match) {
      return {
        field: field.field,
        operator: undefined,
        value: undefined,
      } as unknown as Filter;
    }

    return {
      field: match.field,
      operator: match.operator,
      ...("value" in match ? { value: match.value } : {}),
    } as Filter;
  });

  const unavailableRows = [...existing.values()].filter((filter) => !availableFieldIds.has(filter.field));

  return [...availableRows, ...unavailableRows];
}

export type RoutineModalForm = UpsertRoutineData & {
  ownerUserId: string | null;
  owner: RoutineOwnerDto | null;
  schedulePreset: RoutineSchedulePreset;
  scheduleHour: string;
  scheduleMinute: string;
  scheduleWeekday: string;
  scheduleDayOfMonth: string;
};

export const EMPTY_ROUTINE_FORM: RoutineModalForm = {
  id: undefined,
  ownerUserId: null,
  owner: null,
  modelKey: undefined,
  name: "",
  prompt: "",
  enabled: true,
  triggerKind: RoutineTriggerKind.schedule,
  timezone: DEFAULT_ROUTINE_TIMEZONE,
  triggerEvents: [],
  changedFields: [],
  triggerFilters: [],
  schedulePreset: DEFAULT_ROUTINE_SCHEDULE.preset,
  scheduleHour: String(DEFAULT_ROUTINE_SCHEDULE.hour),
  scheduleMinute: String(DEFAULT_ROUTINE_SCHEDULE.minute),
  scheduleWeekday: String(DEFAULT_ROUTINE_SCHEDULE.weekday),
  scheduleDayOfMonth: String(DEFAULT_ROUTINE_SCHEDULE.dayOfMonth),
  cronExpression: DEFAULT_ROUTINE_SCHEDULE.expression,
};

export function routineFormFor(routine: RoutineDto): RoutineModalForm {
  const schedule = scheduleFromCron(routine.cronExpression);

  return {
    id: routine.id,
    ownerUserId: routine.ownerUserId,
    owner: routine.owner,
    name: routine.name,
    prompt: routine.prompt,
    modelKey: routine.modelKey,
    enabled: routine.enabled,
    triggerKind: routine.triggerKind,
    timezone: routine.timezone ?? DEFAULT_ROUTINE_TIMEZONE,
    triggerEvents: routine.triggerEvents,
    changedFields: routine.changedFields,
    triggerFilters: routine.triggerFilters ?? [],
    schedulePreset: schedule.preset,
    scheduleHour: String(schedule.hour),
    scheduleMinute: String(schedule.minute),
    scheduleWeekday: String(schedule.weekday),
    scheduleDayOfMonth: String(schedule.dayOfMonth),
    cronExpression: schedule.expression,
  };
}

export class RoutineModalStore extends BaseModalStore<RoutineModalForm> {
  activeTab: "details" | "runs" = "details";
  runs: RoutineRunDto[] = [];
  openRunId: string | null = null;
  disabledReason: string | null = null;
  runsNextCursor: string | null = null;
  runsRequestState: RoutineRunsRequestState = "idle";
  isLoadingMoreRuns = false;
  isStartingRun = false;
  filterableFieldsByEntityType: Partial<Record<EntityType, FilterableField[]>> = {};
  customColumnsByEntityType: Partial<Record<EntityType, CustomColumnDto[]>> = {};
  private filterFieldsLoaded = false;
  private filterFieldsLoadPromise: Promise<void> | null = null;
  private runsSessionGeneration = 0;
  private runsRoutineId: string | null = null;
  private firstPageRequest: {
    key: string;
    promise: Promise<RoutineRunPage>;
  } | null = null;
  private loadedAdditionalRunPages = false;
  private runsPollTimer: ReturnType<typeof setTimeout> | null = null;
  private runsPollDeadline = 0;
  private runsPollGraceDeadline = 0;
  private runsPollFailureNotified = false;
  private runsPollGeneration = 0;
  private runsPollingActive = false;

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY_ROUTINE_FORM);

    makeObservable(this, {
      activeTab: observable,
      runs: observable,
      openRunId: observable,
      disabledReason: observable,
      runsNextCursor: observable,
      runsRequestState: observable,
      isLoadingMoreRuns: observable,
      isStartingRun: observable,
      filterableFieldsByEntityType: observable,
      customColumnsByEntityType: observable,

      openRun_: computed,
      triggerEntityType: computed,
      watchesRecordChanges: computed,
      changeFields: computed,
      filterableFields: computed,
      customColumns: computed,
      hasActiveRuns: computed,
      isOwner: computed,
      hasAvailableOwner: computed,
      isAdmin: computed,
      canAdministerOtherRoutine: computed,

      delete: action,
      onSubmit: action,
      loadFilterFields: action,
      useSchedulePreset: action,
      openForCreate: action,
      openForEdit: action,
      setActiveTab: action,
      openRun: action,
      closeRun: action,
      loadRuns: action,
      retryLoadRuns: action,
      loadMoreRuns: action,
      runNow: action,
      pause: action,
    });
  }

  protected override afterChange(id: string, _value: unknown, previousValue: unknown): void {
    if (id !== "triggerEvents") return;

    const previousEvents = Array.isArray(previousValue) ? previousValue : [];
    const entityChanged = entityTypeForEvents(previousEvents) !== this.triggerEntityType;

    this.form.triggerFilters = mergeFilters(
      this.filterableFields,
      entityChanged ? [] : ((this.form.triggerFilters as Filter[]) ?? []),
    );
    this.form.changedFields = this.watchesRecordChanges && !entityChanged ? (this.form.changedFields ?? []) : [];
  }

  get triggerEntityType(): EntityType | null {
    return entityTypeForEvents(this.form?.triggerEvents ?? []);
  }

  get watchesRecordChanges(): boolean {
    return (this.form?.triggerEvents ?? []).some(isRecordChangeEvent);
  }

  get changeFields(): string[] {
    const entityType = this.triggerEntityType;
    if (!entityType || !this.watchesRecordChanges) return [];

    return [...routineChangeFields(entityType), ...this.customColumns.map((column) => column.id)];
  }

  get filterableFields(): FilterableField[] {
    const entityType = this.triggerEntityType;

    return entityType ? (this.filterableFieldsByEntityType[entityType] ?? []) : [];
  }

  get customColumns(): CustomColumnDto[] {
    return this.customColumnsFor(this.triggerEntityType);
  }

  customColumnsFor = (entityType: EntityType | null): CustomColumnDto[] =>
    entityType ? (this.customColumnsByEntityType[entityType] ?? []) : [];

  get openRun_(): RoutineRunDto | null {
    return this.runs.find((run) => run.id === this.openRunId) ?? null;
  }

  get hasActiveRuns(): boolean {
    return this.runs.some((run) => run.status === RoutineRunStatus.queued || run.status === RoutineRunStatus.running);
  }

  get isOwner(): boolean {
    if (!this.form.id) return true;

    return Boolean(this.form.ownerUserId && this.form.ownerUserId === this.rootStore.userStore.user?.id);
  }

  get hasAvailableOwner(): boolean {
    return this.form.owner?.status === "active";
  }

  get isAdmin(): boolean {
    return Boolean(this.rootStore.userStore.user?.role?.isSystemRole);
  }

  get canAdministerOtherRoutine(): boolean {
    return Boolean(this.form.id && this.isAdmin && !this.isOwner);
  }

  get canManage(): boolean {
    return this.isOwner;
  }

  get isReadOnly(): boolean {
    return !this.isOwner;
  }

  canOpenRun = (run: RoutineRunDto): boolean => run.executedByUserId === this.rootStore.userStore.user?.id;

  protected override prepareToClose(): boolean {
    this.beginRunsSession(null);
    return true;
  }

  private beginRunsSession(routineId: string | null): number {
    this.stopRunsPolling();
    this.runsSessionGeneration += 1;
    this.runsRoutineId = routineId;
    this.firstPageRequest = null;
    this.loadedAdditionalRunPages = false;
    this.runs = [];
    this.runsNextCursor = null;
    this.runsRequestState = "idle";
    this.isLoadingMoreRuns = false;
    this.runsPollFailureNotified = false;
    this.openRunId = null;
    this.rootStore.routineRunChatStore.newConversation();

    return this.runsSessionGeneration;
  }

  private ownsRunsSession(generation: number, routineId: string): boolean {
    return generation === this.runsSessionGeneration && routineId === this.runsRoutineId;
  }

  openForCreate = async () => {
    const generation = this.beginRunsSession(null);
    await this.loadFilterFields();
    if (generation !== this.runsSessionGeneration) return;

    runInAction(() => {
      this.activeTab = "details";
      this.disabledReason = null;
      this.openWith(
        this.withMergedFilterRows({
          ...EMPTY_ROUTINE_FORM,
          timezone: localTimeZone(),
        }),
      );
    });
  };

  openForEdit = async (routine: RoutineDto) => {
    const generation = this.beginRunsSession(routine.id);
    await this.loadFilterFields();
    if (!this.ownsRunsSession(generation, routine.id)) return;

    runInAction(() => {
      this.activeTab = "details";
      this.disabledReason = routine.enabled ? null : routine.disabledReason;
      this.openWith(this.withMergedFilterRows(routineFormFor(routine)));
    });
    void this.loadRuns(routine.id);
  };

  setActiveTab = (tab: "details" | "runs") => {
    this.activeTab = tab;
    if (tab === "runs" && this.form.id && this.runsRequestState === "idle") void this.loadRuns(this.form.id);
  };

  openRun = async (run: RoutineRunDto) => {
    if (run.conversationId && !this.canOpenRun(run)) return;

    const routineId = this.form.id;
    const generation = this.runsSessionGeneration;
    if (!routineId || !this.ownsRunsSession(generation, routineId)) return;

    runInAction(() => {
      this.activeTab = "runs";
      this.openRunId = run.id;
    });
    this.focusAfterRender("routine-run-detail-heading");

    if (!run.conversationId) this.rootStore.routineRunChatStore.newConversation();
    if (!run.conversationId) await this.refreshRun(routineId, run.id, generation);
    if (!this.ownsRunsSession(generation, routineId) || this.openRunId !== run.id) return;

    const current = this.openRun_;
    if (current?.conversationId && this.canOpenRun(current))
      await this.rootStore.routineRunChatStore.selectConversationForReadOnlyViewer(current.conversationId);
  };

  private refreshRun = async (routineId: string, runId: string, generation: number): Promise<void> => {
    try {
      const page = await this.requestFirstRunPage(routineId, generation);
      if (!this.ownsRunsSession(generation, routineId) || this.openRunId !== runId) return;

      runInAction(() => {
        this.mergeFreshRunPage(page);
        this.runsRequestState = "ready";
      });
      this.runsPollFailureNotified = false;
    } catch (error) {
      if (!this.ownsRunsSession(generation, routineId)) return;
      if (this.runsPollingActive) this.reportRunsBackgroundError(error);
      else reportApplicationError(error);
    }
  };

  closeRun = () => {
    const runId = this.openRunId;
    this.openRunId = null;
    if (runId) this.focusAfterRender(`routine-run-${runId}`, "routine-runs-heading", "routine-tab-runs");
  };

  private focusAfterRender(...ids: string[]): void {
    if (typeof document === "undefined") return;

    const focus = () => {
      for (const id of ids) {
        const target = document.getElementById(id);
        if (!target) continue;
        target.focus({ preventScroll: true });
        return;
      }
    };

    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
    else queueMicrotask(focus);
  }

  private requestFirstRunPage = async (routineId: string, generation: number): Promise<RoutineRunPage> => {
    const key = `${generation}:${routineId}`;
    if (this.firstPageRequest?.key === key) return this.firstPageRequest.promise;

    const promise = getRoutineRunsAction({ routineId });
    this.firstPageRequest = { key, promise };

    try {
      return await promise;
    } finally {
      if (this.firstPageRequest?.promise === promise) this.firstPageRequest = null;
    }
  };

  private normalizedRunCursor(cursor: unknown, previous?: string): string | null {
    return typeof cursor === "string" && cursor.length > 0 && cursor.length <= 500 && cursor !== previous
      ? cursor
      : null;
  }

  private deduplicatedRuns(runs: readonly RoutineRunDto[]): RoutineRunDto[] {
    const byId = new Map<string, RoutineRunDto>();
    for (const run of runs) if (!byId.has(run.id)) byId.set(run.id, run);

    return [...byId.values()];
  }

  private mergeFreshRunPage(page: RoutineRunPage): void {
    this.runs = this.deduplicatedRuns([...page.runs, ...this.runs]);
    if (!this.loadedAdditionalRunPages) this.runsNextCursor = this.normalizedRunCursor(page.nextCursor);
  }

  private replaceRunPage(page: RoutineRunPage): void {
    this.runs = this.deduplicatedRuns(page.runs);
    this.runsNextCursor = this.normalizedRunCursor(page.nextCursor);
    this.loadedAdditionalRunPages = false;
  }

  private openRunConversationAfterRefresh(previousConversationId: string | null): void {
    const run = this.openRun_;
    if (!run?.conversationId || run.conversationId === previousConversationId || !this.canOpenRun(run)) return;
    void this.rootStore.routineRunChatStore.selectConversationForReadOnlyViewer(run.conversationId);
  }

  loadRuns = async (routineId: string, force = false) => {
    const generation = this.runsSessionGeneration;
    if (!this.ownsRunsSession(generation, routineId)) return;
    if (!force && (this.runsRequestState === "loading" || this.runsRequestState === "ready")) return;

    runInAction(() => {
      this.runsRequestState = "loading";
    });

    try {
      const page = await this.requestFirstRunPage(routineId, generation);
      if (!this.ownsRunsSession(generation, routineId)) return;

      runInAction(() => {
        this.replaceRunPage(page);
        this.runsRequestState = "ready";
      });
      this.runsPollFailureNotified = false;
      if (this.hasActiveRuns) this.startRunsPolling(routineId);
    } catch (error) {
      if (!this.ownsRunsSession(generation, routineId)) return;
      runInAction(() => {
        this.runsRequestState = "error";
      });
      reportApplicationError(error);
    }
  };

  retryLoadRuns = async (): Promise<void> => {
    const routineId = this.form.id;
    if (!routineId) return;
    await this.loadRuns(routineId, true);
  };

  loadMoreRuns = async () => {
    const routineId = this.form?.id;
    if (!routineId || !this.runsNextCursor || this.isLoadingMoreRuns) return;

    const generation = this.runsSessionGeneration;
    const cursor = this.runsNextCursor;
    if (!this.ownsRunsSession(generation, routineId)) return;

    this.isLoadingMoreRuns = true;

    try {
      const page = await getRoutineRunsAction({
        routineId,
        cursor,
      });
      if (!this.ownsRunsSession(generation, routineId) || this.runsNextCursor !== cursor) return;

      runInAction(() => {
        this.runs = this.deduplicatedRuns([...this.runs, ...page.runs]);
        this.runsNextCursor = this.normalizedRunCursor(page.nextCursor, cursor);
        this.loadedAdditionalRunPages = true;
      });
    } catch (error) {
      if (!this.ownsRunsSession(generation, routineId)) return;
      reportApplicationError(error);
    } finally {
      if (this.ownsRunsSession(generation, routineId)) {
        runInAction(() => {
          this.isLoadingMoreRuns = false;
        });
      }
    }
  };

  private startRunsPolling(routineId: string, graceMs = 0): void {
    const generation = this.runsSessionGeneration;
    if (!this.ownsRunsSession(generation, routineId) || !this.isOpen) return;

    this.stopRunsPolling();
    const pollGeneration = ++this.runsPollGeneration;
    const now = Date.now();
    this.runsPollingActive = true;
    this.runsPollFailureNotified = false;
    this.runsPollDeadline = now + ROUTINE_RUN_POLL_MAX_MS;
    this.runsPollGraceDeadline = now + graceMs;
    this.scheduleNextRunsPoll(routineId, generation, pollGeneration);
  }

  private stopRunsPolling(): void {
    this.runsPollingActive = false;
    this.runsPollGeneration += 1;
    if (!this.runsPollTimer) return;
    clearTimeout(this.runsPollTimer);
    this.runsPollTimer = null;
  }

  private ownsRunsPoll(routineId: string, generation: number, pollGeneration: number): boolean {
    return (
      this.runsPollingActive &&
      this.isOpen &&
      pollGeneration === this.runsPollGeneration &&
      this.ownsRunsSession(generation, routineId)
    );
  }

  private scheduleNextRunsPoll(routineId: string, generation: number, pollGeneration: number): void {
    if (!this.ownsRunsPoll(routineId, generation, pollGeneration)) return;

    const now = Date.now();
    if (now >= this.runsPollDeadline || (!this.hasActiveRuns && now >= this.runsPollGraceDeadline)) {
      this.stopRunsPolling();
      return;
    }

    this.runsPollTimer = setTimeout(
      () => void this.runRunsPoll(routineId, generation, pollGeneration),
      ROUTINE_RUN_POLL_INTERVAL_MS,
    );
  }

  private runRunsPoll = async (routineId: string, generation: number, pollGeneration: number): Promise<void> => {
    if (!this.ownsRunsPoll(routineId, generation, pollGeneration)) return;
    this.runsPollTimer = null;
    const previousConversationId = this.openRun_?.conversationId ?? null;

    try {
      const page = await this.requestFirstRunPage(routineId, generation);
      if (!this.ownsRunsPoll(routineId, generation, pollGeneration)) return;

      runInAction(() => {
        this.mergeFreshRunPage(page);
        this.runsRequestState = "ready";
      });
      this.runsPollFailureNotified = false;
      this.openRunConversationAfterRefresh(previousConversationId);
    } catch (error) {
      if (!this.ownsRunsPoll(routineId, generation, pollGeneration)) return;
      this.reportRunsBackgroundError(error);
    } finally {
      this.scheduleNextRunsPoll(routineId, generation, pollGeneration);
    }
  };

  runNow = async () => {
    const routineId = this.form.id;
    if (
      !routineId ||
      !this.isOwner ||
      !this.form.enabled ||
      this.form.triggerKind !== RoutineTriggerKind.schedule ||
      this.hasUnsavedChanges
    )
      return;

    this.isStartingRun = true;

    try {
      const res = await runRoutineNowAction({ routineId });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }

      runInAction(() => {
        this.activeTab = "runs";
      });
      this.startRunsPolling(routineId, ROUTINE_RUN_POLL_GRACE_MS);
      await this.refreshRunPage(routineId);
      this.toastSuccess("RoutineDetail.testTriggerStarted");
    } finally {
      runInAction(() => {
        this.isStartingRun = false;
      });
    }
  };

  private refreshRunPage = async (routineId: string): Promise<void> => {
    const generation = this.runsSessionGeneration;
    if (!this.ownsRunsSession(generation, routineId)) return;
    const previousConversationId = this.openRun_?.conversationId ?? null;

    try {
      const page = await this.requestFirstRunPage(routineId, generation);
      if (!this.ownsRunsSession(generation, routineId)) return;
      runInAction(() => {
        this.mergeFreshRunPage(page);
        this.runsRequestState = "ready";
      });
      this.runsPollFailureNotified = false;
      this.openRunConversationAfterRefresh(previousConversationId);
    } catch (error) {
      if (!this.ownsRunsSession(generation, routineId)) return;
      if (this.runsRequestState !== "ready") {
        runInAction(() => {
          this.runsRequestState = "error";
        });
      }
      this.reportRunsBackgroundError(error);
    }
  };

  private reportRunsBackgroundError(error: unknown): void {
    if (this.runsPollFailureNotified) return;
    this.runsPollFailureNotified = true;
    reportApplicationError(error);
  }

  pause = async (): Promise<boolean> => {
    if (!this.form.id || !this.canAdministerOtherRoutine || this.hasUnsavedChanges) return false;

    this.setIsLoading(true);
    try {
      const res = await pauseRoutineAction({ routineId: this.form.id });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.applyRoutine(res.data);
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  private applyRoutine = async (routine: RoutineDto) => {
    await this.rootStore.routinesStore.upsertItem(routine);
    runInAction(() => {
      this.disabledReason = routine.enabled ? null : routine.disabledReason;
      this.onInitOrRefresh(this.withMergedFilterRows(routineFormFor(routine)));
    });
  };

  private withMergedFilterRows = (form: RoutineModalForm): RoutineModalForm => {
    const entityType = entityTypeForEvents(form.triggerEvents ?? []);
    const fields = entityType ? (this.filterableFieldsByEntityType[entityType] ?? []) : [];

    return {
      ...form,
      triggerFilters: mergeFilters(fields, (form.triggerFilters as Filter[]) ?? []),
    };
  };

  loadFilterFields = async () => {
    if (this.filterFieldsLoaded) return;
    if (this.filterFieldsLoadPromise) return this.filterFieldsLoadPromise;

    const promise = getRoutineFilterFieldsAction().then(({ filterableFields, customColumns }) => {
      const byEntityType: Partial<Record<EntityType, CustomColumnDto[]>> = {};
      for (const column of customColumns) (byEntityType[column.entityType] ??= []).push(column);

      runInAction(() => {
        this.filterableFieldsByEntityType = filterableFields;
        this.customColumnsByEntityType = byEntityType;
      });
      this.filterFieldsLoaded = true;
    });
    this.filterFieldsLoadPromise = promise;

    try {
      await promise;
    } finally {
      if (this.filterFieldsLoadPromise === promise) this.filterFieldsLoadPromise = null;
    }
  };

  get compiledCron(): string {
    const form = this.form;

    return cronForSchedule({
      preset: form?.schedulePreset ?? DEFAULT_ROUTINE_SCHEDULE.preset,
      hour: Number(form?.scheduleHour ?? DEFAULT_ROUTINE_SCHEDULE.hour),
      minute: Number(form?.scheduleMinute ?? DEFAULT_ROUTINE_SCHEDULE.minute),
      weekday: Number(form?.scheduleWeekday ?? DEFAULT_ROUTINE_SCHEDULE.weekday),
      dayOfMonth: Number(form?.scheduleDayOfMonth ?? DEFAULT_ROUTINE_SCHEDULE.dayOfMonth),
      expression: form?.cronExpression ?? "",
    });
  }

  useSchedulePreset = () => {
    if (!this.form || !this.canManage) return;
    this.form.schedulePreset = DEFAULT_ROUTINE_SCHEDULE.preset;
    this.form.cronExpression = DEFAULT_ROUTINE_SCHEDULE.expression;
  };

  get payload(): UpsertRoutineData {
    const form = toJS(this.form);
    const scheduled = form.triggerKind === RoutineTriggerKind.schedule;

    return {
      id: form.id,
      name: form.name,
      prompt: form.prompt,
      enabled: form.enabled,
      triggerKind: form.triggerKind,
      timezone: form.timezone,
      triggerEvents: scheduled ? [] : form.triggerEvents,
      changedFields:
        scheduled || !this.triggerEntityType || !this.watchesRecordChanges ? [] : (form.changedFields ?? []),
      triggerFilters:
        scheduled || !this.triggerEntityType ? [] : (form.triggerFilters ?? []).filter(hasValidFilterConfiguration),
      cronExpression: scheduled ? this.compiledCron : null,
    };
  }

  delete = async (): Promise<boolean> => {
    if (!this.form.id || !this.isAdmin) return false;

    this.setIsLoading(true);
    try {
      const res = await deleteRoutineAction({ id: this.form.id });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.rootStore.routinesStore.removeItem(res.data);
      this.close();
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!this.canManage) return;
    this.setIsLoading(true);

    try {
      const res = await upsertRoutineAction(this.payload);

      if (res.ok) {
        await this.rootStore.routinesStore.upsertItem(res.data);
        this.close();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
