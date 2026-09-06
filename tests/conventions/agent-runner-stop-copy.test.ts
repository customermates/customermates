import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const runnerCopy = (locale: string) =>
  JSON.parse(read(`i18n/locales/${locale}.json`)).AgentChat.runner as Record<string, string>;

// A stopped turn that wrote nothing must not tell the operator that work was completed.
// The benchmark caught a read-only turn claiming "Completed work remains in place".
describe("agent runner stop copy", () => {
  it("branches the stop message on whether the turn actually wrote", () => {
    const workflow = read("workflows/agent-turn.ts");
    expect(workflow).toMatch(/performedWrite\s*\?\s*"creditLimit"\s*:\s*"creditLimitNoWrite"/);
    expect(workflow).toMatch(/performedWrite\s*\?\s*"safetyLimit"\s*:\s*"safetyLimitNoWrite"/);
  });

  it("sets performedWrite only for a successful call to a tool that is not read-only", () => {
    const workflow = read("workflows/agent-turn.ts");
    expect(workflow).toMatch(
      /if \(!isReadOnlyTool\(\{ annotations: shell\.annotations \}\) && isSuccessfulToolOutcome\(outcome\)\)\s*\n\s*performedWrite = true;/,
    );
  });

  it("offers a no-write variant of every stop message that claims completed work", () => {
    for (const locale of APP_LOCALES) {
      const copy = runnerCopy(locale);
      expect(Object.keys(copy), locale).toEqual(expect.arrayContaining(["creditLimitNoWrite", "safetyLimitNoWrite"]));
    }
  });

  it("keeps the no-write copy free of any completion claim", () => {
    const claims = /completed work|remains in place|abgeschlossen.{0,30}bleibt|verbleibt|trabajo.{0,20}completad|travail.{0,20}termin|lavoro.{0,20}completat/i;
    for (const locale of APP_LOCALES) {
      const copy = runnerCopy(locale);
      expect(copy.creditLimitNoWrite, `${locale} creditLimitNoWrite`).not.toMatch(claims);
      expect(copy.safetyLimitNoWrite, `${locale} safetyLimitNoWrite`).not.toMatch(claims);
    }
  });

  it("keeps every runner string free of em dashes", () => {
    for (const locale of APP_LOCALES) {
      for (const [key, value] of Object.entries(runnerCopy(locale))) {
        expect(value, `${locale}.${key}`).not.toMatch(/[—–]/);
      }
    }
  });
});
