import type { z } from "zod";

import { Node } from "@tiptap/pm/model";

import { parseMarkdownToJSON } from "@/components/x-editor/x-editor.utils";
import { editorSchema } from "@/components/x-editor/x-editor-extensions";
import { CustomErrorCode } from "@/core/validation/validation.types";

const MAX_JSON_SIZE = 262_144;
const MAX_NOTES_LENGTH = 65_535;

function detectNotesFormat(input: string | object): "json" | "markdown" {
  if (typeof input === "object") return "json";

  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object" && parsed.type === "doc") return "json";
  } catch {}

  return "markdown";
}

export function validateNotes(
  notes: string | object | null | undefined,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
): object | null | undefined {
  if (notes === undefined) return undefined;
  if (notes === null) return null;

  try {
    const format = detectNotesFormat(notes);

    if (format === "markdown") {
      const markdown = notes as string;
      if (markdown.trim() === "") return null;
      if (markdown.length > MAX_NOTES_LENGTH) throw new Error(CustomErrorCode.notesExceedsMaxLength);

      return parseMarkdownToJSON(markdown);
    } else {
      const parsed = typeof notes === "string" ? JSON.parse(notes) : notes;

      try {
        Node.fromJSON(editorSchema, parsed);
      } catch {
        throw new Error(CustomErrorCode.notesInvalidFormat);
      }

      const jsonString = JSON.stringify(parsed);
      if (jsonString.length > MAX_JSON_SIZE) throw new Error(CustomErrorCode.notesExceedsMaxLength);

      return parsed;
    }
  } catch (error) {
    console.error(error);

    const errorCode =
      error instanceof Error && Object.values(CustomErrorCode).includes(error.message as CustomErrorCode)
        ? (error.message as CustomErrorCode)
        : CustomErrorCode.notesInvalidFormat;

    ctx.addIssue({
      code: "custom",
      params: { error: errorCode },
      path: basePath,
    });
  }
}
