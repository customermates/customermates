"use client";

import type { ReactNode } from "react";
import type { AiConnectionCredential, AiConnectionProvider, AiConnectionStore } from "./ai-connection.store";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { AiConnectionApiKeySetup } from "./ai-connection-api-key-setup";
import { AiConnectionClaudeSetup } from "./ai-connection-claude-setup";
import { executeAiConnectionKeyCreation } from "./ai-connection-key-creation";
import { AiConnectionOpenAiSetup } from "./ai-connection-openai-setup";
import { AiConnectionProviderGrid } from "./ai-connection-provider-grid";
import { AiConnectionSubstepHeader } from "./ai-connection-substep-header";

type Props = {
  backLabel?: string;
  beforeProviders?: ReactNode;
  disabled?: boolean;
  showInlineBack?: boolean;
  substepHeaderMode?: "dialog" | "inline";
  store: AiConnectionStore;
  onKeyCreated?: (credential: AiConnectionCredential) => Promise<void> | void;
};

export const AiConnectionFlow = observer(
  ({
    backLabel,
    beforeProviders,
    disabled = false,
    showInlineBack = true,
    substepHeaderMode = "inline",
    store,
    onKeyCreated,
  }: Props) => {
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
            onSelect={store.selectProvider}
          />
        </div>
      );
    }

    if (store.route.screen === "claude") {
      return (
        <div className="flex flex-col gap-4">
          <AiConnectionSubstepHeader
            backDisabled={interactionDisabled}
            backLabel={resolvedBackLabel}
            headingRef={screenHeadingRef}
            mode={substepHeaderMode}
            showBack={showInlineBack}
            subtitle={t("OnboardingWizard.ai.screen.claude.subtitle")}
            title={t("OnboardingWizard.ai.screen.claude.title")}
            onBack={store.backToProviders}
          />

          <AiConnectionClaudeSetup
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
        <AiConnectionSubstepHeader
          backDisabled={interactionDisabled}
          backLabel={resolvedBackLabel}
          headingRef={screenHeadingRef}
          mode={substepHeaderMode}
          showBack={showInlineBack}
          subtitle={t("OnboardingWizard.ai.screen.skip.subtitle")}
          title={t("OnboardingWizard.ai.screen.skip.title")}
          onBack={store.backToProviders}
        />
      );
    }

    if (store.route.screen === "openai") {
      return (
        <div className="flex flex-col gap-4">
          <AiConnectionSubstepHeader
            backDisabled={interactionDisabled}
            backLabel={resolvedBackLabel}
            headingRef={screenHeadingRef}
            mode={substepHeaderMode}
            showBack={showInlineBack}
            subtitle={t("OnboardingWizard.ai.screen.openai.subtitle")}
            title={t("OnboardingWizard.ai.screen.openai.title")}
            onBack={store.backToProviders}
          />

          <AiConnectionOpenAiSetup
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

    const provider = store.route.provider;
    const providerName = t(`OnboardingWizard.ai.choices.${provider}`);

    return (
      <div className="flex flex-col gap-4">
        <AiConnectionSubstepHeader
          backDisabled={interactionDisabled}
          backLabel={resolvedBackLabel}
          headingRef={screenHeadingRef}
          mode={substepHeaderMode}
          showBack={showInlineBack}
          subtitle={t("OnboardingWizard.ai.screen.setup.apiKeySubtitle", {
            provider: providerName,
          })}
          title={t("OnboardingWizard.ai.screen.setup.title", {
            provider: providerName,
          })}
          onBack={store.backToProviders}
        />

        {store.selectedTool ? (
          <AiConnectionApiKeySetup
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
