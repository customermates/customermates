import { describe, expect, it } from "vitest";

import { fold, slugifyHeading } from "../search-text";

describe("accent folding", () => {
  it("strips diacritics after canonical decomposition and spells out the sharp s", () => {
    expect(fold("Übergrößen")).toBe("ubergrossen");
    expect(fold("Éléments envoyés")).toBe("elements envoyes");
    expect(fold("naïve CAFÉ")).toBe("naive cafe");
    expect(fold("Straße")).toBe(fold("STRASSE"));
  });

  it("keeps heading anchors stable", () => {
    expect(slugifyHeading("Wer darf die Währung ändern?")).toBe("wer-darf-die-wahrung-andern");
    expect(slugifyHeading("How do I verify the signature?")).toBe("how-do-i-verify-the-signature");
  });
});
