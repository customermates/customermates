import { z } from "zod";

export const AccountConnectionDetailsSchema = z.object({
  status: z.string().nullable(),
  products: z.record(z.string(), z.string()),
  reason: z.string().nullable(),
});

export type AccountConnectionDetails = z.infer<typeof AccountConnectionDetailsSchema>;
