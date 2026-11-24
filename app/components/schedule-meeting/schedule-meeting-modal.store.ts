import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { MeetingOptions } from "@/ee/calendar/meeting.schema";
import type { RecordRef } from "@/features/records/record-model.schema";

import { action, makeObservable, observable, runInAction } from "mobx";

import { Resource } from "@/generated/prisma";

import {
  cancelMeetingAction,
  freeSlotsAction,
  meetingEventAction,
  meetingOptionsAction,
  scheduleMeetingAction,
  updateMeetingAction,
} from "@/app/[locale]/(protected)/w/[workspace]/calendar/schedule-actions";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { actionData } from "@/core/utils/action-data";
import { browserTimeZone } from "@/core/utils/time-zone";
import { zonedDate, zonedDayStart, zonedInstant, zonedParts } from "@/features/record-calendar/zoned-time";

export type ScheduleMeetingForm = {
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  durationMinutes: number;
  calendarId: string;
  attendees: string[];
  videoLink: boolean;
  sendInvites: boolean;
  followUpTypeId: string;
  followUpDateFieldId: string;
};

export type MeetingSlot = { startsAt: string; endsAt: string };

export type ScheduleMeetingStart = {
  record?: RecordRef;
  title?: string;
  date?: string;
  minutes?: number | null;
  timeZone?: string;
};

export type EditMeetingStart = { eventId: string; timeZone?: string };

export type EditableMeetingEvent = {
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  attendees: { email: string; isOrganizer?: boolean }[];
};

const MINUTE_MS = 60_000;

const DEFAULT_MINUTES = 9 * 60;
const DEFAULT_DURATION = 30;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

function emptyForm(date: string, time: string): ScheduleMeetingForm {
  return {
    title: "",
    description: "",
    location: "",
    date,
    time,
    durationMinutes: DEFAULT_DURATION,
    calendarId: "",
    attendees: [],
    videoLink: false,
    sendInvites: true,
    followUpTypeId: "",
    followUpDateFieldId: "",
  };
}

export function eventForm(event: EditableMeetingEvent, timeZone: string): Partial<ScheduleMeetingForm> {
  const startsAt = new Date(event.startsAt);
  const parts = zonedParts(startsAt, timeZone);
  return {
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    date: zonedDate(startsAt, timeZone),
    time: clock(parts.hour * 60 + parts.minute),
    durationMinutes: Math.round((new Date(event.endsAt).getTime() - startsAt.getTime()) / MINUTE_MS),
    attendees: event.attendees.filter((attendee) => !attendee.isOrganizer).map((attendee) => attendee.email),
  };
}

export function meetingChanges(form: ScheduleMeetingForm, saved: ScheduleMeetingForm, startsAt: string) {
  const timing = form.date !== saved.date || form.time !== saved.time || form.durationMinutes !== saved.durationMinutes;
  const sameAttendees =
    form.attendees.length === saved.attendees.length &&
    form.attendees.every((email) => saved.attendees.includes(email));
  return {
    ...(form.title !== saved.title ? { title: form.title } : {}),
    ...(form.description !== saved.description ? { description: form.description } : {}),
    ...(form.location !== saved.location ? { location: form.location } : {}),
    ...(timing ? { startsAt, durationMinutes: form.durationMinutes } : {}),
    ...(sameAttendees ? {} : { attendees: form.attendees.map((email) => ({ email })) }),
    sendInvites: form.sendInvites,
  };
}

export class ScheduleMeetingModalStore extends BaseModalStore<ScheduleMeetingForm> {
  options: MeetingOptions | null = null;
  optionsFailed = false;
  slots: MeetingSlot[] = [];
  slotsLoading = false;
  timeZone = "UTC";
  record: RecordRef | null = null;
  editingId: string | null = null;
  eventLoaded = false;
  cancelConfirmOpen = false;
  private slotRequest = 0;

