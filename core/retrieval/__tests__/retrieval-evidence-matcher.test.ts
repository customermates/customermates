import { describe, expect, it } from "vitest";

import { REGISTERED_LOCALES } from "@/i18n/locale-registry";
import { createRetrievalEvidenceMatcher } from "../retrieval-evidence-matcher";

describe("canonical linguistic evidence matching", () => {
  it.each(REGISTERED_LOCALES)("uses the registered %s analyzer without replacing identifiers", (locale) => {
    const match = createRetrievalEvidenceMatcher("manage_record_links", locale);
    expect(match.matches("Call manage_record_links to replace links.")).toEqual([true]);
    expect(match.matches("Call manage_record_links_extra instead.")).toEqual([false]);
  });

  it("retains all surface locations for an inflected word including Unicode prefixes", () => {
    const text = "😀 Straße: Sortieren ist möglich. Sortieren ist optional.";
    const match = createRetrievalEvidenceMatcher("sortiere nach", "de");
    expect(match.units.map((unit) => unit.text)).toEqual(["sortiere"]);
    expect(match.matches(text)).toEqual([true]);
    expect(match.offsets(text)).toEqual([[text.indexOf("Sortieren"), text.lastIndexOf("Sortieren")]]);
  });

  it("counts one inflected query unit once", () => {
    const match = createRetrievalEvidenceMatcher("permissions", "en");
    expect(match.matches("Permission and permissions concern access.")).toEqual([true]);
    expect(match.units).toHaveLength(1);
  });

  it("matches registered-language inflections when locale is unavailable", () => {
    const match = createRetrievalEvidenceMatcher("sortiere nach");
    expect(match.matches("Sortieren nach einer Spalte.")[0]).toBe(true);
  });

  it("does not stem ordinary query words inside joined identifiers", () => {
    const match = createRetrievalEvidenceMatcher("permission now", "en");
    expect(match.matches("_permissions permissions_extra permissions2")[0]).toBe(false);
    expect(match.matches("permissions are configured here")[0]).toBe(true);
  });

  it("keeps quoted phrases literal rather than combining distant inflections", () => {
    const match = createRetrievalEvidenceMatcher('"permission rules"', "en");
    expect(match.matches("permission rules apply here")).toEqual([true]);
    expect(match.matches("permissions elsewhere have different rules")).toEqual([false]);
  });

  it("retains the canonical unfinished prefix and script-substring alternatives", () => {
    expect(createRetrievalEvidenceMatcher("onboard", "en").matches("An onboarding process.")).toEqual([true]);
    expect(createRetrievalEvidenceMatcher("退款申请", "en").matches("公共退款申请政策")).toEqual([true, true, true]);
  });

  it("does not match can inside cancellation or mate inside material", () => {
    expect(createRetrievalEvidenceMatcher("can use").matches("Cancellation is irreversible.")[0]).toBe(false);
    expect(createRetrievalEvidenceMatcher("mate now", "en").matches("Material is listed here.")[0]).toBe(false);
  });

  it("bounds repeated surface locations without losing the earliest evidence", () => {
    const text = "Permission ".repeat(100);
    const locations = createRetrievalEvidenceMatcher("permissions", "en").offsets(text)[0];
    expect(locations).toHaveLength(32);
    expect(locations[0]).toBe(0);
    expect(locations[31]).toBe("Permission ".length * 31);
  });

  it("retains an early inflected surface before many later literal matches", () => {
    const text = "Permission is denied. " + "permissions ".repeat(40);
    const locations = createRetrievalEvidenceMatcher("permissions", "en").offsets(text)[0];
    expect(locations).toHaveLength(32);
    expect(locations[0]).toBe(0);
    expect(locations).toEqual([...locations].sort((left, right) => left - right));
  });
});
