"use client";

import { useTranslations } from "next-intl";

import { AppLink } from "@/components/shared/app-link";
import { CopyableCode } from "@/components/shared/copyable-code";

type Props = {
  mcpUrl: string;
  workspaceName: string;
};

export function AiConnectionOtherSetup({ mcpUrl, workspaceName }: Props) {
  const t = useTranslations();

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted p-4" data-ai-other-setup="">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t("OnboardingWizard.ai.other.stepsTitle")}</h3>

        <p className="text-xs leading-relaxed text-muted-foreground">{t("OnboardingWizard.ai.other.description")}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-xs font-medium">{t("OnboardingWizard.ai.connector.urlLabel")}</p>

        <CopyableCode value={mcpUrl} />

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("OnboardingWizard.ai.other.workspaceNote", { workspace: workspaceName })}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t.rich("OnboardingWizard.ai.other.keyNote", {
          guide: (chunks) => (
            <AppLink inheritSize appearance="inline" href="/docs/mcp" rel="noreferrer noopener" target="_blank">
              {chunks}
            </AppLink>
          ),
        })}
      </p>
    </div>
  );
}
