import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertRoutineData } from "@/ee/routines/routine.schema";
import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { RoutineSchedulePreset } from "@/ee/routines/routine-schedule-preset";

import { action, makeObservable, toJS } from "mobx";
import { Resource, RoutineTriggerKind } from "@/generated/prisma";

import { deleteRoutineAction, upsertRoutineAction } from "../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { DEFAULT_ROUTINE_TIMEZONE } from "@/ee/routines/routine-schedule";
import { DEFAULT_ROUTINE_SCHEDULE, cronForSchedule, scheduleFromCron } from "@/ee/routines/routine-schedule-preset";

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
  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY_ROUTINE_FORM, Resource.api);

    makeObservable(this, {
      delete: action,
      onSubmit: action,
    });
  }

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
