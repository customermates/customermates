import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { randomBytes } from "node:crypto";

import { ConnectedAccountStatus, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { BookingLinkRepo, BookingLinkWrite } from "./booking-link.repo";
import type { CalendarWriteAccessRepo } from "./calendar-write-access.repo";
import type { MeetingRecordService } from "./meeting-record.service";

import {
  type BookingLinkDto,
  type SaveBookingLinkData,
  BOOKING_LINK_LIMIT_PER_USER,
  BookingLinkSchema,
  SaveBookingLinkSchema,
} from "./booking.schema";
import { storedQuestions, toBookingLinkDto } from "./booking-link-dto";
import { invalidBookingList } from "./booking-link-validation";
import { DEFAULT_WORKING_HOURS } from "./working-hours";

const TOKEN_BYTES = 18;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "upsert" })
export class SaveBookingLinkInteractor extends AuthenticatedInteractor<SaveBookingLinkData, BookingLinkDto> {
  constructor(
    private repo: BookingLinkRepo,
    private access: CalendarWriteAccessRepo,
    private records: MeetingRecordService,
    private entitlements: EntitlementService,
    private baseUrl: string,
  ) {
    super();
  }

  @Write({ input: SaveBookingLinkSchema, output: BookingLinkSchema })
  async invoke(data: SaveBookingLinkData): Validated<BookingLinkDto> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const { id, ...changes } = data;
    const current = id ? await this.repo.find(id) : null;
    if (id && !current) return failNotFound(CustomErrorCode.bookingLinkNotFound, ["id"]);
    if (!current && (await this.repo.countOwn()) >= BOOKING_LINK_LIMIT_PER_USER)
      return fail(CustomErrorCode.bookingLinkLimitReached, [], { limit: BOOKING_LINK_LIMIT_PER_USER });

    const merged = {
      calendarId: changes.calendarId ?? current?.calendarId ?? "",
      title: changes.title ?? current?.title ?? "",
      description: changes.description !== undefined ? changes.description : (current?.description ?? null),
      durationMinutes: changes.durationMinutes ?? current?.durationMinutes ?? 30,
      bufferMinutes: changes.bufferMinutes ?? current?.bufferMinutes ?? 0,
      minNoticeMinutes: changes.minNoticeMinutes ?? current?.minNoticeMinutes ?? 240,
      horizonDays: changes.horizonDays ?? current?.horizonDays ?? 30,
      timeZone: changes.timeZone ?? current?.timeZone ?? "UTC",
      workingHours: changes.workingHours ?? current?.workingHours ?? DEFAULT_WORKING_HOURS,
      withVideo: changes.withVideo ?? current?.withVideo ?? false,
      personTypeId: changes.personTypeId !== undefined ? changes.personTypeId : (current?.personTypeId ?? null),
      recordTypeId: changes.recordTypeId !== undefined ? changes.recordTypeId : (current?.recordTypeId ?? null),
      startFieldId: changes.startFieldId !== undefined ? changes.startFieldId : (current?.startFieldId ?? null),
      questions: changes.questions ?? (current ? storedQuestions(current.questions) : []),
      successMessage: changes.successMessage !== undefined ? changes.successMessage : (current?.successMessage ?? null),
      enabled: changes.enabled ?? current?.enabled ?? true,
    } satisfies BookingLinkWrite;

    if (!current || changes.calendarId) {
      const calendar = await this.access.findOwnCalendar(merged.calendarId);
      if (!calendar) return failNotFound(CustomErrorCode.calendarNotFound, ["calendarId"]);
      if (calendar.accountStatus !== ConnectedAccountStatus.ok)
        return fail(CustomErrorCode.calendarNeedsReconnect, ["calendarId"]);
    }

    const listsChanged =
      !current || ["personTypeId", "recordTypeId", "startFieldId", "questions"].some((key) => key in changes);
    if (listsChanged && (merged.personTypeId || merged.recordTypeId || merged.questions.length)) {
      const model = await this.records.loadModel();
      const invalid = model ? invalidBookingList(model, merged) : ["recordTypeId"];
      if (invalid) return fail(CustomErrorCode.bookingListInvalid, invalid);
    }

    const row = current
      ? await this.repo.update(current.id, merged)
      : await this.repo.create(randomBytes(TOKEN_BYTES).toString("base64url"), merged);
    if (!row) return failNotFound(CustomErrorCode.bookingLinkNotFound, ["id"]);

    return { ok: true as const, data: toBookingLinkDto(row, this.baseUrl) };
  }
}
