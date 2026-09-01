import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertRoutineData } from "@/ee/routines/routine.schema";
import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { RoutineSchedulePreset } from "@/ee/routines/routine-schedule-preset";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { RoutineRunDto } from "@/ee/routines/routine.schema";
import type { RoutineRiskDto } from "@/ee/routines/get-routine-risks.interactor";

import { action, computed, makeObservable, observable, runInAction, toJS } from "mobx";
import type { EntityType } from "@/generated/prisma";
import { Resource, RoutineTriggerKind } from "@/generated/prisma";

import {
  deleteRoutineAction,
  getRoutineFilterFieldsAction,
  getRoutineRisksAction,
  getRoutineRunsAction,
  runRoutineNowAction,
  upsertRoutineAction,
} from "../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { DEFAULT_ROUTINE_TIMEZONE } from "@/ee/routines/routine-schedule";
import {
  DEFAULT_ROUTINE_SCHEDULE,
  cronForSchedule,
  localTimeZone,
  scheduleFromCron,
} from "@/ee/routines/routine-schedule-preset";
import { entityTypeForEvents } from "@/ee/routines/routine-event-filter";

function mergeFilters(filterableFields: FilterableField[], current: Filter[]): Filter[] {
  const existing = new Map<string, Filter>();
  for (const filter of Array.isArray(current) ? current : [])
    if (filter && typeof filter.field === "string") existing.set(filter.field, filter);

  return filterableFields.map((field) => {
    const match = existing.get(field.field);
    if (!match) return { field: field.field, operator: undefined, value: undefined } as unknown as Filter;

    return {
      field: match.field,
      operator: match.operator,
      ...("value" in match ? { value: match.value } : {}),
    } as Filter;
  });
}

export type RoutineModalForm = UpsertRoutineData & {
  schedulePreset: RoutineSchedulePreset;
  scheduleHour: string;
  scheduleMinute: string;
  scheduleWeekday: string;
  scheduleDayOfMonth: string;
};

export const EMPTY_ROUTINE_FORM: RoutineModalForm = {
  id: undefined,
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
    name: routine.name,
    prompt: routine.prompt,
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
  risks: RoutineRiskDto[] = [];
  openRunId: string | null = null;
  isRunsLoading = false;
  isStartingRun = false;
  filterableFieldsByEntityType: Partial<Record<EntityType, FilterableField[]>> = {};
  customColumnsByEntityType: Partial<Record<EntityType, CustomColumnDto[]>> = {};
  private filterFieldsLoaded = false;

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY_ROUTINE_FORM, Resource.api);

    makeObservable(this, {
      activeTab: observable,
      runs: observable,
      risks: observable,
      openRunId: observable,
      isRunsLoading: observable,
      isStartingRun: observable,
      filterableFieldsByEntityType: observable,
      customColumnsByEntityType: observable,

      openRun_: computed,
      triggerEntityType: computed,
      filterableFields: computed,
      customColumns: computed,

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
      runNow: action,
    });
  }

  get triggerEntityType(): EntityType | null {
    return entityTypeForEvents(this.form?.triggerEvents ?? []);
  }

  get filterableFields(): FilterableField[] {
    const entityType = this.triggerEntityType;

    return entityType ? (this.filterableFieldsByEntityType[entityType] ?? []) : [];
  }

  get customColumns(): CustomColumnDto[] {
    const entityType = this.triggerEntityType;

    return entityType ? (this.customColumnsByEntityType[entityType] ?? []) : [];
  }

  get openRun_(): RoutineRunDto | null {
    return this.runs.find((run) => run.id === this.openRunId) ?? null;
  }

  openForCreate = async () => {
    await this.loadFilterFields();
    this.activeTab = "details";
    this.openRunId = null;
    this.runs = [];
    this.risks = [];
    this.openWith(this.withMergedFilterRows({ ...EMPTY_ROUTINE_FORM, timezone: localTimeZone() }));
  };

  openForEdit = async (routine: RoutineDto) => {
    await this.loadFilterFields();
    this.activeTab = "details";
    this.openRunId = null;
    this.openWith(this.withMergedFilterRows(routineFormFor(routine)));
    void this.loadRuns(routine.id);
  };

  setActiveTab = (tab: "details" | "runs") => {
    this.activeTab = tab;
    if (tab === "runs" && this.form.id) void this.loadRuns(this.form.id);
  };

  openRun = async (run: RoutineRunDto) => {
    runInAction(() => {
      this.openRunId = run.id;
    });

    let conversationId = run.conversationId;
    if (!conversationId && this.form.id) {
      await this.loadRuns(this.form.id);
      conversationId = this.runs.find((candidate) => candidate.id === run.id)?.conversationId ?? null;
    }

    if (conversationId) await this.rootStore.routineRunChatStore.selectConversation(conversationId);
  };

  closeRun = () => {
    this.openRunId = null;
  };

  loadRuns = async (routineId: string) => {
    this.isRunsLoading = true;

    try {
      const [runs, risks] = await Promise.all([
        getRoutineRunsAction({ routineId, limit: 25 }),
        getRoutineRisksAction({ routineId }),
      ]);

      runInAction(() => {
        this.runs = runs;
        this.risks = risks;
      });
    } finally {
      runInAction(() => {
        this.isRunsLoading = false;
      });
    }
  };

  runNow = async () => {
    const routineId = this.form.id;
    if (!routineId) return;

    this.isStartingRun = true;

    try {
      const res = await runRoutineNowAction({ routineId });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }

      await this.loadRuns(routineId);
    } finally {
      runInAction(() => {
        this.isStartingRun = false;
      });
    }
  };

  private withMergedFilterRows = (form: RoutineModalForm): RoutineModalForm => {
    const entityType = entityTypeForEvents(form.triggerEvents ?? []);
    const fields = entityType ? (this.filterableFieldsByEntityType[entityType] ?? []) : [];

    return { ...form, triggerFilters: mergeFilters(fields, (form.triggerFilters as Filter[]) ?? []) };
  };

  loadFilterFields = async () => {
    if (this.filterFieldsLoaded) return;
    this.filterFieldsLoaded = true;

    const { filterableFields, customColumns } = await getRoutineFilterFieldsAction();
    const byEntityType: Partial<Record<EntityType, CustomColumnDto[]>> = {};
    for (const column of customColumns) (byEntityType[column.entityType] ??= []).push(column);

    runInAction(() => {
      this.filterableFieldsByEntityType = filterableFields;
      this.customColumnsByEntityType = byEntityType;
    });
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
    if (!this.form) return;
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
      changedFields: scheduled ? [] : (form.changedFields ?? []),
      triggerFilters: scheduled ? [] : (form.triggerFilters ?? []).filter(hasValidFilterConfiguration),
      cronExpression: scheduled ? this.compiledCron : null,
    };
  }

  delete = async (): Promise<boolean> => {
    if (!this.form.id) return false;

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
