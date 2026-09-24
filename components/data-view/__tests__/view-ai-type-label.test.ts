import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS } from "@/core/data-view/ai-manageable-surfaces";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { viewAiTypeLabel } from "../views/view-ai-type-label";

const EXPECTED = {
  de: {
    embedded: "Kontakt-Ansicht",
    entity: "Kontakt",
    label: "Kontakt-Ansicht: Alle",
    standalone: "Kontakt-Ansicht",
    timeline: "Aktivitätsansicht",
  },
  en: {
    embedded: "Contact view",
    entity: "Contact",
    label: "Contact view: All",
    standalone: "Contact view",
    timeline: "Activity view",
  },
  es: {
    embedded: "vista de Contacto",
    entity: "Contacto",
    label: "Vista de Contacto: Todas",
    standalone: "Vista de Contacto",
    timeline: "Vista de actividad",
  },
  fr: {
    embedded: "vue Contact",
    entity: "Contact",
    label: "Vue Contact : Toutes",
    standalone: "Vue Contact",
    timeline: "Vue des activités",
  },
  it: {
    embedded: "vista Contatto",
    entity: "Contatto",
    label: "Vista Contatto: Tutte",
    standalone: "Vista Contatto",
    timeline: "Vista attività",
  },
} as const;

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
      const expected = EXPECTED[locale as keyof typeof EXPECTED];
      const entitySingular = () => expected.entity;
      const embedded = viewAiTypeLabel(SURFACE.contacts, viewTypeTranslator, entitySingular, "embedded");
      const standalone = viewAiTypeLabel(SURFACE.contacts, viewTypeTranslator, entitySingular, "standalone");
      expect(embedded).toBe(expected.embedded);
      expect(standalone).toBe(expected.standalone);
      expect(viewAiTypeLabel(SURFACE.entityTimeline, viewTypeTranslator, entitySingular, "standalone")).toBe(
        expected.timeline,
      );
      expect(
        translate("AgentChat.context.viewLabel", {
          name: messages.DataView.views.all,
          viewType: standalone,
        }),
      ).toBe(expected.label);
    },
  );
});
