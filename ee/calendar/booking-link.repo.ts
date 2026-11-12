import type { BookingLinkRow } from "./booking.schema";

export type BookingLinkWrite = {
  calendarId: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  horizonDays: number;
  timeZone: string;
  workingHours: unknown;
  withVideo: boolean;
  personTypeId: string | null;
  recordTypeId: string | null;
  startFieldId: string | null;
  questions: unknown;
  successMessage: string | null;
  enabled: boolean;
};

export type BookingLinkLookup = BookingLinkRow & {
  hostName: string;
  workspaceName: string | null;
  companyDeleting: boolean;
  unipileAccountId: string;
  unipileCalendarId: string;
  connectedAccountId: string;
  provider: string;
  accountUsable: boolean;
};

export abstract class BookingLinkRepo {
  abstract list(): Promise<BookingLinkRow[]>;
  abstract find(id: string): Promise<BookingLinkRow | null>;
  abstract countOwn(): Promise<number>;
  abstract create(token: string, data: BookingLinkWrite): Promise<BookingLinkRow>;
  abstract update(id: string, data: Partial<BookingLinkWrite>): Promise<BookingLinkRow | null>;
  abstract delete(id: string): Promise<boolean>;
  abstract findByTokenUnscoped(token: string): Promise<BookingLinkLookup | null>;
}
