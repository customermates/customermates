import { Node } from "@tiptap/pm/model";

import { editorSchema } from "@/components/editor/editor-extensions";

export const MAX_RICH_TEXT_JSON_SIZE = 262_144;
export const MAX_RICH_TEXT_MARKDOWN_LENGTH = 65_535;

export function validateRichTextDocument(documentJson: string): object | null {
  let document: unknown;
  try {
    document = JSON.parse(documentJson);
  } catch {
    return null;
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) return null;
  try {
    Node.fromJSON(editorSchema, document);
  } catch {
    return null;
  }
  return JSON.stringify(document).length > MAX_RICH_TEXT_JSON_SIZE ? null : document;
}
