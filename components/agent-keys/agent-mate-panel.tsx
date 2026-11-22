"use client";

import type { AgentRuntimeOption } from "@/features/automation-rules/agent-runtime-availability";

import { useTranslations } from "next-intl";

import { billingHref } from "@/app/components/navigation/settings-routes";
import { MateOrb } from "@/components/mate/mate-orb";
import { SettingsPanel, SettingsPanelMessage } from "@/components/shared/settings-panel";
import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";

type Props = { option: AgentRuntimeOption };

export function AgentMatePanel({ option }: Props) {
  const t = useTranslations();
  const selfHosted = option.reason === "selfHosted";
  const message = option.available
    ? t("AgentsPage.mate.ready")
    : selfHosted
      ? t("AgentsPage.mate.selfHosted")
      : t("AgentsPage.mate.notInPlan");

  return (
    <SettingsPanel description={t("AgentsPage.mate.description")} id="agent-mate" title={t("AgentRuntime.names.mate")}>
      <SettingsPanelMessage>
        <span
          className="flex min-w-0 items-center gap-3 text-foreground"
          data-agent-mate-state={option.reason ?? "ready"}
        >
          <MateOrb className="size-6" />

          {message}
        </span>

        {selfHosted ? null : (
          <Button asChild size="sm" variant={option.available ? "secondary" : "default"}>
            <IntlLink href={billingHref()}>
              {option.available ? t("AgentsPage.mate.usage") : t("AgentsPage.mate.seePlans")}
            </IntlLink>
          </Button>
        )}
      </SettingsPanelMessage>
    </SettingsPanel>
  );
}
