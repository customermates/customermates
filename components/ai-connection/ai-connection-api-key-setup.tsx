"use client";

import type { Ref } from "react";
import type { McpTool } from "@/features/docs/mcp-install-snippet";

import { useTranslations } from "next-intl";
import { ArrowRight, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";
import { CopyableCode } from "@/components/shared/copyable-code";
import { cn } from "@/core/utils/cn";
import { getMcpInstallSnippet } from "@/features/docs/mcp-install-snippet";

const DOCS_LINKS: Record<McpTool, string> = {
  claudeCode: "/docs/connect-cli#claude-code",
  claudeDesktop: "/docs/connect-cli#claude-desktop-config-file",
  codex: "/docs/connect-cli#codex",
  cursor: "/docs/connect-cli#cursor",
  gemini: "/docs/connect-cli#gemini-cli",
};

type Props = {
  apiKey: string | null;
  baseUrl: string;
  hasError: boolean;
  isCreating: boolean;
  nested?: boolean;
  resultHeadingRef: Ref<HTMLHeadingElement>;
  tool: McpTool;
  onCreate: () => void;
};

export function AiConnectionApiKeySetup({
  apiKey,
  baseUrl,
  hasError,
  isCreating,
  nested = false,
  resultHeadingRef,
  tool,
  onCreate,
}: Props) {
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
          variant="secondary"
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
    <div className={cn("flex min-w-0 flex-col gap-3", !nested && "rounded-xl border bg-muted p-4")}>
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
