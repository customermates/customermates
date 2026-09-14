import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { DATA_VIEW_SURFACE_KEYS, SURFACE } from "@/core/data-view/data-view-keys";
import { viewAiLocation } from "../views/view-ai-location";

describe("Ask AI location", () => {
  it.each(Object.entries({ en, de, es, fr, it: itMessages }))(
    "localizes every supported surface in %s",
    (locale, messages) => {
      const errors: unknown[] = [];
      const translate = createTranslator({ locale, messages, onError: (error) => errors.push(error) });
      for (const surfaceKey of DATA_VIEW_SURFACE_KEYS) {
        expect(
          viewAiLocation(surfaceKey, translate as (key: string) => string, () => "Custom entity name"),
        ).toBeTruthy();
      }

      expect(errors).toEqual([]);
      expect(viewAiLocation(SURFACE.contacts, translate as (key: string) => string, () => "Customers")).toBe(
        "Customers",
      );
      expect(viewAiLocation(SURFACE.entityTimeline, translate as (key: string) => string, () => "Contacts")).toBe(
        messages.DataView.views.aiRequest.timelineLocation,
      );
    },
  );
});
