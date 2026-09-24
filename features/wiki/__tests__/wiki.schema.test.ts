import { describe, expect, it } from "vitest";

import { MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { WIKI_TITLE_MAX_LENGTH, WikiPageInputSchema } from "../wiki.schema";

describe("WikiPageInputSchema", () => {
  it("canonicalizes Markdown with the existing Notes parser and serializer", () => {
    const once = WikiPageInputSchema.parse({
      title: "  Sales playbook  ",
      markdown: "# Heading\n\n- first\n- second\n",
    });
    const twice = WikiPageInputSchema.parse(once);

    expect(once.title).toBe("Sales playbook");
    expect(once.markdown).toBe(twice.markdown);
    expect(once.markdown).toContain("# Heading");
    expect(once.markdown).toContain("- first");
  });

  it("uses the platform title and Notes length limits", () => {
    expect(
      WikiPageInputSchema.safeParse({
        title: "x".repeat(WIKI_TITLE_MAX_LENGTH),
        markdown: "",
      }).success,
    ).toBe(true);
    expect(
      WikiPageInputSchema.safeParse({
        title: "x".repeat(WIKI_TITLE_MAX_LENGTH + 1),
        markdown: "",
      }).success,
    ).toBe(false);

    const result = WikiPageInputSchema.safeParse({
      title: "Too long",
      markdown: "x".repeat(MAX_NOTES_LENGTH + 1),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "custom",
            params: { error: CustomErrorCode.notesExceedsMaxLength },
            path: ["markdown"],
          }),
        ]),
      );
    }

    expect(
      WikiPageInputSchema.safeParse({
        title: "Too much raw Markdown",
        markdown: " ".repeat(MAX_NOTES_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("trims titles and rejects blank ones", () => {
    expect(WikiPageInputSchema.parse({ title: " Voice ", markdown: "Body" }).title).toBe("Voice");
    expect(WikiPageInputSchema.safeParse({ title: "   ", markdown: "Body" }).success).toBe(false);
  });
});
