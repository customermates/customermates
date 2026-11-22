import type { UpcomingBookingDto, WorkspaceBookingLinkDto } from "@/ee/calendar/booking.schema";
import type { BookingSetup } from "@/ee/calendar/booking-setup";

export const BOOKING_PANEL_PARAM = "panel";
export const BOOKING_PANEL_VALUE = "booking";

export type BookingPanelUnavailableReason = "demo" | "selfHosted" | "locked";

export type BookingHostCandidate = { userId: string; name: string };

export type BookingPanelState =
  | {
      status: "ready";
      links: WorkspaceBookingLinkDto[];
      setup: BookingSetup;
      busyTimeIncomplete?: boolean;
      hostCandidates?: BookingHostCandidate[];
      upcoming?: UpcomingBookingDto[];
      readOnly?: boolean;
    }
  | { status: "unavailable"; reason: BookingPanelUnavailableReason };

export type BookingPanelGroups = {
  own: WorkspaceBookingLinkDto[];
  others: Array<{ ownerName: string; links: WorkspaceBookingLinkDto[] }>;
};

export function wantsBookingPanel(value: string | string[] | undefined): boolean {
  return value === BOOKING_PANEL_VALUE;
}

export function bookingPublicPath(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/u, "");
}

export function groupBookingLinks(links: readonly WorkspaceBookingLinkDto[]): BookingPanelGroups {
  const owners = new Map<string, WorkspaceBookingLinkDto[]>();
  for (const link of links) {
    if (link.own) continue;
    owners.set(link.ownerName, [...(owners.get(link.ownerName) ?? []), link]);
  }
  return {
    own: links.filter((link) => link.own),
    others: [...owners.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([ownerName, items]) => ({ ownerName, links: items })),
  };
}

export function canCreateBookingPage(state: BookingPanelState): boolean {
  return state.status === "ready" && !state.readOnly && state.setup.blockedReason === null;
}

export type UpcomingBookingDay = {
  key: string;
  day: Date;
  relative: "today" | "tomorrow" | null;
  bookings: UpcomingBookingDto[];
};

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function groupUpcomingByDay(bookings: readonly UpcomingBookingDto[], now: Date): UpcomingBookingDay[] {
  const today = localDayKey(now);
  const tomorrow = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const days = new Map<string, UpcomingBookingDay>();
  const sorted = [...bookings].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  for (const booking of sorted) {
    const day = new Date(booking.startsAt);
    const key = localDayKey(day);
    const entry: UpcomingBookingDay = days.get(key) ?? {
      key,
      day,
      relative: key === today ? "today" : key === tomorrow ? "tomorrow" : null,
      bookings: [],
    };
    entry.bookings.push(booking);
    days.set(key, entry);
  }
  return [...days.values()];
}

export function bookingHostNames(link: Pick<WorkspaceBookingLinkDto, "ownerName" | "hosts">): string[] {
  return [...new Set([link.ownerName, ...link.hosts.map((host) => host.name)].filter(Boolean))];
}
