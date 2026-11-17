"use client";

import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConnectionScopeLine } from "@/components/connections/connection-scope-line";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IntlLink } from "@/i18n/navigation";

export const AGENT_SETTINGS_HREF = "/settings/agents";

export function ConnectionAgentsTab() {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-4" data-connection-tab="agents">
      <ConnectionScopeLine owner="workspace" scope="agents" />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <Bot aria-hidden className="size-4 text-muted-foreground" />

            <h2 className="text-base font-semibold">{t("Connections.agents.title")}</h2>
          </div>

          <p className="text-sm text-muted-foreground">{t("Connections.agents.body")}</p>

          <div>
            <Button asChild size="sm" variant="secondary">
              <IntlLink href={AGENT_SETTINGS_HREF}>{t("Connections.agents.open")}</IntlLink>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
