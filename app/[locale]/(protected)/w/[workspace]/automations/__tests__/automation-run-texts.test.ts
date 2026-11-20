import type { useTranslations } from "next-intl";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AUTOMATION_RUN_ABANDONED_ERROR } from "@/features/automation-rules/sweep-automation-rules.interactor";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { effectDetailText, runErrorText, runReasonText } from "../components/automation-run-texts";

type Translate = ReturnType<typeof useTranslations>;

function catalog(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function translator(messages: Record<string, unknown>): Translate {
  return ((key: string) => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
        messages,
      );
    if (typeof value !== "string") throw new Error(`missing message ${key}`);
    return value;
  }) as unknown as Translate;
}

const EFFECT_CODES = [
  "previousEffectFailed",
  "unexpectedError",
  "recordMissing",
  "noRecipients",
  "webhook:missing",
  "webhook:disabled",
  "webhook:notSubscribed",
  "agentJobRefused",
  "agentModelUnavailable",
  "agentRunnerUnavailable",
  "agentRuntimeUnavailable",
  "agentRuntimeUnavailable:notConfigured",
  "agentRuntimeUnavailable:noKey",
  "agentRuntimeUnavailable:noRunner",
  "agentRuntimeUnavailable:plan",
  "agentRuntimeUnavailable:selfHosted",
];

const SKIP_REASONS = [
  "conditionsNotMet",
  "dateChanged",
  "ownerChanged",
  "ownerInactive",
  "ownerMissing",
  "ownerNotPermitted",
  "recordUnavailable",
  "ruleChanged",
  "ruleDisabled",
];

describe("the run history texts", () => {
  it.each(APP_LOCALES)("says in %s why a run was skipped, also when its date changed", (locale) => {
    const t = translator(catalog(locale));

    for (const reason of SKIP_REASONS) {
      const text = runReasonText(t, reason);
      expect(text, reason).not.toBe(reason);
      expect(text, reason).toMatch(/\s/);
    }
    expect(runReasonText(t, "somethingNew")).toBe("somethingNew");
  });

  it("names a changed date in English", () => {
    expect(runReasonText(translator(catalog("en")), "dateChanged")).toBe(
      "The date was changed or cleared before the automation ran.",
    );
  });

  it("covers the eight languages of the app", () => {
    expect(APP_LOCALES).toHaveLength(8);
  });

  it.each(APP_LOCALES)("shows a sentence instead of every known code in %s", (locale) => {
    const t = translator(catalog(locale));

    for (const code of EFFECT_CODES) {
      const text = effectDetailText(t, code);
      expect(text, code).not.toBe(code);
      expect(text, code).toMatch(/\s/);
    }
    expect(runErrorText(t, "ruleInvalid")).not.toBe("ruleInvalid");
    expect(runErrorText(t, "runAbandoned")).not.toBe("runAbandoned");
    expect(runErrorText(t, "runAbandoned")).toMatch(/\s/);
    expect(runErrorText(t, "webhook:missing")).toBe(effectDetailText(t, "webhook:missing"));
  });

  it("says in English that an abandoned run was given up, with the code the sweep writes", () => {
    expect(runErrorText(translator(catalog("en")), AUTOMATION_RUN_ABANDONED_ERROR)).toBe(
      "The run could not be started within 30 minutes and was given up.",
    );
  });

  it("names the cause in English", () => {
    const t = translator(catalog("en"));

    expect(effectDetailText(t, "webhook:disabled")).toBe("The webhook is switched off.");
    expect(effectDetailText(t, "previousEffectFailed")).toBe("An earlier step failed, so this one did not run.");
    expect(effectDetailText(t, "agentRuntimeUnavailable:noKey")).toBe(
      "No provider key is saved for this workspace yet.",
    );
  });

  it.each(APP_LOCALES)("names the owner in %s when no runner was ready, not the reader of the history", (locale) => {
    const messages = catalog(locale);
    const t = translator(messages);

    expect(effectDetailText(t, "agentRuntimeUnavailable:noRunner")).not.toBe(t("Automations.agent.reason.noRunner"));
    expect(effectDetailText(t, "agentRuntimeUnavailable:noRunner")).toBe(t("AutomationRules.detail.agentNoRunner"));
  });

  it("says in English that the owner had no runner", () => {
    expect(effectDetailText(translator(catalog("en")), "agentRuntimeUnavailable:noRunner")).toBe(
      "The owner of the automation had no runner that was ready.",
    );
  });

  it("keeps a message it does not know as it is", () => {
    const t = translator(catalog("en"));

    expect(effectDetailText(t, "Value is not a valid date")).toBe("Value is not a valid date");
    expect(runErrorText(t, "somethingNew")).toBe("somethingNew");
  });
});
