import { describe, expect, it } from "vitest";

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import esMessages from "@/i18n/locales/es.json";
import frMessages from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";

import { roleDisplayName } from "../role-display-name";

const SYSTEM_NAMES = {
  de: deMessages.RoleModal.systemName,
  en: enMessages.RoleModal.systemName,
  es: esMessages.RoleModal.systemName,
  fr: frMessages.RoleModal.systemName,
  it: itMessages.RoleModal.systemName,
} satisfies Record<AppLocale, string>;

describe("roleDisplayName", () => {
  it.each(APP_LOCALES)("localizes the system role for %s", (locale) => {
    expect(roleDisplayName({ isSystemRole: true, name: "Admin" }, SYSTEM_NAMES[locale])).toBe(SYSTEM_NAMES[locale]);
  });

  it("preserves a custom role even when its literal name is Admin", () => {
    expect(roleDisplayName({ isSystemRole: false, name: "Admin" }, "Administrateur")).toBe("Admin");
  });
});
