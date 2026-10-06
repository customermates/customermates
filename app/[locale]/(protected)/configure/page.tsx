import type { ConfigureGraphAccounts } from "./components/configure-graph";

import { Action, Resource } from "@/generated/prisma";

import {
  getGetRecordModelInteractor,
  getDiscoverRecordTypesInteractor,
  getGetMyConnectedAccountsInteractor,
  getGetRecordModelOverviewInteractor,
  getGetSubscriptionInteractor,
} from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { PageContainer } from "@/components/shared/page-container";
import { getEntitlements } from "@/ee/subscription/entitlements";
import { env } from "@/env";
import { ConfigurePageView } from "./components/configure-page-view";

async function loadAccounts(): Promise<ConfigureGraphAccounts> {
  if (env.APP_MODE === "self-hosted") return { state: "unavailable" };
  const { user } = await resolveRequestAccountState();
  const permitted =
    user?.role?.isSystemRole ||
    user?.role?.permissions.some(
      (permission) =>
        permission.resource === Resource.inboxMessages &&
        (permission.action === Action.readOwn || permission.action === Action.readAll),
    );
  if (!permitted) return { state: "unavailable" };
  const subscription = await getGetSubscriptionInteractor().invoke();
  if (!getEntitlements(subscription.data.plan).messaging) return { state: "locked" };
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
  const [model, catalog, overview, accounts] = await Promise.all([
    unwrapValidated(getGetRecordModelInteractor().invoke({})),
    unwrapValidated(
      getDiscoverRecordTypesInteractor().invoke({
        page: 1,
        pageSize: 1,
        includeEmbedded: false,
      }),
    ),
    unwrapValidated(getGetRecordModelOverviewInteractor().invoke()),
    loadAccounts(),
  ]);
  return (
    <PageContainer padded={false}>
      <ConfigurePageView
        accounts={accounts}
        canManage={catalog.canManageSchema}
        canPublishSummary={catalog.canPublishSummary ?? false}
        initialModel={model}
        overview={overview}
      />
    </PageContainer>
  );
}
