import { getTranslations } from "next-intl/server";

import { MarketingContainer } from "@/components/marketing/marketing-container";
import {
  NativeAgentProviderIdentity,
  NativeAutomationProviderIdentity,
} from "@/components/marketing/visuals/native-visual-primitives";
import type { VisualAgentProviderFixtureId } from "@/components/marketing/visuals/native-fixtures";

const AGENTS: VisualAgentProviderFixtureId[] = ["chatgpt", "claude", "cursor", "gemini"];

export async function HomepageStatsRow() {
  const t = await getTranslations();

  return (
    <section className="w-full border-y border-border" data-homepage-section="agent-strip">
      <MarketingContainer>
        <div className="grid grid-cols-2 lg:grid-cols-[1.55fr_repeat(5,minmax(0,1fr))]">
          <div className="col-span-2 flex min-h-24 items-center border-b border-border px-5 lg:col-span-1 lg:border-r lg:border-b-0 lg:px-7">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {/* eslint-disable react/jsx-newline */}
              {t("HomepageStatsRow.taglinePre")}{" "}
              <span className="font-medium text-foreground">{t("HomepageStatsRow.taglineMcp")}</span>
              {t("HomepageStatsRow.taglinePost")}
              {/* eslint-enable react/jsx-newline */}
            </p>
          </div>

          {AGENTS.map((provider, index) => (
            <div
              key={provider}
              className={`flex min-h-20 items-center justify-center px-3 lg:min-h-24 ${
                index % 2 === 0 ? "border-r border-border" : ""
              } ${index < 2 ? "border-b border-border lg:border-b-0" : ""} lg:border-r lg:last:border-r-0`}
            >
              <NativeAgentProviderIdentity className="text-sm" iconSize={22} provider={provider} />
            </div>
          ))}

          <div className="col-span-2 flex min-h-20 items-center justify-center border-t border-border px-3 lg:col-span-1 lg:min-h-24 lg:border-t-0">
            <NativeAutomationProviderIdentity
              className="text-sm"
              descriptor={t("HomepageStatsRow.automationLabel")}
              provider="n8n"
            />
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
