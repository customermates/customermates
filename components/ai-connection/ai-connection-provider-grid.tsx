"use client";

import type { ComponentProps, ReactNode } from "react";
import type { AiConnectionProvider } from "./ai-connection.store";

import { ChevronRight, Plug } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingsPanelLogo } from "@/components/shared/settings-panel";

import { AiClientLogo } from "./ai-client-logo";
import { AI_CONNECTION_PROVIDERS } from "./ai-connection.store";

type Props = {
  disabled: boolean;
  onSelect: (provider: AiConnectionProvider) => void;
  onSelectOther?: () => void;
  registerRef: (provider: AiConnectionProvider, element: HTMLButtonElement | null) => void;
};

const ROW_CLASS =
  "flex w-full min-w-0 cursor-pointer items-center gap-3 border-b px-4 py-3 text-left first:rounded-t-xl last:rounded-b-xl outline-none transition-colors last:border-b-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50";

function ProviderRow({
  logo,
  title,
  caption,
  ...props
}: Omit<ComponentProps<"button">, "title"> & {
  logo: ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <button className={ROW_CLASS} type="button" {...props}>
      <SettingsPanelLogo>{logo}</SettingsPanelLogo>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">{title}</span>

        <span className="text-xs text-muted-foreground">{caption}</span>
      </span>

      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function AiConnectionProviderGrid({ disabled, onSelect, onSelectOther, registerRef }: Props) {
  const t = useTranslations();
  const captions: Record<AiConnectionProvider, string> = {
    claude: t("OnboardingWizard.ai.captions.claude"),
    openai: t("OnboardingWizard.ai.captions.openai"),
    cursor: t("OnboardingWizard.ai.captions.cursor"),
    gemini: t("OnboardingWizard.ai.captions.gemini"),
  };

  return (
    <div
      aria-label={t("OnboardingWizard.ai.providers.ariaLabel")}
      className="flex flex-col rounded-xl border bg-card shadow-xs"
      role="group"
    >
      {AI_CONNECTION_PROVIDERS.map((provider) => (
        <ProviderRow
          key={provider}
          ref={(element) => registerRef(provider, element)}
          caption={captions[provider]}
          data-provider={provider}
          disabled={disabled}
          logo={<AiClientLogo className="size-5" provider={provider} />}
          title={t(`OnboardingWizard.ai.choices.${provider}`)}
          onClick={() => onSelect(provider)}
        />
      ))}

      {onSelectOther ? (
        <ProviderRow
          caption={t("OnboardingWizard.ai.captions.other")}
          data-other-client=""
          disabled={disabled}
          logo={<Plug aria-hidden="true" className="size-5" />}
          title={t("OnboardingWizard.ai.other.title")}
          onClick={onSelectOther}
        />
      ) : null}
    </div>
  );
}