  constructor(rootStore: RootStore) {
    super(rootStore, emptyForm("1970-01-01", clock(DEFAULT_MINUTES)), Resource.inboxMessages, { register: true });

    makeObservable(this, {
      options: observable.ref,
      optionsFailed: observable,
      slots: observable.ref,
      slotsLoading: observable,
      timeZone: observable,
      record: observable.ref,
      editingId: observable,
      eventLoaded: observable,
      cancelConfirmOpen: observable,
      start: action,
      edit: action,
      setCancelConfirm: action,
    });
  }

  get unavailable(): "selfHosted" | "demo" | null {
    if (this.rootStore.appMode === "self-hosted") return "selfHosted";
    return this.rootStore.appMode === "demo" ? "demo" : null;
  }

  get followUpFields() {
    return this.options?.actionLists.find((list) => list.typeId === this.form.followUpTypeId)?.dateFields ?? [];
  }

  get startsAt(): string | null {
    const [hour, minute] = this.form.time.split(":").map(Number);
    if (!this.form.date || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;

    return zonedInstant(this.form.date, { hour, minute, second: 0, millisecond: 0 }, this.timeZone).toISOString();
  }

  start = (input: ScheduleMeetingStart = {}, invoker?: HTMLElement | null) => {
    const timeZone = input.timeZone ?? browserTimeZone();
    const now = new Date();
    const parts = zonedParts(now, timeZone);
    const todayMinutes = Math.min(23 * 60, (parts.hour + 1) * 60);
    const minutes = input.minutes ?? (input.date ? DEFAULT_MINUTES : todayMinutes);

    this.timeZone = timeZone;
    this.record = input.record ?? null;
    this.editingId = null;
    this.eventLoaded = false;
    this.options = null;
    this.optionsFailed = false;
    this.slots = [];
    this.onInitOrRefresh({
      ...emptyForm(input.date ?? zonedDate(now, timeZone), clock(minutes)),
      title: input.title ?? "",
    });
    if (invoker) this.openFrom(invoker);
    else this.open();
    if (this.unavailable) return;
    void this.loadOptions().catch(reportApplicationError);
    void this.loadSlots().catch(reportApplicationError);
  };

  edit = (input: EditMeetingStart, invoker?: HTMLElement | null) => {
    const timeZone = input.timeZone ?? browserTimeZone();

    this.timeZone = timeZone;
    this.record = null;
    this.editingId = input.eventId;
    this.eventLoaded = false;
    this.cancelConfirmOpen = false;
    this.options = null;
    this.optionsFailed = false;
    this.slots = [];
    this.onInitOrRefresh(emptyForm(zonedDate(new Date(), timeZone), clock(DEFAULT_MINUTES)));
    if (invoker) this.openFrom(invoker);
    else this.open();
    if (this.unavailable) return;
    void this.loadEvent(input.eventId).catch(reportApplicationError);
  };

  private loadEvent = async (id: string) => {
    try {
      const event = await actionData(meetingEventAction({ id }));
      if (this.editingId !== id) return;
      runInAction(() => {
        this.onInitOrRefresh({ ...this.form, ...eventForm(event, this.timeZone) });
        this.eventLoaded = true;
      });
      await this.loadSlots();
    } catch (error) {
      runInAction(() => (this.optionsFailed = true));
      throw error;
    }
  };

  private loadOptions = async () => {
    try {
      const options = await actionData(meetingOptionsAction(this.record ? { record: this.record } : {}));
      runInAction(() => {
        const recordTypeId = this.record?.typeId;
        const followUp = recordTypeId
          ? options.actionLists.find((list) => list.linkableTypeIds.includes(recordTypeId))
          : undefined;
        this.options = options;
        this.form = {
          ...this.form,
          calendarId: options.calendars[0]?.id ?? "",
          attendees: options.attendees.map((attendee) => attendee.email),
          followUpTypeId: followUp?.typeId ?? "",
          followUpDateFieldId: followUp?.dateFields[0]?.id ?? "",
        };
        this.savedState = { ...this.form };
      });
    } catch (error) {
      runInAction(() => (this.optionsFailed = true));
      throw error;
    }
  };

  loadSlots = async () => {
    const request = ++this.slotRequest;
    if (!this.form.date) return;
    runInAction(() => (this.slotsLoading = true));
    try {
      const result = await actionData(
        freeSlotsAction({
          durationMinutes: this.form.durationMinutes,
          timeZone: this.timeZone,
          from: zonedDayStart(this.form.date, this.timeZone).toISOString(),
          days: 1,
        }),
      );
      if (request === this.slotRequest) runInAction(() => (this.slots = result.slots));
    } catch (error) {
      if (request === this.slotRequest) runInAction(() => (this.slots = []));
      reportApplicationError(error);
    } finally {
      if (request === this.slotRequest) runInAction(() => (this.slotsLoading = false));
    }
  };

  setDate = (date: string | undefined) => {
    if (!date) return;
    this.onChange("date", date);
    void this.loadSlots();
  };

  setDuration = (minutes: number) => {
    this.onChange("durationMinutes", minutes);
    void this.loadSlots();
  };

  slotLabel = (slot: MeetingSlot): string => {
    const parts = zonedParts(new Date(slot.startsAt), this.timeZone);
    return `${pad(parts.hour)}:${pad(parts.minute)}`;
  };

  pickSlot = (slot: MeetingSlot) => {
    this.onChange("time", this.slotLabel(slot));
  };

  setFollowUpList = (typeId: string) => {
    const list = this.options?.actionLists.find((item) => item.typeId === typeId);
    this.onChange("followUpTypeId", typeId);
    this.onChange("followUpDateFieldId", list?.dateFields[0]?.id ?? "");
  };

  protected override prepareToClose(): boolean {
    return !this.isLoading;
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const startsAt = this.startsAt;
    if (this.isLoading || !startsAt) return;
    if (this.editingId) return this.saveChanges(this.editingId, startsAt);

    this.setIsLoading(true);
    let created = false;
    try {
      const { form } = this;
      const result = await scheduleMeetingAction({
        calendarId: form.calendarId || undefined,
        title: form.title,
        description: form.description || undefined,
        location: form.location || undefined,
        startsAt,
        durationMinutes: form.durationMinutes,
        timeZone: this.timeZone,
        attendees: form.attendees.map((email) => ({ email })),
        videoLink: form.videoLink,
        sendInvites: form.sendInvites,
        records: this.record ? [this.record] : [],
        ...(form.followUpTypeId && form.followUpDateFieldId
          ? { followUp: { typeId: form.followUpTypeId, dateFieldId: form.followUpDateFieldId } }
          : {}),
      });
      if (!result.ok) {
        this.setError(result.error as never);
        return;
      }

      created = true;
      this.toastSuccess("ScheduleMeeting.created");
      if (result.data.warnings.length) this.toastError("ScheduleMeeting.partial");
      this.close();
      await this.rootStore.recordWorkspaceStore.invalidate();
    } finally {
      if (!created) this.setIsLoading(false);
    }
  };

  setCancelConfirm = (open: boolean) => {
    this.cancelConfirmOpen = open;
  };

  cancelMeeting = async () => {
    const id = this.editingId;
    if (!id || this.isLoading) return;

    this.setIsLoading(true);
    let cancelled = false;
    try {
      const result = await cancelMeetingAction({ id });
      this.setCancelConfirm(false);
      if (!result.ok) {
        this.setError(result.error as never);
        return;
      }

      cancelled = true;
      this.toastSuccess("ScheduleMeeting.cancelDone");
      this.close();
      await this.rootStore.recordWorkspaceStore.invalidate();
    } finally {
      if (!cancelled) this.setIsLoading(false);
    }
  };

  private saveChanges = async (id: string, startsAt: string) => {
    this.setIsLoading(true);
    let saved = false;
    try {
      const result = await updateMeetingAction({ id, ...meetingChanges(this.form, this.savedState, startsAt) });
      if (!result.ok) {
        this.setError(result.error as never);
        return;
      }

      saved = true;
      this.toastSuccess("ScheduleMeeting.updated");
      this.close();
      await this.rootStore.recordWorkspaceStore.invalidate();
    } finally {
      if (!saved) this.setIsLoading(false);
    }
  };
}
