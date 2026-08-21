"use client";

import type { Ref } from "react";
import type { AiConnectionClaudeClient, AiConnectionClaudeMethod, AiConnectionStore } from "./ai-connection.store";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { AiConnectionApiKeySetup } from "./ai-connection-api-key-setup";
import { AiConnectionConnectorSetup } from "./ai-connection-connector-setup";

const CLAUDE_CLIENTS: AiConnectionClaudeClient[] = ["claudeCode", "claudeDesktop"];

type Props = {
  store: AiConnectionStore;
  baseUrl: string;
  disabled: boolean;
  mcpUrl: string;
  resultHeadingRef: Ref<HTMLHeadingElement>;
  onCreate: () => void;
};

export const AiConnectionClaudeSetup = observer(function AiConnectionClaudeSetup({
  store,
  baseUrl,
  disabled,
  mcpUrl,
  resultHeadingRef,
  onCreate,
}: Props) {
  const t = useTranslations();
  const method = store.claudeMethod;

  const methodButton = (candidate: AiConnectionClaudeMethod) => {
    const isSelected = method === candidate;
    return (
      <Button
        aria-controls={`claude-${candidate}-details`}
        aria-expanded={isSelected}
        className="relative h-auto min-h-36 w-full flex-col items-start justify-start whitespace-normal rounded-xl p-4 text-left"
        disabled={disabled}
        type="button"
        variant="secondary"
        onClick={() => store.selectClaudeMethod(candidate)}
      >
        <span className="flex w-full items-start justify-between gap-2">
          <span className="text-sm font-medium">{t(`OnboardingWizard.ai.methods.${candidate}.title`)}</span>

          {candidate === "account" ? <Badge>{t("OnboardingWizard.ai.methods.account.recommended")}</Badge> : null}
        </span>

        <span className="text-xs font-normal text-muted-foreground">
          {t(`OnboardingWizard.ai.methods.${candidate}.meta`)}
        </span>

        <span className="text-xs font-normal leading-relaxed text-muted-foreground">
          {t(`OnboardingWizard.ai.methods.${candidate}.description`)}
        </span>

        <span className="mt-auto pt-2 text-[11px] font-normal leading-relaxed text-muted-foreground">
          {t(`OnboardingWizard.ai.methods.${candidate}.note`)}
        </span>
      </Button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-label={t("OnboardingWizard.ai.methods.ariaLabel")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        role="group"
      >
        {methodButton("account")}

        {methodButton("local")}
      </div>

      {method === "account" ? (
        <div id="claude-account-details">
          <AiConnectionConnectorSetup mcpUrl={mcpUrl} provider="claude" />
        </div>
      ) : null}

      {method === "local" ? (
        <div
          aria-invalid={store.hasError || undefined}
          className={cn(
            "flex flex-col gap-3 rounded-xl border bg-muted p-4",
            store.hasError && "border-destructive bg-destructive/5",
          )}
          id="claude-local-details"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">{t("OnboardingWizard.ai.local.title")}</h3>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("OnboardingWizard.ai.local.description")}
            </p>
          </div>

          <div
            aria-label={t("OnboardingWizard.ai.local.ariaLabel")}
            className="flex flex-col gap-2 xs:flex-row"
            role="group"
          >
            {CLAUDE_CLIENTS.map((candidate) => {
              const isSelected = store.claudeClient === candidate;
              return (
                <Button
                  key={candidate}
                  aria-pressed={isSelected}
                  className={cn(
                    "h-auto min-h-9 w-full whitespace-normal xs:w-fit",
                    isSelected && "border-primary bg-primary/5",
                  )}
                  data-claude-client={candidate}
                  disabled={disabled}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => store.selectClaudeClient(candidate)}
                >
                  {isSelected ? <Check aria-hidden /> : null}

                  {t(`OnboardingWizard.ai.choices.${candidate}`)}
                </Button>
              );
            })}
          </div>

          {store.claudeClient ? (
            <AiConnectionApiKeySetup
              nested
              apiKey={store.apiKey}
              baseUrl={baseUrl}
              hasError={store.hasError}
              isCreating={store.isCreating}
              resultHeadingRef={resultHeadingRef}
              tool={store.claudeClient}
              onCreate={onCreate}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
