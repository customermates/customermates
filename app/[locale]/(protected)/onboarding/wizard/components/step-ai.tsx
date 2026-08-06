"use client";

import type { Ref } from "react";
import type { LucideIcon } from "lucide-react";
import type { McpTool } from "@/features/docs/mcp-install-snippet";
import type { StepAiClaudeClient, StepAiClaudeMethod, StepAiProvider } from "./step-ai.store";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import {
  ArrowLeft,
  Asterisk,
  Check,
  ExternalLink,
  Loader2,
  MessageCircle,
  MousePointer2,
  Sparkles,
  SquareTerminal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyableCode } from "@/components/shared/copyable-code";
import { cn } from "@/core/utils/cn";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getMcpInstallSnippet } from "@/features/docs/mcp-install-snippet";

import { STEP_AI_PROVIDERS } from "./step-ai.store";

const PROVIDER_ICONS: Record<StepAiProvider, LucideIcon> = {
  claude: Asterisk,
  chatgpt: MessageCircle,
  codex: SquareTerminal,
  cursor: MousePointer2,
  gemini: Sparkles,
};

const CLAUDE_CLIENTS: StepAiClaudeClient[] = ["claudeCode", "claudeDesktop"];

const DOCS_LINKS: Record<McpTool | "connector", string> = {
  claudeCode: "/docs/connect-cli#claude-code",
  claudeDesktop: "/docs/connect-cli#claude-desktop-config-file",
  codex: "/docs/connect-cli#codex",
  connector: "/docs/connect-custom-connector",
  cursor: "/docs/connect-cli#cursor",
  gemini: "/docs/connect-cli#gemini-cli",
};

type ProviderGridProps = {
  disabled: boolean;
  onSelect: (provider: StepAiProvider) => void;
  registerRef: (provider: StepAiProvider, element: HTMLButtonElement | null) => void;
  selectedProvider: StepAiProvider | null;
};

function ProviderGrid({ disabled, onSelect, registerRef, selectedProvider }: ProviderGridProps) {
  const t = useTranslations();

  return (
    <div
      aria-label={t("OnboardingWizard.ai.providers.ariaLabel")}
      className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-5"
      role="group"
    >
      {STEP_AI_PROVIDERS.map((provider) => {
        const Icon = PROVIDER_ICONS[provider];
        const isSelected = selectedProvider === provider;

        return (
          <Button
            key={provider}
            ref={(element) => registerRef(provider, element)}
            aria-pressed={isSelected}
            className={cn(
              "relative h-auto min-h-14 w-full justify-start whitespace-normal rounded-xl px-3 py-2 text-left xs:min-h-24 xs:flex-col xs:justify-center xs:gap-2 xs:px-2 xs:text-center",
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
              <Icon className="size-4" />
            </span>

            <span className="min-w-0 text-sm font-medium">{t(`OnboardingWizard.ai.choices.${provider}`)}</span>

            {isSelected ? <Check aria-hidden className="absolute right-2 top-2 size-3.5 text-primary" /> : null}
          </Button>
        );
      })}
    </div>
  );
}

type SubstepHeaderProps = {
  backDisabled: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  subtitle: string;
  title: string;
  onBack: () => void;
};

function SubstepHeader({ backDisabled, headingRef, subtitle, title, onBack }: SubstepHeaderProps) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-3">
      <Button className="-ml-2 w-fit" disabled={backDisabled} size="sm" type="button" variant="ghost" onClick={onBack}>
        <ArrowLeft aria-hidden />

        {t("OnboardingWizard.ai.screen.back")}
      </Button>

      <div className="flex flex-col gap-1">
        <h2
          ref={headingRef}
          className="rounded-sm text-lg font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          tabIndex={-1}
        >
          {title}
        </h2>

        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

type ConnectorSetupProps = {
  locale: string;
  mcpUrl: string;
  provider: "claude" | "chatgpt";
};

function ConnectorSetup({ locale, mcpUrl, provider }: ConnectorSetupProps) {
  const t = useTranslations();
  const isClaude = provider === "claude";

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/30 p-4">
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
        <Button asChild className="h-auto w-full whitespace-normal xs:w-fit" size="sm">
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

      <p className="text-xs leading-relaxed text-muted-foreground">{t("OnboardingWizard.ai.connector.externalNote")}</p>

      {!isClaude ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{t("OnboardingWizard.ai.connector.paidPlan")}</p>
      ) : null}

      <a
        className="w-fit text-xs text-primary underline underline-offset-4"
        href={`/${locale}${DOCS_LINKS.connector}`}
        rel="noreferrer"
        target="_blank"
      >
        {t("OnboardingWizard.ai.fullGuide")}
      </a>
    </div>
  );
}

