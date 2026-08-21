"use client";

import type { AiConnectionProvider } from "./ai-connection.store";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { AiClientLogo } from "./ai-client-logo";
import { AI_CONNECTION_PROVIDERS } from "./ai-connection.store";

type Props = {
  disabled: boolean;
  onSelect: (provider: AiConnectionProvider) => void;
  registerRef: (provider: AiConnectionProvider, element: HTMLButtonElement | null) => void;
};

export function AiConnectionProviderGrid({ disabled, onSelect, registerRef }: Props) {
  const t = useTranslations();

  return (
    <div
      aria-label={t("OnboardingWizard.ai.providers.ariaLabel")}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      role="group"
    >
      {AI_CONNECTION_PROVIDERS.map((provider) => (
        <Button
          key={provider}
          ref={(element) => registerRef(provider, element)}
          className="relative h-auto min-h-14 min-w-0 w-full justify-start whitespace-normal rounded-xl px-3 py-2 text-left xs:min-h-24 xs:flex-col xs:justify-center xs:gap-2 xs:px-2 xs:text-center"
          data-provider={provider}
          disabled={disabled}
          type="button"
          variant="secondary"
          onClick={() => onSelect(provider)}
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
          >
            <AiClientLogo className="size-5" provider={provider} />
          </span>

          <span className="w-full min-w-0 text-sm font-medium">{t(`OnboardingWizard.ai.choices.${provider}`)}</span>
        </Button>
      ))}
    </div>
  );
}
