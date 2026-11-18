import type { PlannerOptions } from "@/features/planner/get-planner-options.interactor";
import type { BookingPanelState } from "./components/booking/booking-panel-model";

import {
  getGetMeetingOptionsInteractor,
  getGetRecordModelInteractor,
  getGetUpcomingBookingsInteractor,
  getGetWorkspaceBookingLinksInteractor,
} from "@/core/di";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { bookingSetup } from "@/ee/calendar/booking-setup";
import { env } from "@/env";

export async function loadBookingPanel(options: Pick<PlannerOptions, "personalAvailable">): Promise<BookingPanelState> {
  if (env.APP_MODE === "demo") return { status: "unavailable", reason: "demo" };
  if (env.APP_MODE !== "cloud") return { status: "unavailable", reason: "selfHosted" };
  if (!options.personalAvailable) return { status: "unavailable", reason: "locked" };

  const [links, meeting, model, upcoming] = await Promise.all([
    unwrapPage(getGetWorkspaceBookingLinksInteractor().invoke()),
    unwrapPage(getGetMeetingOptionsInteractor().invoke({})),
    unwrapPage(getGetRecordModelInteractor().invoke({})),
    unwrapPage(getGetUpcomingBookingsInteractor().invoke()),
  ]);

  return {
    status: "ready",
    links: links.items,
    setup: bookingSetup(model, meeting),
    busyTimeIncomplete: links.busyTimeIncomplete,
    hostCandidates: links.hostCandidates,
    upcoming: upcoming.items,
  };
}
