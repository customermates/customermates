import { ConnectedAccountsPageView } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/components/connected-accounts-page-view";
import { ConnectedAccountsStatusToast } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/components/connected-accounts-status-toast";
import { OnboardingChannelsHint } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/components/onboarding-channels-hint";
import { MessagingUpsellOverlay } from "@/app/components/upsell/messaging-upsell-overlay";
import { ConnectionScopeLine } from "@/components/connections/connection-scope-line";
import { getGetMyConnectedAccountsInteractor, getGetSubscriptionInteractor } from "@/core/di";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { effectivePlanId, getEntitlements } from "@/ee/subscription/entitlements";

export async function ChannelsAccountsSection() {
  const subscription = await unwrapPage(getGetSubscriptionInteractor().invoke());
  const locked = !getEntitlements(effectivePlanId(subscription)).messaging;

  if (locked) {
    return (
      <MessagingUpsellOverlay reason="plan">
        <div className="flex flex-col gap-6 p-4 md:p-6">
          <ConnectedAccountsPageView locked accounts={[]} />
        </div>
      </MessagingUpsellOverlay>
    );
  }

  const accounts = await unwrapPage(getGetMyConnectedAccountsInteractor().invoke());

  return (
    <div className="flex flex-col gap-4">
      <ConnectionScopeLine owner="user" scope="accounts" />

      <ConnectedAccountsStatusToast />

      <OnboardingChannelsHint />

      <ConnectedAccountsPageView accounts={accounts} />
    </div>
  );
}
