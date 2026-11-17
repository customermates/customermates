import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { MAX_RICH_TEXT_MARKDOWN_LENGTH } from "@/core/validation/rich-text-document";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { wikiAnchoredSections } from "./wiki-markdown-sections";

export const WIKI_PAGE_EDITS_MAX = 20;

const SECTION_PLACEMENTS = ["replace", "before", "after"] as const;
const PAGE_PLACEMENTS = ["start", "end"] as const;

export const WikiPageEditSchema = z
  .object({
    find: z.string().min(1).max(MAX_RICH_TEXT_MARKDOWN_LENGTH).optional(),
    replace: z.string().max(MAX_RICH_TEXT_MARKDOWN_LENGTH).optional(),
    anchor: z.string().trim().min(1).max(200).optional(),
    markdown: z.string().max(MAX_RICH_TEXT_MARKDOWN_LENGTH).optional(),
    placement: z.enum([...SECTION_PLACEMENTS, ...PAGE_PLACEMENTS]).optional(),
  })
  .strict()
  .superRefine((edit, ctx) => {
    const text = edit.find !== undefined || edit.replace !== undefined;
    const valid = text
      ? edit.find !== undefined &&
        edit.replace !== undefined &&
        edit.markdown === undefined &&
        edit.placement === undefined
      : edit.markdown !== undefined &&
        (edit.anchor !== undefined
          ? edit.placement === undefined || (SECTION_PLACEMENTS as readonly string[]).includes(edit.placement)
          : edit.placement === undefined || (PAGE_PLACEMENTS as readonly string[]).includes(edit.placement));
    if (!valid) ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.wikiEditInvalid } });
  });
export type WikiPageEdit = Data<typeof WikiPageEditSchema>;

export type WikiPageEditFailure = {
  ok: false;
  index: number;
  error:
    | CustomErrorCode.wikiEditInvalid
    | CustomErrorCode.wikiEditSectionNotFound
    | CustomErrorCode.wikiEditTextAmbiguous
    | CustomErrorCode.wikiEditTextNotFound;
};

function sectionSpan(markdown: string, anchor: string): { offset: number; end: number } | null {
  const section = wikiAnchoredSections(markdown).find((candidate) => candidate.anchor === anchor);
  return section ? { offset: section.offset, end: section.end } : null;
}

function occurrences(text: string, needle: string): number {
  let count = 0;
  for (let index = text.indexOf(needle); index >= 0; index = text.indexOf(needle, index + needle.length)) count += 1;
  return count;
}

function splice(markdown: string, start: number, end: number, block: string): string {
  const before = markdown.slice(0, start).replace(/\s+$/u, "");
  const after = markdown.slice(end).replace(/^\n+/u, "");
  return [before, block.replace(/^\n+|\s+$/gu, ""), after].filter((part) => part !== "").join("\n\n");
}

export function applyWikiPageEdits(
  source: string,
  edits: readonly WikiPageEdit[],
): { ok: true; markdown: string } | WikiPageEditFailure {
  let markdown = source;
  for (const [index, edit] of edits.entries()) {
    const span = edit.anchor === undefined ? null : sectionSpan(markdown, edit.anchor);
    if (edit.anchor !== undefined && !span) return { ok: false, index, error: CustomErrorCode.wikiEditSectionNotFound };

    if (edit.find !== undefined) {
      if (edit.replace === undefined) return { ok: false, index, error: CustomErrorCode.wikiEditInvalid };
      const from = span?.offset ?? 0;
      const scope = markdown.slice(from, span?.end ?? markdown.length);
      const found = occurrences(scope, edit.find);
      if (found === 0) return { ok: false, index, error: CustomErrorCode.wikiEditTextNotFound };
      if (found > 1) return { ok: false, index, error: CustomErrorCode.wikiEditTextAmbiguous };
      const at = from + scope.indexOf(edit.find);
      markdown = markdown.slice(0, at) + edit.replace + markdown.slice(at + edit.find.length);
      continue;
    }

    if (edit.markdown === undefined) return { ok: false, index, error: CustomErrorCode.wikiEditInvalid };
    if (span) {
      const placement = edit.placement ?? "replace";
      if (placement === "replace") markdown = splice(markdown, span.offset, span.end, edit.markdown);
      else if (placement === "before") markdown = splice(markdown, span.offset, span.offset, edit.markdown);
      else if (placement === "after") markdown = splice(markdown, span.end, span.end, edit.markdown);
      else return { ok: false, index, error: CustomErrorCode.wikiEditInvalid };
      continue;
    }
    if (edit.placement === "start") markdown = splice(markdown, 0, 0, edit.markdown);
    else if (edit.placement === undefined || edit.placement === "end")
      markdown = splice(markdown, markdown.length, markdown.length, edit.markdown);
    else return { ok: false, index, error: CustomErrorCode.wikiEditInvalid };
  }
  return { ok: true, markdown };
}
