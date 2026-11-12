import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { BookingLinkDto, BookingQuestion } from "@/ee/calendar/booking.schema";
import type { BookingSetup } from "@/ee/calendar/booking-setup";
import type { WorkingHours, WorkingWeekday } from "@/ee/calendar/working-hours";

import { action, makeObservable, observable } from "mobx";

import { Resource } from "@/generated/prisma";

import { saveBookingLinkAction } from "../booking/actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { browserTimeZone } from "@/core/utils/time-zone";
import { DEFAULT_WORKING_HOURS } from "@/ee/calendar/working-hours";

export type BookingLinkForm = {
  id: string;
  title: string;
  description: string;
  calendarId: string;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  horizonDays: number;
  timeZone: string;
  workingHours: WorkingHours;
  withVideo: boolean;
  personTypeId: string;
  recordTypeId: string;
  startFieldId: string;
  questions: BookingQuestion[];
  successMessage: string;
  enabled: boolean;
};

const EMPTY_SETUP: BookingSetup = { calendars: [], lists: [], blockedReason: null };

function emptyForm(setup: BookingSetup): BookingLinkForm {
  return {
    id: "",
    title: "",
    description: "",
    calendarId: setup.calendars[0]?.id ?? "",
    durationMinutes: 30,
    bufferMinutes: 0,
    minNoticeMinutes: 240,
    horizonDays: 30,
    timeZone: browserTimeZone(),
    workingHours: structuredClone(DEFAULT_WORKING_HOURS),
    withVideo: false,
    personTypeId: "",
    recordTypeId: "",
    startFieldId: "",
    questions: [],
    successMessage: "",
    enabled: true,
  };
}

export class BookingLinkModalStore extends BaseModalStore<BookingLinkForm> {
  setup: BookingSetup = EMPTY_SETUP;
  onSaved: (() => void) | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, emptyForm(EMPTY_SETUP), Resource.inboxMessages);

    makeObservable(this, {
      setup: observable.ref,
      configure: action,
      start: action,
    });
  }

  configure = (setup: BookingSetup, onSaved: () => void) => {
    this.setup = setup;
    this.onSaved = onSaved;
  };

  get selectedRecordList() {
    return this.setup.lists.find((list) => list.id === this.form.recordTypeId) ?? null;
  }

  get unusedQuestionFields() {
    const used = new Set(this.form.questions.map((question) => question.fieldId));
    return (this.selectedRecordList?.questionFields ?? []).filter((field) => !used.has(field.id));
  }

  start = (link?: BookingLinkDto, invoker?: HTMLElement | null) => {
    this.onInitOrRefresh(
      link
        ? {
            id: link.id,
            title: link.title,
            description: link.description ?? "",
            calendarId: link.calendarId,
            durationMinutes: link.durationMinutes,
            bufferMinutes: link.bufferMinutes,
            minNoticeMinutes: link.minNoticeMinutes,
            horizonDays: link.horizonDays,
            timeZone: link.timeZone,
            workingHours: structuredClone(link.workingHours),
            withVideo: link.withVideo,
            personTypeId: link.personTypeId ?? "",
            recordTypeId: link.recordTypeId ?? "",
            startFieldId: link.startFieldId ?? "",
            questions: structuredClone(link.questions),
            successMessage: link.successMessage ?? "",
            enabled: link.enabled,
          }
        : emptyForm(this.setup),
    );
    if (invoker) this.openFrom(invoker);
    else this.open();
  };

  setRecordList = (typeId: string) => {
    this.onChange("recordTypeId", typeId);
    this.onChange("startFieldId", "");
    this.onChange("questions", []);
  };

  setDay = (day: WorkingWeekday, patch: { open?: boolean; start?: string; end?: string }) => {
    const first = this.form.workingHours[day][0] ?? { start: "09:00", end: "17:00" };
    const open = patch.open ?? this.form.workingHours[day].length > 0;
    this.onChange(
      `workingHours.${day}`,
      open ? [{ start: patch.start ?? first.start, end: patch.end ?? first.end }] : [],
    );
  };

  addQuestion = (fieldId: string) => {
    this.onChange("questions", [...this.form.questions, { fieldId, required: false }]);
  };

  setQuestion = (index: number, patch: Partial<BookingQuestion>) => {
    this.onChange(
      "questions",
      this.form.questions.map((question, position) => (position === index ? { ...question, ...patch } : question)),
    );
  };

  removeQuestion = (index: number) => {
    this.onChange(
      "questions",
      this.form.questions.filter((_, position) => position !== index),
    );
  };

  protected override prepareToClose(): boolean {
    return !this.isLoading;
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isLoading) return;

    this.setIsLoading(true);
    let saved = false;
    try {
      const { form } = this;
      const result = await saveBookingLinkAction({
        ...(form.id ? { id: form.id } : {}),
        calendarId: form.calendarId,
        title: form.title,
        description: form.description.trim() || null,
        durationMinutes: form.durationMinutes,
        bufferMinutes: form.bufferMinutes,
        minNoticeMinutes: form.minNoticeMinutes,
        horizonDays: form.horizonDays,
        timeZone: form.timeZone,
        workingHours: form.workingHours,
        withVideo: form.withVideo,
        personTypeId: form.personTypeId || null,
        recordTypeId: form.recordTypeId || null,
        startFieldId: form.recordTypeId ? form.startFieldId || null : null,
        questions: form.recordTypeId ? form.questions : [],
        successMessage: form.successMessage.trim() || null,
        enabled: form.enabled,
      });
      if (!result.ok) {
        this.setError(result.error as never);
        return;
      }

      saved = true;
      this.toastSuccess("Booking.saved");
      this.close();
      this.onSaved?.();
    } finally {
      if (!saved) this.setIsLoading(false);
    }
  };
}
