import type { z } from "zod";

import { describe, expect, it, vi } from "vitest";

import { validateNotes } from "../validate-notes";

function context() {
  const addIssue = vi.fn();
  return {
    addIssue,
    value: { addIssue } as unknown as z.RefinementCtx,
  };
}

describe("validateNotes", () => {
  it("accepts Heading 3 in Markdown and canonical editor JSON", () => {
    const markdownContext = context();
    const markdown = validateNotes("### Implementation details", markdownContext.value, ["notes"]);

    expect(markdownContext.addIssue).not.toHaveBeenCalled();
    expect(markdown).toMatchObject({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Implementation details" }],
        },
      ],
    });

    const jsonContext = context();
    expect(validateNotes(markdown as object, jsonContext.value, ["notes"])).toEqual(markdown);
    expect(jsonContext.addIssue).not.toHaveBeenCalled();
  });
});
