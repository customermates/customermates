import { z } from "zod";

export const AdConversionUploadDtoSchema = z.object({
  status: z.enum(["disabled", "incomplete", "nothingToSend", "authorizationFailed", "unavailable", "sent"]),
  mode: z.enum(["validate", "ingest"]).nullable(),
  missing: z.array(z.string()),
  eligibleCount: z.number().int().nonnegative(),
  alreadyReportedCount: z.number().int().nonnegative(),
  batches: z.array(
    z.object({
      rowCount: z.number().int().nonnegative(),
      result: z.enum(["submitted", "rejected", "ambiguous"]),
    }),
  ),
});

export type AdConversionUploadDto = z.infer<typeof AdConversionUploadDtoSchema>;
