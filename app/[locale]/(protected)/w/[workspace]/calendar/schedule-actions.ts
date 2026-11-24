"use server";

import type {
  FreeSlotsQuery,
  MeetingOptionsQuery,
  ScheduleMeetingInput,
  UpdateMeetingInput,
} from "@/ee/calendar/meeting.schema";

import {
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

export async function moveMeetingAction(input: Pick<UpdateMeetingInput, "id" | "startsAt" | "endsAt">) {
  return serializeResult(
    getUpdateMeetingInteractor().invoke({ id: input.id, startsAt: input.startsAt, endsAt: input.endsAt } as never),
  );
}
