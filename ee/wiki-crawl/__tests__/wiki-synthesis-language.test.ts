import { describe, expect, it } from "vitest";

import { wikiSynthesisQuotedLanguageConflicts } from "../wiki-synthesis-language";

const german =
  "Kunden können sich bei Fragen zu ihrem Vertrag an unseren Kundendienst wenden. Wir erklären die verfügbaren Möglichkeiten und informieren über die nächsten Schritte. Eine Rückerstattung kann innerhalb von dreißig Tagen nach dem Kauf des jährlichen Abonnements beantragt werden.";
const english =
  "Customers can contact our support team whenever they have questions about their subscription. We explain the available options and provide clear information about the next steps.";

describe("authored synthesis quotation language", () => {
  it.each([
    ['"', '"'],
    ["“", "”"],
    ["„", "“"],
  ])("checks an individual %s quotation before aggregation can dilute it", (opening, closing) => {
    const content = `${opening}${german}${closing}\n\n${Array.from({ length: 4 }, () => `"${english}"`).join("\n\n")}`;
    expect(wikiSynthesisQuotedLanguageConflicts([content], "en")).toBe(true);
  });

  it("does not classify a long list of proper product and technical names as foreign prose", () => {
    const names = [
      "SAP Analytics Cloud",
      "Microsoft Dynamics 365",
      "Minimum Viable Product",
      "Amazon Web Services",
      "Google Cloud Platform",
      "Visual Studio Code",
      "SAP Business Planning Consolidation",
      "SQL Server Integration Services",
    ];
    expect(names.join(" ").length).toBeGreaterThan(120);
    expect(wikiSynthesisQuotedLanguageConflicts([names.map((name) => `"${name}"`).join(", ")], "de")).toBe(false);
  });

  it("handles bounded unmatched quotation delimiters without a timeout override", () => {
    expect(wikiSynthesisQuotedLanguageConflicts(["“word".repeat(1_600)], "en")).toBe(false);
  });
});
