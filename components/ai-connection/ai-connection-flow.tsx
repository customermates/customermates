"use client";

import type { ReactNode, Ref } from "react";
import type { McpTool } from "@/features/docs/mcp-install-snippet";
import type {
  AiConnectionClaudeClient,
  AiConnectionClaudeMethod,
  AiConnectionCredential,
  AiConnectionCreateResult,
  AiConnectionProvider,
  AiConnectionStore,
} from "./ai-connection.store";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, ExternalLink, KeyRound, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";
import { CopyableCode } from "@/components/shared/copyable-code";
import { cn } from "@/core/utils/cn";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { getMcpInstallSnippet } from "@/features/docs/mcp-install-snippet";

import { AiClientLogo } from "./ai-client-logo";
import { AI_CONNECTION_PROVIDERS } from "./ai-connection.store";

const CLAUDE_CLIENTS: AiConnectionClaudeClient[] = ["claudeCode", "claudeDesktop"];

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
  onSelect: (provider: AiConnectionProvider) => void;
  registerRef: (provider: AiConnectionProvider, element: HTMLButtonElement | null) => void;
  selectedProvider: AiConnectionProvider | null;
};

export function AiConnectionProviderGrid({ disabled, onSelect, registerRef, selectedProvider }: ProviderGridProps) {
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

type SubstepHeaderProps = {
  backDisabled: boolean;
  backLabel: string;
  mode: "dialog" | "inline";
  headingRef: Ref<HTMLHeadingElement>;
  subtitle: string;
  title: string;
  onBack: () => void;
};

function SubstepHeader({ backDisabled, backLabel, mode, headingRef, subtitle, title, onBack }: SubstepHeaderProps) {
  if (mode === "dialog") return <p className="text-sm text-muted-foreground">{subtitle}</p>;

  return (
    <div className="flex flex-col gap-3">
      <Button className="-ml-2 w-fit" disabled={backDisabled} size="sm" type="button" variant="ghost" onClick={onBack}>
        <ArrowLeft aria-hidden />

        {backLabel}
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
  mcpUrl: string;
  provider: "claude" | "chatgpt";
};

function ConnectorSetup({ mcpUrl, provider }: ConnectorSetupProps) {
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

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t.rich("OnboardingWizard.ai.connector.externalNote", {
          guide: (chunks) => (
            <AppLink
              inheritSize
              appearance="inline"
              href={DOCS_LINKS.connector}
              rel="noreferrer noopener"
              target="_blank"
            >
              {chunks}
            </AppLink>
          ),
        })}
      </p>

      {!isClaude ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{t("OnboardingWizard.ai.connector.paidPlan")}</p>
      ) : null}
    </div>
  );
}

type ApiKeySetupProps = {
  apiKey: string | null;
  baseUrl: string;
  hasError: boolean;
  isCreating: boolean;
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
  nested = false,
  resultHeadingRef,
  tool,
  onCreate,
}: ApiKeySetupProps) {
  const t = useTranslations();
  const toolName = t(`OnboardingWizard.ai.choices.${tool}`);
  const installSnippet = apiKey && baseUrl ? getMcpInstallSnippet(tool, apiKey, baseUrl) : "";
  const actionTitleId = `api-key-action-${tool}-title`;
  const actionDescriptionId = `api-key-action-${tool}-description`;
  const errorId = `api-key-action-${tool}-error`;

  if (!apiKey) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          aria-busy={isCreating}
          aria-describedby={`${actionDescriptionId}${hasError ? ` ${errorId}` : ""}`}
          aria-invalid={hasError || undefined}
          aria-labelledby={actionTitleId}
          className={cn(
            "h-auto min-h-20 w-full justify-start gap-3 whitespace-normal rounded-xl p-4 text-left",
            hasError && "border-destructive bg-destructive/5 hover:bg-destructive/10",
          )}
          data-api-key-setup={tool}
          disabled={isCreating}
          type="button"
          variant="outline"
          onClick={onCreate}
        >
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
          >
            <KeyRound className="size-5" />
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium" id={actionTitleId}>
              {t("OnboardingWizard.ai.createKey")}
            </span>

            <span className="text-xs font-normal leading-relaxed text-muted-foreground" id={actionDescriptionId}>
              {t("OnboardingWizard.ai.createKeyIntro")}
            </span>
          </span>

          {isCreating ? (
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          )}
        </Button>

        {hasError ? (
          <p className="text-xs text-destructive" id={errorId} role="alert">
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

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t.rich("OnboardingWizard.ai.install.keyNote", {
          guide: (chunks) => (
            <AppLink inheritSize appearance="inline" href={DOCS_LINKS[tool]} rel="noreferrer noopener" target="_blank">
              {chunks}
            </AppLink>
          ),
        })}
      </p>
    </div>
  );
}

