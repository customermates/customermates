import { describe, expect, it } from "vitest";

import { terminologyLabelForSentence } from "../entity-terminology-label.utils";

describe("terminologyLabelForSentence", () => {
  it("uses lower-case renamed nouns in English sentence copy", () => {
    expect(terminologyLabelForSentence("Packages", "en")).toBe("packages");
  });

  it("preserves German noun capitalization", () => {
    expect(terminologyLabelForSentence("Leistungen", "de")).toBe("Leistungen");
  });
});
