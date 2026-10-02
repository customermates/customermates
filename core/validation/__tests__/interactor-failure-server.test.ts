import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";
import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";

import { failIssues } from "../interactor-failure-server";
import { CustomErrorCode } from "../validation.types";
import { serializeInteractorFailure } from "../validation.utils";

const harness = vi.hoisted<{ locale: AppLocale }>(() => ({ locale: "en" }));
const dictionaries = { de, en, es, fr, it: itMessages } satisfies Record<AppLocale, unknown>;
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve(
      createTranslator({
        locale: harness.locale,
        messages: dictionaries[harness.locale],
        namespace: "Common.errors",
      }),
    ),
}));

const codes = [
  CustomErrorCode.wikiSourceExclusionImportedInvalid,
  CustomErrorCode.wikiSourceExclusionDuplicateInvalid,
  CustomErrorCode.wikiSourceExclusionOverlapInvalid,
  CustomErrorCode.wikiSourceExclusionEvidenceInvalid,
];

describe("indexed localized interactor failures", () => {
  it.each(APP_LOCALES)("preserves all typed issues, indexed paths and substitutions in %s", async (locale) => {
    harness.locale = locale;
    const failure = await failIssues(
      codes.map((code, index) => ({
        code,
        path: ["excluded", index, "basis"],
        values: {
          sourceId: `source-${index}`,
          duplicateOfSourceId: "source-anchor",
          coveredByTitle: "Retained offering",
        },
      })),
    );
    const serialized = serializeInteractorFailure(failure.error);
    expect(serialized.kind).toBe("validation");
    expect(serialized.issues).toHaveLength(codes.length);
    for (let index = 0; index < codes.length; index++) {
      expect(serialized.issues[index]).toMatchObject({
        customCode: codes[index],
        path: ["excluded", index, "basis"],
      });
      expect(serialized.issues[index].message).toContain(`source-${index}`);
      expect(serialized.issues[index].message).not.toMatch(/\{(?:sourceId|duplicateOfSourceId|coveredByTitle)\}/);
    }
  });

  it("rejects an empty programmer-generated failure instead of serializing an invalid outcome", async () => {
    await expect(failIssues([])).rejects.toThrow("An interactor failure requires at least one issue.");
  });
});
