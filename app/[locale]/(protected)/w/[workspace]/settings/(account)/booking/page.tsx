import { redirect } from "next/navigation";

import { Resource } from "@/generated/prisma";

import { BookingLinksPageView } from "../components/booking-links-page-view";

import { MessagingUpsellOverlay } from "@/app/components/upsell/messaging-upsell-overlay";
import { PageContainer } from "@/components/shared/page-container";
import {
  getGetBookingLinksInteractor,
  getGetMeetingOptionsInteractor,
  getGetRecordModelInteractor,
  getGetSubscriptionInteractor,
} from "@/core/di";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { bookingSetup } from "@/ee/calendar/booking-setup";
import { effectivePlanId, getEntitlements } from "@/ee/subscription/entitlements";
import { env } from "@/env";
import { appRedirectHref } from "@/features/auth/next/app-redirect";
import { requireAccess } from "@/features/auth/next/require";

export default async function BookingLinksPage() {
  await requireAccess({ resource: Resource.inboxMessages });

  if (env.APP_MODE === "self-hosted") redirect(await appRedirectHref("/dashboard"));
  if (env.APP_MODE === "demo")
    return (
      <PageContainer>
        <BookingLinksPageView demo links={[]} setup={{ calendars: [], lists: [], blockedReason: "noCalendar" }} />
      </PageContainer>
    );

  const subscription = await unwrapPage(getGetSubscriptionInteractor().invoke());
  const locked = !getEntitlements(effectivePlanId(subscription)).messaging;
  if (locked)
    return (
      <PageContainer padded={false}>
        <MessagingUpsellOverlay reason="plan">
          <div className="flex flex-col gap-6 p-4 md:p-6">
            <BookingLinksPageView locked links={[]} setup={{ calendars: [], lists: [], blockedReason: "noCalendar" }} />
          </div>
        </MessagingUpsellOverlay>
      </PageContainer>
    );

  const [links, meeting, model] = await Promise.all([
    unwrapPage(getGetBookingLinksInteractor().invoke()),
    unwrapPage(getGetMeetingOptionsInteractor().invoke({})),
    unwrapPage(getGetRecordModelInteractor().invoke({})),
  ]);

  return (
    <PageContainer>
      <BookingLinksPageView links={links.items} setup={bookingSetup(model, meeting)} />
    </PageContainer>
  );
}
