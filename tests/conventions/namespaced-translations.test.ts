import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const SCOPED_CALL = /\b(?:get|use)Translations\(\s*["'`]([^"'`]+)["'`]\s*\)/gu;
const TRANSLATION_KEY = /\bt(?:\.\w+)?\(\s*["'`]([A-Z][\w.]*)["'`]/gu;

describe("namespaced translations", () => {
  // A scoped getTranslations("A.b") prefixes every key it is given, so t("Common.x") silently
  // resolves to "A.b.Common.x". next-intl renders the unresolved key as visible text rather than
  // throwing, so this shipped a literal "StructuredData.breadcrumb.Common.relatedPages" heading
  // onto 186 sitemap pages. Neither typecheck, lint nor the key-resolution audit caught it.
  it("never passes an absolute key to a scoped translator", () => {
    const problems: string[] = [];

    for (const file of walkFiles(REPO_ROOT, (path) => /\.tsx?$/u.test(path))) {
      if (/node_modules|\.next|\/generated\/|\/__tests__\/|\/tests\//u.test(file)) continue;

      const source = readFileSync(file, "utf8");
      const scopes = [...source.matchAll(SCOPED_CALL)].map((match) => match[1]);
      if (scopes.length === 0) continue;

      for (const [, key] of source.matchAll(TRANSLATION_KEY)) {
        const root = key.split(".")[0];
        if (scopes.some((scope) => scope.split(".")[0] === root)) continue;

        problems.push(`${file.replace(REPO_ROOT + "/", "")}: t("${key}") under scope "${scopes[0]}"`);
      }
    }

    expect(problems, "these keys resolve to <scope>.<key> and render as literal text").toEqual([]);
  });
});
