import { z } from "zod";

import { recordFileTextFormat } from "@/features/record-file-index/record-file-text-format";

const TextFormatSchema = z.enum(["docx", "text", "markdown", "json"]);

export const RecordFilePreviewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), format: TextFormatSchema, text: z.string(), truncated: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal("sheets"),
      sheets: z.array(
        z
          .object({
            name: z.string(),
            rows: z.array(z.object({ number: z.number().int().positive(), cells: z.array(z.string()) }).strict()),
          })
          .strict(),
      ),
      truncated: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unavailable"),
      reason: z.enum(["unsupported", "tooLarge", "unreadable", "empty"]),
    })
    .strict(),
]);
export type RecordFilePreview = z.infer<typeof RecordFilePreviewSchema>;

export function recordFilePreviewFormat(mimeType: string, name: string) {
  const format = recordFileTextFormat(mimeType, name);
  return format && format !== "pdf" && format !== "html" ? format : null;
}
