import { describe, expect, it } from "vitest";

import { wikiSourceMissingFaqs, wikiSourceText } from "../wiki-source-text";
import { WIKI_SOURCE_MAX_CHARACTERS } from "../website-source-extract";

const pair = {
  question: "Does Service A support existing customer systems?",
  answer: "Service A connects to existing systems through the documented read-only adapter.",
};

describe("canonical stored website FAQ text", () => {
  it("preserves a JSON-LD answer even when the question already appears in the visible body", () => {
    const source = { text: `# Service A\n\n## ${pair.question}`, qaPairs: [pair] };

    expect(wikiSourceMissingFaqs(source)).toEqual([pair]);
    const text = wikiSourceText(source);
    expect(text).toContain(`## ${pair.question}\n\n${pair.answer}`);
  });

  it("adds hidden question and answer evidence once and is stable when applied again", () => {
    const first = wikiSourceText({ text: "# Service A\nVerified integration details.", qaPairs: [pair] });

    expect(first).toContain(pair.question);
    expect(first).toContain(pair.answer);
    expect(wikiSourceText({ text: first, qaPairs: [pair] })).toBe(first);
    expect(wikiSourceMissingFaqs({ text: first, qaPairs: [pair] })).toEqual([]);
  });

  it("does not repeat question and answer evidence already present in the body", () => {
    const text = `# Service A\n\n## ${pair.question}\n\n${pair.answer}`;

    expect(wikiSourceMissingFaqs({ text, qaPairs: [pair] })).toEqual([]);
    expect(wikiSourceText({ text, qaPairs: [pair] })).toBe(text);
  });

  it("retains the source text limit when many hidden FAQ answers are present, with complete pairs", () => {
    const qaPairs = Array.from({ length: 60 }, (_, index) => ({
      question: `Question ${index}: What does this offering support?`,
      answer: `Answer ${index}: ${"verified detail ".repeat(100)}End of answer ${index}.`,
    }));
    const text = wikiSourceText({ text: `# Service A\n${"prose ".repeat(6_000)}`, qaPairs });

    expect(text.length).toBeLessThanOrEqual(WIKI_SOURCE_MAX_CHARACTERS);
    expect(text).toContain("prose ".repeat(4_000));
    expect(text).toContain(qaPairs[0].answer);
    expect(wikiSourceText({ text, qaPairs })).toBe(text);
    for (const { question, answer } of qaPairs) if (text.includes(`## ${question}`)) expect(text).toContain(answer);
  });
});

const visible = {
  question: "Does the adapter work?",
  answer: "Only when the documented remote API supports the requested read-only integration.",
};
const hidden = {
  question: "Is new hardware required?",
  answer: "No additional hardware is required for this documented implementation.",
};

describe("canonical FAQ boundaries", () => {
  it("does not leave a partial Markdown heading when the visible FAQ uses a level-three heading", () => {
    const source = {
      text: `# Product\n\n### ${visible.question}\n\n${visible.answer}\n\nNext section`,
      qaPairs: [visible],
    };
    const text = wikiSourceText(source);
    expect(text).not.toMatch(/^#{1,6}$/mu);
    expect(text).toContain(visible.question);
    expect(text).toContain(visible.answer);
    expect(text).toContain("Next section");
    expect(wikiSourceText({ ...source, text })).toBe(text);
  });

  it("keeps already visible answers that would otherwise be truncated by newly reserved hidden FAQs", () => {
    const source = {
      text: `# Product\n\n${"verified prose ".repeat(2657)}\n\nQuestion: ${visible.question}\nAnswer: ${visible.answer}`,
      qaPairs: [visible, hidden],
    };
    expect(source.text.length).toBeLessThan(WIKI_SOURCE_MAX_CHARACTERS);
    const text = wikiSourceText(source);
    expect(text.length).toBeLessThanOrEqual(WIKI_SOURCE_MAX_CHARACTERS);
    for (const { question, answer } of source.qaPairs) {
      expect(text).toContain(question);
      expect(text).toContain(answer);
    }
    expect(wikiSourceText({ ...source, text })).toBe(text);
  });
});
