import type { useTranslations } from "next-intl";

type Translate = ReturnType<typeof useTranslations>;

export function effectDetailText(t: Translate, detail: string): string {
  switch (detail) {
    case "previousEffectFailed":
      return t("AutomationRules.detail.previousEffectFailed");
    case "unexpectedError":
      return t("AutomationRules.detail.unexpectedError");
    case "recordMissing":
      return t("AutomationRules.detail.recordMissing");
    case "noRecipients":
      return t("AutomationRules.detail.noRecipients");
    case "webhook:missing":
      return t("AutomationRules.detail.webhookMissing");
    case "webhook:disabled":
      return t("AutomationRules.detail.webhookDisabled");
    case "webhook:notSubscribed":
      return t("AutomationRules.detail.webhookNotSubscribed");
    case "agentJobRefused":
      return t("AutomationRules.detail.agentJobRefused");
    case "agentModelUnavailable":
      return t("AutomationRules.detail.agentModelUnavailable");
    case "agentRunnerUnavailable":
      return t("AutomationRules.detail.agentRunnerUnavailable");
    case "agentRuntimeUnavailable":
    case "agentRuntimeUnavailable:notConfigured":
      return t("Automations.agent.reason.notConfigured");
    case "agentRuntimeUnavailable:noKey":
      return t("Automations.agent.reason.noKey");
    case "agentRuntimeUnavailable:noRunner":
      return t("Automations.agent.reason.noRunner");
    case "agentRuntimeUnavailable:plan":
      return t("Automations.agent.reason.plan");
    case "agentRuntimeUnavailable:selfHosted":
      return t("Automations.agent.reason.selfHosted");
    default:
      return detail;
  }
}

export function runErrorText(t: Translate, error: string): string {
  return error === "ruleInvalid" ? t("AutomationRules.detail.ruleInvalid") : effectDetailText(t, error);
}
