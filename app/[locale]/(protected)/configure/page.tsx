import type { ConfigureGraphAccounts } from "./components/configure-graph";

import { Action, Resource } from "@/generated/prisma";

import {
  getGetRecordModelInteractor,
  getDiscoverRecordTypesInteractor,
  getGetMyConnectedAccountsInteractor,
  getGetSubscriptionInteractor,
  getUserService,
} from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { PageContainer } from "@/components/shared/page-container";
import { getEntitlements, isSubscriptionUsable } from "@/ee/subscription/entitlements";
import { env } from "@/env";
import { ConfigurePageView } from "./components/configure-page-view";

async function loadAccounts(): Promise<ConfigureGraphAccounts> {
  if (env.APP_MODE === "self-hosted") return { state: "unavailable" };
  const users = getUserService();
  const permitted = await Promise.all(
    [Action.readOwn, Action.readAll].map((action) => users.hasPermission(Resource.inboxMessages, action)),
  );
  if (!permitted.includes(true)) return { state: "unavailable" };
  const subscription = await getGetSubscriptionInteractor().invoke();
  if (!getEntitlements(subscription.data.plan).messaging || !isSubscriptionUsable(subscription.data))
    return { state: "locked" };
  const accounts = await unwrapValidated(getGetMyConnectedAccountsInteractor().invoke());
  return {
    state: "available",
    accounts: accounts
      .filter((account) => account.status !== "deleted")
      .map((account) => ({
        id: account.id,
        provider: account.provider,
        status: account.status,
        address: account.emailAddress ?? account.displayName,
        hasMessaging: account.hasMessaging,
        hasCalendar: account.hasCalendar,
        linkedinProducts: account.linkedinProducts,
      })),
  };
}

export default async function ConfigurePage() {
  await requireAccess();
  const [model, catalog, accounts] = await Promise.all([
    unwrapValidated(getGetRecordModelInteractor().invoke({})),
    unwrapValidated(
      getDiscoverRecordTypesInteractor().invoke({
        page: 1,
        pageSize: 100,
        includeEmbedded: true,
      }),
    ),
    loadAccounts(),
  ]);
  return (
    <PageContainer padded={false}>
      <ConfigurePageView
        accounts={accounts}
        canManage={catalog.canManageSchema}
        canPublishSummary={catalog.canPublishSummary ?? false}
        catalog={catalog.types}
        initialModel={model}
      />
    </PageContainer>
  );
}
