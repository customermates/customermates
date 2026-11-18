import type { StoredBrand } from "@/features/workspace-brand/workspace-brand.repo";
import type { BookingAssignmentKind, BookingLinkRow, WorkspaceBookingLinkRow } from "./booking.schema";

export type BookingHostWrite = { userId: string; calendarId: string };

export type BookingLinkWrite = {
  calendarId: string | null;
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
  personRelationshipId: string | null;
  recordTypeId: string | null;
  startFieldId: string | null;
  questions: unknown;
  successMessage: string | null;
  enabled: boolean;
  assignment: BookingAssignmentKind;
  inviteeChanges: boolean;
};

export type BookingHostCandidate = { userId: string; name: string; calendarId: string };

export type BookingLinkLookup = BookingLinkRow & {
  hostName: string;
  workspaceName: string | null;
  brand: StoredBrand | null;
  companyDeleting: boolean;
  hostCandidates: BookingHostCandidate[];
};

export abstract class BookingLinkRepo {
  abstract list(): Promise<BookingLinkRow[]>;
  abstract listWorkspace(): Promise<WorkspaceBookingLinkRow[]>;
  abstract find(id: string): Promise<BookingLinkRow | null>;
  abstract countOwn(): Promise<number>;
  abstract create(token: string, data: BookingLinkWrite, hosts: BookingHostWrite[]): Promise<BookingLinkRow>;
  abstract update(
    id: string,
    data: Partial<BookingLinkWrite>,
    hosts?: BookingHostWrite[],
  ): Promise<BookingLinkRow | null>;
  abstract delete(id: string): Promise<boolean>;
  abstract findByTokenUnscoped(token: string): Promise<BookingLinkLookup | null>;
}
