"use client";

import type { AiConnectionProvider } from "./ai-connection.store";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { AiClientLogo } from "./ai-client-logo";
import { AI_CONNECTION_PROVIDERS } from "./ai-connection.store";

type Props = {
  disabled: boolean;
  onSelect: (provider: AiConnectionProvider) => void;
  registerRef: (provider: AiConnectionProvider, element: HTMLButtonElement | null) => void;
  selectedProvider: AiConnectionProvider | null;
};

export function AiConnectionProviderGrid({ disabled, onSelect, registerRef, selectedProvider }: Props) {
  const t = useTranslations();

  return (
    <div
      aria-label={t("OnboardingWizard.ai.providers.ariaLabel")}
      className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-6"
      role="group"
    >
      {AI_CONNECTION_PROVIDERS.map((provider, index) => {
        const isSelected = selectedProvider === provider;
        const isSecondRow = index >= 3;

        return (
          <Button
            key={provider}
            ref={(element) => registerRef(provider, element)}
            aria-pressed={isSelected}
            className={cn(
              "relative h-auto min-h-14 min-w-0 w-full justify-start whitespace-normal rounded-xl px-3 py-2 text-left xs:min-h-24 xs:flex-col xs:justify-center xs:gap-2 xs:px-2 xs:text-center sm:col-span-2",
              isSecondRow && "sm:col-span-3",
              isSelected && "border-primary bg-primary/5 shadow-[inset_0_0_0_1px_var(--primary)]",
            )}
            data-provider={provider}
            disabled={disabled}
            type="button"
            variant="outline"
            onClick={() => onSelect(provider)}
          >
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
            >
              <AiClientLogo className="size-5" provider={provider} />
            </span>

            <span className="w-full min-w-0 text-sm font-medium">{t(`OnboardingWizard.ai.choices.${provider}`)}</span>

            {isSelected ? <Check aria-hidden className="absolute right-2 top-2 size-3.5 text-primary" /> : null}
          </Button>
        );
      })}
    </div>
  );
}