type ClaudeSetupProps = {
  store: AiConnectionStore;
  baseUrl: string;
  disabled: boolean;
  mcpUrl: string;
  resultHeadingRef: Ref<HTMLHeadingElement>;
  onCreate: () => void;
};

export const ClaudeSetup = observer(function ClaudeSetup({
  store,
  baseUrl,
  disabled,
  mcpUrl,
  resultHeadingRef,
  onCreate,
}: ClaudeSetupProps) {
  const t = useTranslations();
  const method = store.claudeMethod;

  const methodButton = (candidate: AiConnectionClaudeMethod) => {
    const isSelected = method === candidate;
    return (
      <Button
        aria-controls={`claude-${candidate}-details`}
        aria-expanded={isSelected}
        aria-pressed={isSelected}
        className={cn(
          "relative h-auto min-h-36 w-full flex-col items-start justify-start whitespace-normal rounded-xl p-4 text-left",
          isSelected && "border-primary bg-primary/5 shadow-[inset_0_0_0_1px_var(--primary)]",
        )}
        disabled={disabled}
        type="button"
        variant="outline"
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

        {isSelected ? <Check aria-hidden className="absolute bottom-3 right-3 text-primary" /> : null}
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
          <ConnectorSetup mcpUrl={mcpUrl} provider="claude" />
        </div>
      ) : null}

      {method === "local" ? (
        <div
          aria-invalid={store.hasError || undefined}
          className={cn(
            "flex flex-col gap-3 rounded-xl border bg-muted/30 p-4",
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
                  variant="outline"
                  onClick={() => store.selectClaudeClient(candidate)}
                >
                  {isSelected ? <Check aria-hidden /> : null}

                  {t(`OnboardingWizard.ai.choices.${candidate}`)}
                </Button>
              );
            })}
          </div>

          {store.claudeClient ? (
            <ApiKeySetup
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

type Props = {
  backLabel?: string;
  beforeProviders?: ReactNode;
  disabled?: boolean;
  substepHeaderMode?: "dialog" | "inline";
  store: AiConnectionStore;
  onKeyCreated?: (credential: AiConnectionCredential) => Promise<void> | void;
};

type ExecuteKeyCreationArgs = {
  createKey: () => Promise<AiConnectionCreateResult>;
  failureMessage: string;
  onKeyCreated?: (credential: AiConnectionCredential) => Promise<void> | void;
};

export async function executeAiConnectionKeyCreation({
  createKey,
  failureMessage,
  onKeyCreated,
}: ExecuteKeyCreationArgs): Promise<AiConnectionCreateResult> {
  const result = await createKey();
  if (result.status === "failed") {
    if (!result.error || !toastZodErrorTree(result.error)) toast.error(failureMessage);
    return result;
  }
  if (result.status === "created") await onKeyCreated?.(result.credential);
  return result;
}

export const AiConnectionFlow = observer(
  ({ backLabel, beforeProviders, disabled = false, substepHeaderMode = "inline", store, onKeyCreated }: Props) => {
    const t = useTranslations();
    const providerRefs = useRef<Partial<Record<AiConnectionProvider, HTMLButtonElement | null>>>({});
    const screenHeadingRef = useRef<HTMLHeadingElement>(null);
    const resultHeadingRef = useRef<HTMLHeadingElement>(null);
    const previousScreen = useRef(store.screen);
    const previousApiKey = useRef(store.apiKey);

    const baseUrl = typeof window === "undefined" ? "" : window.location.origin;
    const mcpUrl = baseUrl ? `${baseUrl}/api/v1/mcp` : "";
    const interactionDisabled = disabled || store.isCreating;

    useEffect(() => {
      if (previousScreen.current === store.screen) return;
      if (store.screen === "providers") {
        if (store.selectedProvider) providerRefs.current[store.selectedProvider]?.focus();
      } else screenHeadingRef.current?.focus();
      previousScreen.current = store.screen;
    }, [store.screen, store.selectedProvider]);

    useEffect(() => {
      if (store.apiKey && previousApiKey.current !== store.apiKey) resultHeadingRef.current?.focus();
      previousApiKey.current = store.apiKey;
    }, [store.apiKey]);

    const resolvedBackLabel = backLabel ?? t("OnboardingWizard.ai.screen.back");
    const createKey = () =>
      executeAiConnectionKeyCreation({
        createKey: store.createApiKey,
        failureMessage: t("OnboardingWizard.ai.errors.createFailed"),
        onKeyCreated,
      });

    if (store.route.screen === "providers") {
      return (
        <div className="flex flex-col gap-4">
          {beforeProviders}

          <AiConnectionProviderGrid
            disabled={interactionDisabled}
            registerRef={(provider, element) => {
              providerRefs.current[provider] = element;
            }}
            selectedProvider={store.selectedProvider}
            onSelect={store.selectProvider}
          />
        </div>
      );
    }

    if (store.route.screen === "claude") {
      return (
        <div className="flex flex-col gap-4">
          <SubstepHeader
            backDisabled={interactionDisabled}
            backLabel={resolvedBackLabel}
            headingRef={screenHeadingRef}
            mode={substepHeaderMode}
            subtitle={t("OnboardingWizard.ai.screen.claude.subtitle")}
            title={t("OnboardingWizard.ai.screen.claude.title")}
            onBack={store.backToProviders}
          />

          <ClaudeSetup
            baseUrl={baseUrl}
            disabled={interactionDisabled}
            mcpUrl={mcpUrl}
            resultHeadingRef={resultHeadingRef}
            store={store}
            onCreate={() => void createKey()}
          />
        </div>
      );
    }

    if (store.route.screen === "skip") {
      return (
        <SubstepHeader
          backDisabled={interactionDisabled}
          backLabel={resolvedBackLabel}
          headingRef={screenHeadingRef}
          mode={substepHeaderMode}
          subtitle={t("OnboardingWizard.ai.screen.skip.subtitle")}
          title={t("OnboardingWizard.ai.screen.skip.title")}
          onBack={store.backToProviders}
        />
      );
    }

    const provider = store.route.provider;
    const providerName = t(`OnboardingWizard.ai.choices.${provider}`);
    const isConnector = provider === "chatgpt";

    return (
      <div className="flex flex-col gap-4">
        <SubstepHeader
          backDisabled={interactionDisabled}
          backLabel={resolvedBackLabel}
          headingRef={screenHeadingRef}
          mode={substepHeaderMode}
          subtitle={
            isConnector
              ? t("OnboardingWizard.ai.screen.setup.connectorSubtitle", {
                  provider: providerName,
                })
              : t("OnboardingWizard.ai.screen.setup.apiKeySubtitle", {
                  provider: providerName,
                })
          }
          title={t("OnboardingWizard.ai.screen.setup.title", {
            provider: providerName,
          })}
          onBack={store.backToProviders}
        />

        {isConnector ? (
          <ConnectorSetup mcpUrl={mcpUrl} provider="chatgpt" />
        ) : store.selectedTool ? (
          <ApiKeySetup
            apiKey={store.apiKey}
            baseUrl={baseUrl}
            hasError={store.hasError}
            isCreating={store.isCreating}
            resultHeadingRef={resultHeadingRef}
            tool={store.selectedTool}
            onCreate={() => void createKey()}
          />
        ) : null}
      </div>
    );
  },
);
