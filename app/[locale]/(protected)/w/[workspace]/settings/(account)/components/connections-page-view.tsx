"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ApiKey } from "@/features/api-key/get-api-keys.interactor";
import type { ConnectedApp } from "@/features/connected-apps/connected-app.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useLayoutEffect, useState } from "react";

import { Action, Resource } from "@/generated/prisma";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { CONNECT_INTENT_AI_CLIENTS, CONNECT_INTENT_CHANNELS } from "@/components/keyboard/connect-intent";
import { useConnectIntent } from "@/components/keyboard/use-connect-intent";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

import { AiAppsSection } from "./ai-apps-section";
import { ApiKeysSection } from "./api-keys-section";
import { ConnectedAccountsSection } from "./connected-accounts-section";
import { CONNECTIONS_SECTION_PARAM, type ConnectionsSection, connectionsSectionOf } from "./connections-section";

type Props = {
  inbox: { accounts: ConnectedAccountDto[]; locked: boolean } | null;
  api: { apiKeys: ApiKey[]; connectedApps: ConnectedApp[] } | null;
};

const ConnectionsPageViewContent = observer(({ inbox, api }: Props) => {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const { apiKeyModalStore, apiKeysStore, connectedAccountsStore, connectedAppsStore, userStore } = useRootStore();
  const [requested, setSection] = useState<ConnectionsSection>(() =>
    connectionsSectionOf(searchParams.get(CONNECTIONS_SECTION_PARAM)),
  );
  const canConnectChannel = Boolean(inbox && !inbox.locked) && userStore.can(Resource.inboxMessages, Action.create);

  useLayoutEffect(() => {
    if (inbox && !inbox.locked) connectedAccountsStore.setItems({ items: inbox.accounts });
  }, [inbox, connectedAccountsStore]);
  useLayoutEffect(() => {
    if (!api) return;
    apiKeysStore.setItems({ items: api.apiKeys });
    connectedAppsStore.setItems({ items: api.connectedApps });
  }, [api, apiKeysStore, connectedAppsStore]);
  useConnectIntent(CONNECT_INTENT_CHANNELS, canConnectChannel, (channel) =>
    runUserAction(() => connectedAccountsStore.connectAccount(channel)),
  );
  useConnectIntent(CONNECT_INTENT_AI_CLIENTS, Boolean(api) && apiKeysStore.canManage, (provider) => {
    apiKeyModalStore.add();
    apiKeyModalStore.aiConnectionStore.selectProvider(provider);
  });

  const available: Record<ConnectionsSection, boolean> = {
    all: true,
    inbox: inbox !== null,
    apps: api !== null,
    keys: api !== null,
  };
  const section = available[requested] ? requested : "all";
  const show = (id: Exclude<ConnectionsSection, "all">) => available[id] && (section === "all" || section === id);
  const counts = {
    inbox: inbox?.locked ? 0 : connectedAccountsStore.items.length,
    apps: connectedAppsStore.items.length,
    keys: apiKeysStore.items.length,
  };
  const counted = (label: string, count: number) => (
    <>
      {label}

      <span className="max-sm:hidden" data-connections-filter-count="">{` · ${count}`}</span>
    </>
  );
  const items = [
    { value: "all" as const, label: t("Connections.filters.all") },
    ...(available.inbox
      ? [{ value: "inbox" as const, label: counted(t("Connections.filters.inbox"), counts.inbox) }]
      : []),
    ...(available.apps ? [{ value: "apps" as const, label: counted(t("Connections.filters.apps"), counts.apps) }] : []),
    ...(available.keys ? [{ value: "keys" as const, label: counted(t("Connections.filters.keys"), counts.keys) }] : []),
  ];

  return (
    <div
      className="animate-page-result-in flex w-full max-w-3xl flex-col gap-8 motion-reduce:animate-none"
      data-connections-page=""
    >
      {items.length > 2 ? (
        <SegmentedControl
          className="w-full min-w-0 sm:w-fit"
          idPrefix="connections"
          items={items.map((item) => ({ ...item, controls: false as const }))}
          label={t("Connections.filterLabel")}
          listClassName="max-sm:flex max-sm:overflow-x-auto max-sm:[scrollbar-width:none] max-sm:[&>*]:flex-[1_0_auto]"
          value={section}
          onValueChange={setSection}
        />
      ) : null}

      {show("inbox") && inbox ? <ConnectedAccountsSection locked={inbox.locked} /> : null}

      {show("apps") ? <AiAppsSection /> : null}

      {show("keys") ? <ApiKeysSection /> : null}
    </div>
  );
});

export const ConnectionsPageView = serverRenderedClient(ConnectionsPageViewContent);
