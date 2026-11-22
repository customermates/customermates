import { Resource } from "@/generated/prisma";

import { ConnectionsPageView } from "../components/connections-page-view";
import { ConnectedAccountsStatusToast } from "../components/connected-accounts-status-toast";
import { OnboardingChannelsHint } from "../components/onboarding-channels-hint";

import { redirect } from "next/navigation";

import {
  getGetApiKeysInteractor,
  getGetConnectedAppsInteractor,
  getGetMyConnectedAccountsInteractor,
  getGetSubscriptionInteractor,
} from "@/core/di";
import { appRedirectHref } from "@/features/auth/next/app-redirect";
import { requireAccess } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { accessRedirectForAccountState } from "@/features/auth/route-guard.service";
import { PageContainer } from "@/components/shared/page-container";
import { effectivePlanId, getEntitlements } from "@/ee/subscription/entitlements";
import { env } from "@/env";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

async function loadInbox() {
  const subscription = await unwrapPage(getGetSubscriptionInteractor().invoke());
  const locked = !getEntitlements(effectivePlanId(subscription)).messaging;
  const accounts = locked ? [] : await unwrapPage(getGetMyConnectedAccountsInteractor().invoke());
  return { accounts, locked };
}

async function loadApi() {
  const [apiKeys, connectedApps] = await Promise.all([
    unwrapPage(getGetApiKeysInteractor().invoke()),
    unwrapPage(getGetConnectedAppsInteractor().invoke()),
  ]);
  return { apiKeys, connectedApps };
}

export default async function ConnectionsPage() {
  await requireAccess();

  const resolution = await resolveRequestAccountState();
  const canRead = (resource: Resource) => accessRedirectForAccountState(resolution, { resource }) === null;
  const inboxAllowed = env.APP_MODE !== "self-hosted" && canRead(Resource.inboxMessages);
  const apiAllowed = canRead(Resource.api);

  if (!inboxAllowed && !apiAllowed) redirect(await appRedirectHref("/"));

  const [inbox, api] = await Promise.all([inboxAllowed ? loadInbox() : null, apiAllowed ? loadApi() : null]);

  return (
    <PageContainer>
      {inbox && !inbox.locked ? (
        <>
          <ConnectedAccountsStatusToast />

          <OnboardingChannelsHint />
        </>
      ) : null}

      <ConnectionsPageView api={api} inbox={inbox} />
    </PageContainer>
  );
}
