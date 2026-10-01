import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS } from "@/core/data-view/ai-manageable-surfaces";
import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { viewAiTypeLabel } from "../views/view-ai-type-label";

describe("Ask AI view type label", () => {
  it.each(Object.entries({ en, de, es, fr, it: itMessages }))(
    "localizes every supported surface in %s",
    (locale, messages) => {
      const errors: unknown[] = [];
      const translate = createTranslator({
        locale,
        messages,
        onError: (error) => errors.push(error),
      });
      const viewTypeTranslator = translate as (key: string, values?: Record<string, string>) => string;
      for (const surfaceKey of AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS) {
        expect(viewAiTypeLabel(surfaceKey, viewTypeTranslator, () => "Custom entity name", "embedded")).toBeTruthy();
        expect(viewAiTypeLabel(surfaceKey, viewTypeTranslator, () => "Custom entity name", "standalone")).toBeTruthy();
      }

      expect(errors).toEqual([]);
      const key = "records:10000000-0000-4000-8000-000000000011";
      const embedded = viewAiTypeLabel(key, viewTypeTranslator, () => "Unused", "embedded");
      const standalone = viewAiTypeLabel(key, viewTypeTranslator, () => "Unused", "standalone");
      expect(embedded).toContain(messages.RecordModel.records);
      expect(standalone).toContain(messages.RecordModel.records);
      expect(errors).toEqual([]);
    },
  );
});