type ApiKeySetupProps = {
  apiKey: string | null;
  baseUrl: string;
  hasError: boolean;
  isCreating: boolean;
  locale: string;
  nested?: boolean;
  resultHeadingRef: Ref<HTMLHeadingElement>;
  tool: McpTool;
  onCreate: () => void;
};

function ApiKeySetup({
  apiKey,
  baseUrl,
  hasError,
  isCreating,
  locale,
  nested = false,
  resultHeadingRef,
  tool,
  onCreate,
}: ApiKeySetupProps) {
  const t = useTranslations();
  const toolName = t(`OnboardingWizard.ai.choices.${tool}`);
  const installSnippet = apiKey && baseUrl ? getMcpInstallSnippet(tool, apiKey, baseUrl) : "";

  if (!apiKey) {
    return (
      <div aria-busy={isCreating} className={cn("flex flex-col gap-3", !nested && "rounded-xl border bg-muted/30 p-4")}>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("OnboardingWizard.ai.createKeyIntro")}</p>

        <Button
          className="h-auto w-full whitespace-normal xs:w-fit"
          disabled={isCreating}
          size="sm"
          type="button"
          onClick={onCreate}
        >
          {isCreating ? <Loader2 aria-hidden className="animate-spin" /> : null}

          {t("OnboardingWizard.ai.createKey")}
        </Button>

        {hasError ? (
          <p className="text-xs text-destructive" role="alert">
            {t("OnboardingWizard.ai.errors.createFailed")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", !nested && "rounded-xl border bg-muted/30 p-4")}>
      <div className="flex flex-col gap-1">
        <h3
          ref={resultHeadingRef}
          className="rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          tabIndex={-1}
        >
          {t("OnboardingWizard.ai.install.label", { tool: toolName })}
        </h3>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t(`OnboardingWizard.ai.install.instruction.${tool}`)}
        </p>
      </div>

      <CopyableCode value={installSnippet} />

      <p className="text-xs leading-relaxed text-muted-foreground">{t("OnboardingWizard.ai.install.keyNote")}</p>

      <a
        className="w-fit text-xs text-primary underline underline-offset-4"
        href={`/${locale}${DOCS_LINKS[tool]}`}
        rel="noreferrer"
        target="_blank"
      >
        {t("OnboardingWizard.ai.fullGuide")}
      </a>
    </div>
  );
}

type ClaudeSetupProps = {
  apiKey: string | null;
  baseUrl: string;
  client: StepAiClaudeClient | null;
  disabled: boolean;
  hasError: boolean;
  isCreating: boolean;
  locale: string;
  mcpUrl: string;
  method: StepAiClaudeMethod | null;
  resultHeadingRef: Ref<HTMLHeadingElement>;
  onCreate: () => void;
  onSelectClient: (client: StepAiClaudeClient) => void;
  onSelectMethod: (method: StepAiClaudeMethod) => void;
};

function ClaudeSetup({
  apiKey,
  baseUrl,
  client,
  disabled,
  hasError,
  isCreating,
  locale,
  mcpUrl,
  method,
  resultHeadingRef,
  onCreate,
  onSelectClient,
  onSelectMethod,
}: ClaudeSetupProps) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-label={t("OnboardingWizard.ai.methods.ariaLabel")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        role="group"
      >
        <Button
          aria-controls="claude-account-details"
          aria-expanded={method === "account"}
          aria-pressed={method === "account"}
          className={cn(
            "relative h-auto min-h-36 w-full flex-col items-start justify-start whitespace-normal rounded-xl p-4 text-left",
            method === "account" && "border-primary bg-primary/5 shadow-[inset_0_0_0_1px_var(--primary)]",
          )}
          disabled={disabled}
          type="button"
          variant="outline"
          onClick={() => onSelectMethod("account")}
        >
          <span className="flex w-full items-start justify-between gap-2">
            <span className="text-sm font-medium">{t("OnboardingWizard.ai.methods.account.title")}</span>

            <Badge>{t("OnboardingWizard.ai.methods.account.recommended")}</Badge>
          </span>

          <span className="text-xs font-normal text-muted-foreground">
            {t("OnboardingWizard.ai.methods.account.meta")}
          </span>

          <span className="text-xs font-normal leading-relaxed text-muted-foreground">
            {t("OnboardingWizard.ai.methods.account.description")}
          </span>

          <span className="mt-auto pt-2 text-[11px] font-normal leading-relaxed text-muted-foreground">
            {t("OnboardingWizard.ai.methods.account.note")}
          </span>

          {method === "account" ? <Check aria-hidden className="absolute bottom-3 right-3 text-primary" /> : null}
        </Button>

        <Button
          aria-controls="claude-local-details"
          aria-expanded={method === "local"}
          aria-pressed={method === "local"}
          className={cn(
            "relative h-auto min-h-36 w-full flex-col items-start justify-start whitespace-normal rounded-xl p-4 text-left",
            method === "local" && "border-primary bg-primary/5 shadow-[inset_0_0_0_1px_var(--primary)]",
          )}
          disabled={disabled}
          type="button"
          variant="outline"
          onClick={() => onSelectMethod("local")}
        >
          <span className="text-sm font-medium">{t("OnboardingWizard.ai.methods.local.title")}</span>

          <span className="text-xs font-normal text-muted-foreground">
            {t("OnboardingWizard.ai.methods.local.meta")}
          </span>

          <span className="text-xs font-normal leading-relaxed text-muted-foreground">
            {t("OnboardingWizard.ai.methods.local.description")}
          </span>

          <span className="mt-auto pt-2 text-[11px] font-normal leading-relaxed text-muted-foreground">
            {t("OnboardingWizard.ai.methods.local.note")}
          </span>

          {method === "local" ? <Check aria-hidden className="absolute bottom-3 right-3 text-primary" /> : null}
        </Button>
      </div>

      {method === "account" ? (
        <div id="claude-account-details">
          <ConnectorSetup locale={locale} mcpUrl={mcpUrl} provider="claude" />
        </div>
      ) : null}

      {method === "local" ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4" id="claude-local-details">
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
              const isSelected = client === candidate;
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
                  variant="outline"
                  onClick={() => onSelectClient(candidate)}
                >
                  {isSelected ? <Check aria-hidden /> : null}

                  {t(`OnboardingWizard.ai.choices.${candidate}`)}
                </Button>
              );
            })}
          </div>

          {client ? (
            <ApiKeySetup
              nested
              apiKey={apiKey}
              baseUrl={baseUrl}
              hasError={hasError}
              isCreating={isCreating}
              locale={locale}
              resultHeadingRef={resultHeadingRef}
              tool={client}
              onCreate={onCreate}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const StepAi = observer(() => {
  const t = useTranslations();
  const locale = useLocale();
  const { onboardingWizardStore, stepAiStore } = useRootStore();
  const providerRefs = useRef<Partial<Record<StepAiProvider, HTMLButtonElement | null>>>({});
  const screenHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousScreen = useRef(stepAiStore.screen);
  const previousApiKey = useRef(stepAiStore.apiKey);

  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;
  const mcpUrl = baseUrl ? `${baseUrl}/api/v1/mcp` : "";
  const interactionDisabled = stepAiStore.isCreating || onboardingWizardStore.isSubmitting;

  useEffect(() => {
    if (previousScreen.current === stepAiStore.screen) return;

    if (stepAiStore.screen === "providers") {
      if (stepAiStore.selectedProvider) providerRefs.current[stepAiStore.selectedProvider]?.focus();
    } else screenHeadingRef.current?.focus();

    previousScreen.current = stepAiStore.screen;
  }, [stepAiStore.screen, stepAiStore.selectedProvider]);

  useEffect(() => {
    if (stepAiStore.apiKey && previousApiKey.current !== stepAiStore.apiKey) resultHeadingRef.current?.focus();
    previousApiKey.current = stepAiStore.apiKey;
  }, [stepAiStore.apiKey]);

  const renderScreen = () => {
    if (stepAiStore.route.screen === "providers") {
      return (
        <ProviderGrid
          disabled={interactionDisabled}
          registerRef={(provider, element) => {
            providerRefs.current[provider] = element;
          }}
          selectedProvider={stepAiStore.selectedProvider}
          onSelect={stepAiStore.selectProvider}
        />
      );
    }

    if (stepAiStore.route.screen === "claude") {
      return (
        <div className="flex flex-col gap-4">
          <SubstepHeader
            backDisabled={interactionDisabled}
            headingRef={screenHeadingRef}
            subtitle={t("OnboardingWizard.ai.screen.claude.subtitle")}
            title={t("OnboardingWizard.ai.screen.claude.title")}
            onBack={stepAiStore.backToProviders}
          />

          <ClaudeSetup
            apiKey={stepAiStore.apiKey}
            baseUrl={baseUrl}
            client={stepAiStore.claudeClient}
            disabled={interactionDisabled}
            hasError={stepAiStore.hasError}
            isCreating={stepAiStore.isCreating}
            locale={locale}
            mcpUrl={mcpUrl}
            method={stepAiStore.claudeMethod}
            resultHeadingRef={resultHeadingRef}
            onCreate={() => void stepAiStore.createApiKey()}
            onSelectClient={stepAiStore.selectClaudeClient}
            onSelectMethod={stepAiStore.selectClaudeMethod}
          />
        </div>
      );
    }

    if (stepAiStore.route.screen === "skip") {
      return (
        <div className="flex flex-col gap-4">
          <SubstepHeader
            backDisabled={interactionDisabled}
            headingRef={screenHeadingRef}
            subtitle={t("OnboardingWizard.ai.screen.skip.subtitle")}
            title={t("OnboardingWizard.ai.screen.skip.title")}
            onBack={stepAiStore.backToProviders}
          />
        </div>
      );
    }

    const provider = stepAiStore.route.provider;
    const providerName = t(`OnboardingWizard.ai.choices.${provider}`);
    const isConnector = provider === "chatgpt";

    return (
      <div className="flex flex-col gap-4">
        <SubstepHeader
          backDisabled={interactionDisabled}
          headingRef={screenHeadingRef}
          subtitle={
            isConnector
              ? t("OnboardingWizard.ai.screen.setup.connectorSubtitle", { provider: providerName })
              : t("OnboardingWizard.ai.screen.setup.apiKeySubtitle", { provider: providerName })
          }
          title={t("OnboardingWizard.ai.screen.setup.title", { provider: providerName })}
          onBack={stepAiStore.backToProviders}
        />

        {isConnector ? (
          <ConnectorSetup locale={locale} mcpUrl={mcpUrl} provider="chatgpt" />
        ) : stepAiStore.selectedTool ? (
          <ApiKeySetup
            apiKey={stepAiStore.apiKey}
            baseUrl={baseUrl}
            hasError={stepAiStore.hasError}
            isCreating={stepAiStore.isCreating}
            locale={locale}
            resultHeadingRef={resultHeadingRef}
            tool={stepAiStore.selectedTool}
            onCreate={() => void stepAiStore.createApiKey()}
          />
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {renderScreen()}

      <div className="flex flex-col gap-3 border-t pt-4 xs:flex-row xs:items-center xs:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">{t("OnboardingWizard.ai.footer.optionalNote")}</p>

        <div className="flex flex-col-reverse gap-2 xs:flex-row xs:justify-end">
          {stepAiStore.route.screen === "providers" ? (
            <Button
              className="h-auto w-full whitespace-normal xs:w-fit"
              disabled={interactionDisabled}
              size="sm"
              type="button"
              variant="ghost"
              onClick={stepAiStore.selectSkip}
            >
              {t("OnboardingWizard.ai.choices.skip")}
            </Button>
          ) : null}

          <Button
            className="h-auto w-full whitespace-normal xs:w-fit"
            disabled={!stepAiStore.canFinish || onboardingWizardStore.isSubmitting}
            type="button"
            onClick={() => void onboardingWizardStore.complete()}
          >
            {t("OnboardingWizard.finish")}
          </Button>
        </div>
      </div>
    </div>
  );
});
