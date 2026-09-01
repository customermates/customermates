import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertRoutineData } from "@/ee/routines/routine.schema";
import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { RoutineSchedulePreset } from "@/ee/routines/routine-schedule-preset";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { action, computed, makeObservable, observable, runInAction, toJS } from "mobx";
import type { EntityType } from "@/generated/prisma";
import { Resource, RoutineTriggerKind } from "@/generated/prisma";

import { deleteRoutineAction, getRoutineFilterFieldsAction, upsertRoutineAction } from "../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { DEFAULT_ROUTINE_TIMEZONE } from "@/ee/routines/routine-schedule";
import { DEFAULT_ROUTINE_SCHEDULE, cronForSchedule, scheduleFromCron } from "@/ee/routines/routine-schedule-preset";
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
  name: "",
  prompt: "",
  enabled: true,
  triggerKind: RoutineTriggerKind.schedule,
  timezone: DEFAULT_ROUTINE_TIMEZONE,
  triggerEvents: [],
  changedFields: [],
  triggerFilters: [],
  maxRunsPerHour: 4,
  maxCreditsPerRun: 10,
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
    maxRunsPerHour: routine.maxRunsPerHour,
    maxCreditsPerRun: routine.maxCreditsPerRun,
    schedulePreset: schedule.preset,
    scheduleHour: String(schedule.hour),
    scheduleMinute: String(schedule.minute),
    scheduleWeekday: String(schedule.weekday),
    scheduleDayOfMonth: String(schedule.dayOfMonth),
    cronExpression: schedule.expression,
  };
}

export class RoutineModalStore extends BaseModalStore<RoutineModalForm> {
  filterableFieldsByEntityType: Partial<Record<EntityType, FilterableField[]>> = {};
  customColumnsByEntityType: Partial<Record<EntityType, CustomColumnDto[]>> = {};
  private filterFieldsLoaded = false;

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY_ROUTINE_FORM, Resource.api);

    makeObservable(this, {
      filterableFieldsByEntityType: observable,
      customColumnsByEntityType: observable,

      triggerEntityType: computed,
      filterableFields: computed,
      customColumns: computed,

      delete: action,
      onSubmit: action,
      loadFilterFields: action,
      openForCreate: action,
      openForEdit: action,
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

  openForCreate = async () => {
    await this.loadFilterFields();
    this.openWith(this.withMergedFilterRows(EMPTY_ROUTINE_FORM));
  };

  openForEdit = async (routine: RoutineDto) => {
    await this.loadFilterFields();
    this.openWith(this.withMergedFilterRows(routineFormFor(routine)));
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
      maxRunsPerHour: form.maxRunsPerHour,
      maxCreditsPerRun: form.maxCreditsPerRun,
      cronExpression: scheduled
        ? cronForSchedule({
            preset: form.schedulePreset,
            hour: Number(form.scheduleHour),
            minute: Number(form.scheduleMinute),
            weekday: Number(form.scheduleWeekday),
            dayOfMonth: Number(form.scheduleDayOfMonth),
            expression: form.cronExpression ?? "",
          })
        : null,
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
