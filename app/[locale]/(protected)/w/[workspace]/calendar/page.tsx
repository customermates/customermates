import { PageContainer } from "@/components/shared/page-container";
import { getGetPlannerOptionsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { loadBookingPanel } from "./booking-panel-data";
import { BOOKING_PANEL_PARAM, wantsBookingPanel } from "./components/booking/booking-panel-model";
import { PlannerPageView } from "./components/planner-page-view";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CalendarPage({ searchParams }: Props) {
  await requireAccess();
  const [options, params] = await Promise.all([unwrapPage(getGetPlannerOptionsInteractor().invoke()), searchParams]);
  const booking = await loadBookingPanel(options);
  return (
    <PageContainer padded={false}>
      <PlannerPageView
        booking={booking}
        bookingRequested={wantsBookingPanel(params[BOOKING_PANEL_PARAM])}
        options={options}
      />
    </PageContainer>
  );
}
