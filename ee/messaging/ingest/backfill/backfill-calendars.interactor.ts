import type { MessagingService } from "../../messaging.service";
import type { ConnectedAccount } from "@/generated/prisma";
import type { CalendarWriteRepo } from "@/ee/calendar/calendar-write.repo";
import type { BackfillConnectedAccountRepo } from "./backfill.repo";

import { z } from "zod";

import * as Sentry from "@sentry/node";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { buildCalendarEvent, collectAttendeeEmails } from "@/ee/calendar/calendar-normalize";
import { UnipileCalendarEventSchema, UnipileCalendarSchema } from "@/ee/messaging/unipile.schema";

import { backfillSince, paginateStep, UNIPILE_MAX_LIMIT } from "./paginate";
import { isUnipileRateLimit, isUnipileTimeout } from "../../messaging.service";

type CalendarContext = { unipileCalendarId: string; calendarId: string };

const Schema = z.object({ connectedAccountId: z.uuid() });
type BackfillCalendarsPayload = z.infer<typeof Schema>;

@SystemInteractor
export class BackfillCalendarsInteractor {
  constructor(
    private repo: BackfillConnectedAccountRepo,
    private messagingService: MessagingService,
    private calendarRepo: CalendarWriteRepo,
  ) {}

  @Enforce(Schema)
  async invoke({ connectedAccountId }: BackfillCalendarsPayload): Promise<void> {
    const account = await this.repo.findAccountByIdUnscoped(connectedAccountId);
    if (!account || account.status === ConnectedAccountStatus.deleted) return;

    const start = backfillSince().toISOString();

    try {
      await this.listAndIngestCalendars(account, start);
    } catch (err) {
      if (isUnipileRateLimit(err) || isUnipileTimeout(err)) throw err;

      Sentry.captureException(err, {
        tags: {
          unipileAccountId: account.unipileAccountId,
          companyId: account.companyId,
          connectedAccountId: account.id,
          step: "calendar",
        },
      });
    }
  }

  private async listAndIngestCalendars(account: ConnectedAccount, start: string): Promise<void> {
    let sawCalendar = false;

    await paginateStep({
      startCursor: null,
      limit: UNIPILE_MAX_LIMIT,
      fetchPage: (query) =>
        this.messagingService.listCalendars({
          accountId: account.unipileAccountId,
          cursor: query.cursor,
          offset: query.offset,
          limit: UNIPILE_MAX_LIMIT,
        }),
      handleItem: async (rawCalendar) => {
        const calendar = await this.upsertCalendar(account, rawCalendar);
        if (!calendar) return;

        sawCalendar = true;
        await this.backfillCalendarEvents(account, calendar, start);
      },
    });

    if (sawCalendar) await this.repo.markAccountHasCalendarUnscoped(account.unipileAccountId);
  }

  private async backfillCalendarEvents(
    account: ConnectedAccount,
    calendar: CalendarContext,
    start: string,
  ): Promise<void> {
    try {
      await this.listAndIngestEvents(account, calendar, start, true);
    } catch (err) {
      if (isUnipileRateLimit(err) || isUnipileTimeout(err)) throw err;

      try {
        await this.listAndIngestEvents(account, calendar, start, false);
      } catch (fallbackErr) {
        if (isUnipileRateLimit(fallbackErr) || isUnipileTimeout(fallbackErr)) throw fallbackErr;

        Sentry.captureException(fallbackErr, {
          tags: {
            unipileAccountId: account.unipileAccountId,
            companyId: account.companyId,
            connectedAccountId: account.id,
            step: "calendar-events",
          },
        });
      }
    }
  }

  private async listAndIngestEvents(
    account: ConnectedAccount,
    calendar: CalendarContext,
    start: string,
    expandRecurring: boolean,
  ): Promise<void> {
    await paginateStep({
      startCursor: null,
      limit: UNIPILE_MAX_LIMIT,
      fetchPage: (query) =>
        this.messagingService.listCalendarEvents({
          accountId: account.unipileAccountId,
          calendarId: calendar.unipileCalendarId,
          cursor: query.cursor,
          offset: query.offset,
          limit: UNIPILE_MAX_LIMIT,
          start,
          expandRecurring,
        }),
      handleItem: (rawEvent) => this.processCalendarEvent(account, calendar.calendarId, rawEvent),
    });
  }

  private async upsertCalendar(account: ConnectedAccount, rawCalendar: unknown): Promise<CalendarContext | null> {
    const parsed = UnipileCalendarSchema.safeParse(rawCalendar);

    if (!parsed.success) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: rawCalendar,
      });

      return null;
    }

    const stored = await this.calendarRepo.upsertCalendarUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      unipileCalendarId: parsed.data.id,
      name: parsed.data.name ?? "(Unnamed calendar)",
      description: parsed.data.description ?? null,
      color: parsed.data.background_color ?? null,
      timezone: parsed.data.timezone ?? null,
    });

    return { unipileCalendarId: parsed.data.id, calendarId: stored.id };
  }

  private async processCalendarEvent(account: ConnectedAccount, calendarId: string, rawEvent: unknown): Promise<void> {
    const parsed = UnipileCalendarEventSchema.safeParse(rawEvent);

    if (!parsed.success) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: rawEvent,
      });

      return;
    }

    const normalized = buildCalendarEvent(parsed.data);

    if (!normalized) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: parsed.data,
        unipileMessageId: parsed.data.id ?? null,
      });

      return;
    }

    try {
      await this.calendarRepo.upsertCalendarEventUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        calendarId,
        event: normalized,
        attendeeEmails: collectAttendeeEmails(normalized),
      });
    } catch (err) {
      Sentry.captureException(err, {
        tags: {
          unipileAccountId: account.unipileAccountId,
          companyId: account.companyId,
          connectedAccountId: account.id,
          step: "calendar",
        },
      });
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: normalized,
        unipileMessageId: parsed.data.id ?? null,
      });
    }
  }
}
