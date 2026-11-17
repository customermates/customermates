import type { useTranslations } from "next-intl";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";

import { effectDetailText, runErrorText } from "../components/automation-run-texts";

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

describe("the run history texts", () => {
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
    expect(runErrorText(t, "webhook:missing")).toBe(effectDetailText(t, "webhook:missing"));
  });

  it("names the cause in English", () => {
    const t = translator(catalog("en"));

    expect(effectDetailText(t, "webhook:disabled")).toBe("The webhook is switched off.");
    expect(effectDetailText(t, "previousEffectFailed")).toBe("An earlier step failed, so this one did not run.");
    expect(effectDetailText(t, "agentRuntimeUnavailable:noKey")).toBe(
      "No provider key is saved for this workspace yet.",
    );
  });

  it("keeps a message it does not know as it is", () => {
    const t = translator(catalog("en"));

    expect(effectDetailText(t, "Value is not a valid date")).toBe("Value is not a valid date");
    expect(runErrorText(t, "somethingNew")).toBe("somethingNew");
  });
});
