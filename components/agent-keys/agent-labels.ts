import type { useTranslations } from "next-intl";
import type { AgentProviderId } from "@/ee/agent-keys/agent-provider-models";
import type { AgentRuntimeKind } from "@/features/automation-rules/automation-rule.schema";

type Translator = ReturnType<typeof useTranslations>;

export type AgentRuntimeReason = "selfHosted" | "plan" | "noKey" | "noRunner" | "notConfigured";

export function agentProviderLabel(t: Translator, provider: AgentProviderId): string {
  switch (provider) {
    case "anthropic":
      return t("AgentKeys.providers.anthropic");
    case "openai":
      return t("AgentKeys.providers.openai");
    case "google":
      return t("AgentKeys.providers.google");
  }
}

export function agentRuntimeName(t: Translator, runtime: AgentRuntimeKind): string {
  switch (runtime) {
    case "mate":
      return t("AgentRuntime.names.mate");
    case "ownKey":
      return t("AgentRuntime.names.ownKey");
    case "runner":
      return t("AgentRuntime.names.runner");
  }
}

export function agentRuntimeSummary(t: Translator, runtime: AgentRuntimeKind): string {
  switch (runtime) {
    case "mate":
      return t("AgentRuntime.summary.mate");
    case "ownKey":
      return t("AgentRuntime.summary.ownKey");
    case "runner":
      return t("AgentRuntime.summary.runner");
  }
}

export function agentRuntimeReasonLabel(t: Translator, reason: AgentRuntimeReason | null): string {
  switch (reason) {
    case "selfHosted":
      return t("AgentRuntime.reasons.selfHosted");
    case "plan":
      return t("AgentRuntime.reasons.plan");
    case "noKey":
      return t("AgentRuntime.reasons.noKey");
    case "noRunner":
      return t("AgentRuntime.reasons.noRunner");
    case "notConfigured":
    case null:
      return t("AgentRuntime.reasons.notConfigured");
  }
}
