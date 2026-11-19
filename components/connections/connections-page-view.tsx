"use client";

import type { ReactNode } from "react";
import type { ConnectionSection, ConnectionTab } from "@/features/connections/connection-tabs";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { OverflowRail } from "@/components/shared/overflow-rail";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { connectionSectionsOf, connectionsHref } from "@/features/connections/connection-tabs";
import { useRouter } from "@/i18n/navigation";

type Translate = ReturnType<typeof useTranslations>;

function tabLabel(t: Translate, tab: ConnectionTab): string {
  switch (tab) {
    case "channels":
      return t("Connections.tabs.channels");
    case "agents":
      return t("Connections.tabs.agents");
    case "developers":
      return t("Connections.tabs.developers");
  }
}

function sectionLabel(t: Translate, section: ConnectionSection): string {
  switch (section) {
    case "accounts":
      return t("SettingsNav.channels");
    case "keys":
      return t("SettingsNav.apiKeys");
    case "webhooks":
      return t("SettingsNav.webhooks");
    case "deliveries":
      return t("SettingsNav.deliveries");
    case "incoming":
      return t("SettingsNav.incomingWebhooks");
  }
}

function sectionsLabel(t: Translate, tab: ConnectionTab): string {
  return tab === "developers" ? t("Connections.developers.sectionsLabel") : t("Connections.channels.sectionsLabel");
}

type Props = {
  tabs: readonly ConnectionTab[];
  tab: ConnectionTab;
  section: ConnectionSection | null;
  bleed: boolean;
  children: ReactNode;
};

export function ConnectionsPageView({ tabs, tab, section, bleed, children }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const sections = connectionSectionsOf(tab);

  useEffect(() => {
    for (const id of [`connections-tab-${tab}`, section ? `connections-section-tab-${section}` : null]) {
      const active = id ? document.getElementById(id) : null;
      if (typeof active?.scrollIntoView === "function") active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [tab, section]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" data-connections-page="">
      <div className="flex flex-col gap-4 px-4 pt-4 md:px-6 md:pt-6">
        <h1 className="sr-only">{t("Connections.title")}</h1>

        <p className="text-sm text-muted-foreground">{t("Connections.description")}</p>

        <OverflowRail ariaLabel={t("Connections.tabsLabel")} bleed={false} observedKey={tabs.length}>
          <SegmentedControl
            className="flex-1"
            idPrefix="connections"
            items={tabs.map((value) => ({ value, label: tabLabel(t, value), controls: "connections-panel" }))}
            label={t("Connections.tabsLabel")}
            value={tab}
            onValueChange={(next) => router.push(connectionsHref(next))}
          />
        </OverflowRail>

        {sections.length > 1 && section ? (
          <OverflowRail ariaLabel={sectionsLabel(t, tab)} bleed={false} observedKey={tab}>
            <SegmentedControl
              className="flex-1"
              idPrefix="connections-section"
              items={sections.map((value) => ({
                value,
                label: sectionLabel(t, value),
                controls: "connections-section-panel",
              }))}
              label={sectionsLabel(t, tab)}
              value={section}
              onValueChange={(next) => router.push(connectionsHref(tab, next))}
            />
          </OverflowRail>
        ) : null}
      </div>

      <div
        aria-labelledby={`connections-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
        id="connections-panel"
        role="tabpanel"
      >
        <div
          aria-labelledby={section ? `connections-section-tab-${section}` : undefined}
          className={bleed ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1 flex-col px-4 pb-4 md:px-6 md:pb-6"}
          id="connections-section-panel"
          role={section ? "tabpanel" : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
