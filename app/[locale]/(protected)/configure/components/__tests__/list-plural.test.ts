import { describe, expect, it } from "vitest";

import { suggestListPlural } from "../list-plural";

describe("list plural suggestions", () => {
  it.each([
    ["Deal", "en", "Deals"],
    ["Company", "en", "Companies"],
    ["Status", "en", "Statuses"],
    ["Line item", "en", "Line items"],
    ["Kontakt", "de", "Kontakte"],
    ["Firma", "de", "Firmen"],
    ["Rechnung", "de", "Rechnungen"],
    ["Aufgabe", "de", "Aufgaben"],
    ["Termin", "de", "Termine"],
    ["Cliente", "es", "Clientes"],
    ["Oportunidad", "es", "Oportunidades"],
    ["Contact", "fr", "Contacts"],
    ["Bureau", "fr", "Bureaux"],
    ["Contatto", "it", "Contatti"],
    ["Azienda", "it", "Aziende"],
    ["Projects", "en", "Projects"],
    ["Delegated records", "en", "Delegated records"],
    ["Process", "en", "Processes"],
    ["Firmen", "de", "Firmen"],
  ])("suggests %s → %s in %s", (name, locale, plural) => {
    expect(suggestListPlural(name, locale)).toBe(plural);
  });

  it("keeps names that do not end in a word", () => {
    expect(suggestListPlural("Q3 2026", "en")).toBe("Q3 2026");
  });

  it.each(["Projects 1a2b3c4d", "Projects abc12def", "Project Q3", "Kontakte 2026b"])(
    "keeps %s whose last word mixes letters and digits",
    (name) => {
      expect(suggestListPlural(name, name.startsWith("Kontakte") ? "de" : "en")).toBe(name);
    },
  );
});
