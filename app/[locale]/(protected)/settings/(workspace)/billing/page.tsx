import { Resource } from "@/generated/prisma";

import { SubscriptionView } from "../components/subscription/subscription-view";

import { getGetSubscriptionInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { PageContainer } from "@/components/shared/page-container";
import { env } from "@/env";
import { buildLocalePath } from "@/i18n/locale-registry";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function CompanySubscriptionPage() {
  await requireAccess({ resource: Resource.company });

  if (env.APP_MODE === "self-hosted") redirect(buildLocalePath(await getLocale(), "/dashboard"));

  const subscription = await unwrapPage(getGetSubscriptionInteractor().invoke());

  return (
    <PageContainer>
      <SubscriptionView initialSubscription={subscription} />
    </PageContainer>
  );
}
