import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import it_ from "@/i18n/locales/it.json";

import { eventLabel, LEGACY_DOMAIN_EVENTS } from "../event-label";

const LOCALES = { de, en, es, fr, it: it_ };

function translator(locale: keyof typeof LOCALES) {
  const onError = vi.fn();
  const t = createTranslator({ locale, messages: LOCALES[locale], onError });
  return {
    onError,
    t: Object.assign((key: string) => t(key as never), {
      has: (key: string) => t.has(key as never),
      raw: (key: string) => t.raw(key as never) as unknown,
    }),
  };
}

describe("eventLabel", () => {
  it("translates current domain events", () => {
    const { onError, t } = translator("en");

    expect(eventLabel(t, "record.created")).toBe("Record created");
    expect(eventLabel(t, "messaging.email.received")).toBe("Email Received");
    expect(onError).not.toHaveBeenCalled();
  });

  it("labels migrated legacy record events as legacy", () => {
    const { onError, t } = translator("en");

    expect(eventLabel(t, "contact.created")).toBe("Contact created (legacy)");
    expect(eventLabel(t, "organization.updated")).toBe("Organization updated (legacy)");
    expect(eventLabel(t, "deal.deleted")).toBe("Deal deleted (legacy)");
    expect(eventLabel(t, "service.updated")).toBe("Service updated (legacy)");
    expect(eventLabel(t, "task.created")).toBe("Task created (legacy)");
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(["contact.archived", "unknown", "acme.widget.synced", "record", "Common", ""])(
    "falls back to the raw name for %j without reporting a missing message",
    (event) => {
      const { onError, t } = translator("en");

      expect(eventLabel(t, event)).toBe(event);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it.each(Object.keys(LOCALES) as Array<keyof typeof LOCALES>)("labels every legacy event in %s", (locale) => {
    const { onError, t } = translator(locale);

    for (const event of LEGACY_DOMAIN_EVENTS) {
      const label = eventLabel(t, event);
      expect(label, `${locale} ${event}`).not.toBe(event);
      expect(label.trim()).not.toBe("");
    }
    expect(onError).not.toHaveBeenCalled();
  });
});
