"use server";

import type {
  FreeSlotsQuery,
  MeetingOptionsQuery,
  MeetingScope,
  ScheduleMeetingInput,
  UpdateMeetingInput,
} from "@/ee/calendar/meeting.schema";

import {
  getCancelMeetingInteractor,
  getGetCalendarEventByIdInteractor,
  getGetFreeSlotsInteractor,
  getGetMeetingOptionsInteractor,
  getScheduleMeetingInteractor,
  getUpdateMeetingInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedResult } from "@/core/utils/action-result";

export async function meetingOptionsAction(input: MeetingOptionsQuery) {
  return serializeTypedResult(getGetMeetingOptionsInteractor().invoke(input));
}

export async function freeSlotsAction(input: Omit<FreeSlotsQuery, "days" | "bufferMinutes"> & { days?: number }) {
  return serializeTypedResult(getGetFreeSlotsInteractor().invoke(input as FreeSlotsQuery));
}

export async function scheduleMeetingAction(input: ScheduleMeetingInput) {
  return serializeResult(getScheduleMeetingInteractor().invoke(input as never));
}

export async function meetingEventAction(input: { id: string }) {
  return serializeTypedResult(getGetCalendarEventByIdInteractor().invoke({ id: input.id }));
}

export async function updateMeetingAction(input: UpdateMeetingInput) {
  return serializeResult(getUpdateMeetingInteractor().invoke(input as never));
}

export async function cancelMeetingAction(input: { id: string; scope?: MeetingScope }) {
  return serializeResult(getCancelMeetingInteractor().invoke({ id: input.id, scope: input.scope } as never));
}

export async function moveMeetingAction(
  input: Pick<UpdateMeetingInput, "id" | "startsAt" | "endsAt" | "startDate" | "endDate" | "scope"> & {
    sendInvites: boolean;
  },
) {
  return serializeResult(
    getUpdateMeetingInteractor().invoke({
      id: input.id,
      ...(input.startDate !== undefined
        ? { startDate: input.startDate, endDate: input.endDate }
        : { startsAt: input.startsAt, endsAt: input.endsAt }),
      sendInvites: input.sendInvites,
      scope: input.scope,
    } as never),
  );
}
