"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";
import { CopyableCode } from "@/components/shared/copyable-code";

type Props = {
  mcpUrl: string;
  provider: "claude" | "chatgpt";
};

export function AiConnectionConnectorSetup({ mcpUrl, provider }: Props) {
  const t = useTranslations();
  const isClaude = provider === "claude";

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">
          {isClaude ? t("OnboardingWizard.ai.connector.claudeTitle") : t("OnboardingWizard.ai.connector.chatgptTitle")}
        </h3>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {isClaude
            ? t("OnboardingWizard.ai.connector.claudeDescription")
            : t("OnboardingWizard.ai.connector.chatgptDescription")}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-xs font-medium">{t("OnboardingWizard.ai.connector.urlLabel")}</p>

        <CopyableCode value={mcpUrl} />
      </div>

      {isClaude ? (
        <Button asChild className="self-start" variant="secondary">
          <a
            href={`https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Customermates&connectorUrl=${encodeURIComponent(mcpUrl)}`}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t("OnboardingWizard.ai.connector.claudeButton")}

            <ExternalLink aria-hidden />
          </a>
        </Button>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("OnboardingWizard.ai.connector.chatgptSteps")}
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t.rich("OnboardingWizard.ai.connector.externalNote", {
          guide: (chunks) => (
            <AppLink
              inheritSize
              appearance="inline"
              href={isClaude ? "/docs/connect-custom-connector" : "https://learn.chatgpt.com/docs/extend/mcp"}
              rel="noreferrer noopener"
              target="_blank"
            >
              {chunks}
            </AppLink>
          ),
        })}
      </p>
    </div>
  );
}
