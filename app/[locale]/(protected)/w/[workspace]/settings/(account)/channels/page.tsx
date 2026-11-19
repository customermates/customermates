import { Resource } from "@/generated/prisma";

import { ConnectedAccountsPageView } from "../components/connected-accounts-page-view";
import { ConnectedAccountsStatusToast } from "../components/connected-accounts-status-toast";
import { OnboardingChannelsHint } from "../components/onboarding-channels-hint";

import { redirect } from "next/navigation";
import { appRedirectHref } from "@/features/auth/next/app-redirect";

import { getGetMyConnectedAccountsInteractor, getGetSubscriptionInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { MessagingUpsellOverlay } from "@/app/components/upsell/messaging-upsell-overlay";
import { effectivePlanId, getEntitlements } from "@/ee/subscription/entitlements";
import { env } from "@/env";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function ConnectedAccountsPage() {
  await requireAccess({ resource: Resource.inboxMessages });

  if (env.APP_MODE === "self-hosted") redirect(await appRedirectHref("/dashboard"));

  const subscription = await unwrapPage(getGetSubscriptionInteractor().invoke());
  const locked = !getEntitlements(effectivePlanId(subscription)).messaging;

  const accounts = locked ? [] : await unwrapPage(getGetMyConnectedAccountsInteractor().invoke());

  if (!locked) {
    return (
      <PageContainer>
        <ConnectedAccountsStatusToast />

        <OnboardingChannelsHint />

        <ConnectedAccountsPageView accounts={accounts} />
      </PageContainer>
    );
  }

  return (
    <PageContainer padded={false}>
      <MessagingUpsellOverlay reason="plan">
        <div className="flex flex-col gap-6 p-4 md:p-6">
          <ConnectedAccountsPageView locked accounts={[]} />
        </div>
      </MessagingUpsellOverlay>
    </PageContainer>
  );
}
