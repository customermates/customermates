import { describe, expect, it } from "vitest";

import { searchDocsRaw } from "@/features/mcp-tools/docs.mcp-tools";

import { GOLDEN_QUESTIONS, type GoldenQuestion } from "./fixtures/docs-retrieval-golden";

const PROBE_COUNT = 16;
const EN_FLOOR = 0.9;
const DE_FLOOR = 0.85;

function outcome(question: GoldenQuestion) {
  const { results } = searchDocsRaw(question.query, question.locale, "docs");
  const best = results[0];
  const slugOk = best?.slug === question.slug || (question.alternatives ?? []).includes(best?.slug ?? "");
  const headings = question.heading === undefined ? [] : [question.heading].flat();
  const headingOk =
    headings.length === 0 ||
    best?.slug !== question.slug ||
    headings.some((heading) => (best?.section ?? "").toLocaleLowerCase().includes(heading.toLocaleLowerCase()));
  return {
    ok: slugOk && headingOk,
    detail: `${question.locale} "${question.query}" -> ${best ? `${best.slug} > ${best.section}` : "nothing"} (expected ${question.slug}${question.heading ? ` > *${question.heading}*` : ""})`,
  };
}

const ANSWERABLE = GOLDEN_QUESTIONS.filter((question) => !question.requiresDocsRewrite);

describe("docs retrieval golden set", () => {
  it("lists the questions the current docs cannot answer, for the docs rewrite to close", () => {
    const pending = GOLDEN_QUESTIONS.filter((question) => question.requiresDocsRewrite).map((question) => question.query);
    expect(pending).toEqual([
      "what can a routine do without approval",
      "import contacts from excel",
      "task due date",
      "weighted pipeline value",
      "Was darf eine Routine ohne Freigabe",
      "Kontakte aus Excel importieren",
      "Aufgabe Fälligkeitsdatum",
    ]);
  });

  it("returns the right page and section for every probe question from the audit", () => {
    const misses = ANSWERABLE.slice(0, PROBE_COUNT)
      .map(outcome)
      .filter((result) => !result.ok)
      .map((result) => result.detail);
    expect(misses, misses.join("\n")).toEqual([]);
  });

  for (const [locale, floor] of [
    ["en", EN_FLOOR],
    ["de", DE_FLOOR],
  ] as const) {
    it(`answers at least ${Math.round(floor * 100)}% of the ${locale} questions with the right page and section`, () => {
      const questions = ANSWERABLE.filter((question) => question.locale === locale);
      const results = questions.map(outcome);
      const misses = results.filter((result) => !result.ok).map((result) => result.detail);
      const accuracy = (questions.length - misses.length) / questions.length;
      expect(questions.length).toBeGreaterThanOrEqual(locale === "en" ? 60 : 30);
      expect(accuracy, `${locale} top-1 accuracy ${accuracy.toFixed(3)}\n${misses.join("\n")}`).toBeGreaterThanOrEqual(floor);
    });
  }
});
