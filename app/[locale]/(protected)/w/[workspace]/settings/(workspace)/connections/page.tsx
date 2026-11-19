import { redirect } from "next/navigation";

import type { ConnectionSection, ConnectionTab } from "@/features/connections/connection-tabs";

import { ChannelsAccountsSection } from "@/components/connections/channels-accounts-section";
import { ChannelsSelfHostedNote } from "@/components/connections/channels-self-hosted-note";
import { ConnectionAgentsTab } from "@/components/connections/connection-agents-tab";
import { ConnectionsPageView } from "@/components/connections/connections-page-view";
import { DevelopersDeliveriesSection } from "@/components/connections/developers-deliveries-section";
import { DevelopersIncomingSection } from "@/components/connections/developers-incoming-section";
import { DevelopersKeysSection } from "@/components/connections/developers-keys-section";
import { DevelopersWebhooksSection } from "@/components/connections/developers-webhooks-section";
import { PageContainer } from "@/components/shared/page-container";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { accessRedirectForAccountState } from "@/features/auth/route-guard.service";
import { appRedirectHref } from "@/features/auth/next/app-redirect";
import { requireAccess } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import {
  CONNECTION_TAB_RESOURCES,
  CONNECTION_TABS,
  resolveConnectionSection,
  resolveConnectionTab,
} from "@/features/connections/connection-tabs";
import { env } from "@/env";

type SearchParams = Record<string, string | string[] | undefined>;

type Props = { searchParams: Promise<SearchParams> };

const FULL_HEIGHT_SECTIONS: readonly ConnectionSection[] = ["webhooks", "deliveries", "incoming"];

async function content(tab: ConnectionTab, section: ConnectionSection | null, searchParams: Promise<SearchParams>) {
  switch (tab) {
    case "channels":
      if (env.APP_MODE === "self-hosted") return <ChannelsSelfHostedNote />;
      return <ChannelsAccountsSection />;
    case "agents":
      return <ConnectionAgentsTab />;
    case "developers":
      switch (section) {
        case "webhooks":
          return <DevelopersWebhooksSection params={await readSurfaceParams(SURFACE.webhooks, searchParams)} />;
        case "deliveries":
          return (
            <DevelopersDeliveriesSection params={await readSurfaceParams(SURFACE.webhookDeliveries, searchParams)} />
          );
        case "incoming":
          return <DevelopersIncomingSection params={await readSurfaceParams(SURFACE.incomingWebhooks, searchParams)} />;
        default:
          return <DevelopersKeysSection />;
      }
  }
}

export default async function ConnectionsPage({ searchParams }: Props) {
  await requireAccess();

  const account = await resolveRequestAccountState();
  const tabs = CONNECTION_TABS.filter(
    (candidate) => accessRedirectForAccountState(account, { resource: CONNECTION_TAB_RESOURCES[candidate] }) === null,
  );
  const params = await searchParams;
  const tab = resolveConnectionTab(params.tab, tabs);
  if (!tab) redirect(await appRedirectHref("/"));

  const section =
    tab === "channels" && env.APP_MODE === "self-hosted" ? null : resolveConnectionSection(tab, params.section);

  return (
    <PageContainer padded={false}>
      <ConnectionsPageView
        bleed={section !== null && FULL_HEIGHT_SECTIONS.includes(section)}
        section={section}
        tab={tab}
        tabs={tabs}
      >
        {await content(tab, section, searchParams)}
      </ConnectionsPageView>
    </PageContainer>
  );
}
