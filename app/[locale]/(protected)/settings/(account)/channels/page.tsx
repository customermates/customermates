import { Resource } from "@/generated/prisma";

import { ConnectedAccountsPageView } from "../components/connected-accounts-page-view";
import { ConnectedAccountsStatusToast } from "../components/connected-accounts-status-toast";

import { redirect } from "next/navigation";

import { getGetMyConnectedAccountsInteractor, getGetSubscriptionInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { getLocale, getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/shared/page-container";
import { LockedFeatureOverlay } from "@/components/shared/locked-feature-overlay";
import { getEntitlements } from "@/ee/subscription/entitlements";
import { env } from "@/env";
import { buildLocalePath } from "@/i18n/locale-registry";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { settingsHref } from "@/app/components/navigation/settings-routes";

export default async function ConnectedAccountsPage() {
  await requireAccess({ resource: Resource.inboxMessages });

  if (env.APP_MODE === "self-hosted") redirect(buildLocalePath(await getLocale(), "/dashboard"));

  const subscription = await unwrapPage(getGetSubscriptionInteractor().invoke());
  const locked = !getEntitlements(subscription.plan).messaging;

  const accounts = locked ? [] : await unwrapPage(getGetMyConnectedAccountsInteractor().invoke());

  if (!locked) {
    return (
      <PageContainer>
        <ConnectedAccountsStatusToast />

        <ConnectedAccountsPageView accounts={accounts} />
      </PageContainer>
    );
  }

  const t = await getTranslations();

  return (
    <PageContainer padded={false}>
      <LockedFeatureOverlay
        ctaHref={settingsHref("billing")}
        ctaLabel={t("MessagingUpsell.cta")}
        description={t("MessagingUpsell.description")}
        title={t("MessagingUpsell.title")}
      >
        <div className="flex flex-col gap-6 p-4 md:p-6">
          <ConnectedAccountsPageView locked accounts={[]} />
        </div>
      </LockedFeatureOverlay>
    </PageContainer>
  );
}
