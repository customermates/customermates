"use client";

import type { Ref } from "react";
import type { AiConnectionOpenAiMethod, AiConnectionStore } from "./ai-connection.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { AiConnectionApiKeySetup } from "./ai-connection-api-key-setup";
import { AiConnectionConnectorSetup } from "./ai-connection-connector-setup";

const OPENAI_METHODS: AiConnectionOpenAiMethod[] = ["chatgpt", "codex"];

type Props = {
  baseUrl: string;
  disabled: boolean;
  mcpUrl: string;
  resultHeadingRef: Ref<HTMLHeadingElement>;
  store: AiConnectionStore;
  onCreate: () => void;
};

export const AiConnectionOpenAiSetup = observer(function AiConnectionOpenAiSetup({
  baseUrl,
  disabled,
  mcpUrl,
  resultHeadingRef,
  store,
  onCreate,
}: Props) {
  const t = useTranslations();
  const method = store.openAiMethod;

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-label={t("OnboardingWizard.ai.openai.methods.ariaLabel")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        role="group"
      >
        {OPENAI_METHODS.map((candidate) => {
          const isSelected = method === candidate;

          return (
            <Button
              key={candidate}
              aria-controls={`openai-${candidate}-details`}
              aria-expanded={isSelected}
              className="relative h-auto min-h-36 w-full flex-col items-start justify-start whitespace-normal rounded-xl p-4 text-left"
              data-openai-method={candidate}
              disabled={disabled}
              type="button"
              variant="secondary"
              onClick={() => store.selectOpenAiMethod(candidate)}
            >
              <span className="flex w-full items-start justify-between gap-2">
                <span className="text-sm font-medium">
                  {t(`OnboardingWizard.ai.openai.methods.${candidate}.title`)}
                </span>

                {candidate === "chatgpt" ? <Badge>{t("OnboardingWizard.ai.methods.account.recommended")}</Badge> : null}
              </span>

              <span className="text-xs font-normal text-muted-foreground">
                {t(`OnboardingWizard.ai.openai.methods.${candidate}.meta`)}
              </span>

              <span className="text-xs font-normal leading-relaxed text-muted-foreground">
                {t(`OnboardingWizard.ai.openai.methods.${candidate}.description`)}
              </span>

              <span className="mt-auto pt-2 text-[11px] font-normal leading-relaxed text-muted-foreground">
                {t(`OnboardingWizard.ai.openai.methods.${candidate}.note`)}
              </span>
            </Button>
          );
        })}
      </div>

      {method === "chatgpt" ? (
        <div id="openai-chatgpt-details">
          <AiConnectionConnectorSetup mcpUrl={mcpUrl} provider="chatgpt" />
        </div>
      ) : null}

      {method === "codex" ? (
        <div id="openai-codex-details">
          <AiConnectionApiKeySetup
            apiKey={store.apiKey}
            baseUrl={baseUrl}
            hasError={store.hasError}
            isCreating={store.isCreating}
            resultHeadingRef={resultHeadingRef}
            tool="codex"
            onCreate={onCreate}
          />
        </div>
      ) : null}
    </div>
  );
});
