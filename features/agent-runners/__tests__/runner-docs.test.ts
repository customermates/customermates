import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";

const ROOT = join(__dirname, "..", "..", "..");
const LOCALES = APP_LOCALES;

function page(locale: string): string {
  return readFileSync(join(ROOT, "content", "docs", locale, "app-runners.mdx"), "utf8");
}

function noRunnerText(locale: string): string {
  const messages = JSON.parse(readFileSync(join(ROOT, "i18n", "locales", `${locale}.json`), "utf8")) as {
    Automations: { agent: { reason: { noRunner: string } } };
  };
  return messages.Automations.agent.reason.noRunner;
}

describe("the runners docs page", () => {
  it.each(LOCALES)(
    "says in %s that a step fails at once, with the text the workspace shows, while no own runner has reported a CLI",
    (locale) => {
      const requirement = page(locale)
        .split("\n")
        .find((line) => line.startsWith("- ") && line.includes("Claude Code, Codex") && line.includes("Gemini CLI"));

      expect(requirement).toBeDefined();
      expect(requirement).toContain(noRunnerText(locale));
      expect(requirement).not.toContain("15");
    },
  );

  it.each(LOCALES)("says in %s that a member the Free plan paused keeps their runners", (locale) => {
    const lines = page(locale).split("\n");
    const forAgents = lines.find((line) => line.includes("401"));
    const revoking = lines[lines.findIndex((line) => line.includes("#how-do-i-revoke-a-runner")) + 2];

    expect(forAgents).toContain("Free");
    expect(revoking).toContain("Free");
  });
});
