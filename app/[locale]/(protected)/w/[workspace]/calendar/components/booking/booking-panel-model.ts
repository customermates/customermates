import type { WorkspaceBookingLinkDto } from "@/ee/calendar/booking.schema";
import type { BookingSetup } from "@/ee/calendar/booking-setup";

export const BOOKING_PANEL_PARAM = "panel";
export const BOOKING_PANEL_VALUE = "booking";

export type BookingPanelUnavailableReason = "demo" | "selfHosted" | "locked";

export type BookingPanelState =
  | { status: "ready"; links: WorkspaceBookingLinkDto[]; setup: BookingSetup; busyTimeIncomplete?: boolean }
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
  return state.status === "ready" && state.setup.blockedReason === null;
}
