"use client";

import type { AiConnectionAppProvider } from "./ai-connection.store";

import { useTranslations } from "next-intl";

import { AppLink } from "@/components/shared/app-link";
import { CopyableCode } from "@/components/shared/copyable-code";

type Props = {
  mcpUrl: string;
  provider: AiConnectionAppProvider;
};

const GUIDE_HREF: Record<AiConnectionAppProvider, string> = {
  grok: "/docs/connect-custom-connector#grok-bot",
  langdock: "/docs/connect-custom-connector#langdock",
};

export function AiConnectionAppSetup({ mcpUrl, provider }: Props) {
  const t = useTranslations();
  const client = t(`OnboardingWizard.ai.choices.${provider}`);

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted p-4" data-ai-app-setup={provider}>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t(`OnboardingWizard.ai.app.${provider}.title`)}</h3>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t(`OnboardingWizard.ai.app.${provider}.description`)}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-xs font-medium">{t("OnboardingWizard.ai.connector.urlLabel")}</p>

        <CopyableCode value={mcpUrl} />

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("OnboardingWizard.ai.connector.workspaceNote", { client })}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t(`OnboardingWizard.ai.app.${provider}.steps`)}</p>

      {provider === "grok" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{t("OnboardingWizard.ai.app.grok.botSteps")}</p>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t.rich("OnboardingWizard.ai.connector.externalNote", {
          guide: (chunks) => (
            <AppLink
              inheritSize
              appearance="inline"
              href={GUIDE_HREF[provider]}
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
