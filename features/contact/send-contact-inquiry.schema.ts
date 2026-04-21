import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const SendContactInquirySchema = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  company: z.string().trim().max(200).optional(),
  message: z.string().trim().min(10).max(5000),
});

export type SendContactInquiryData = Data<typeof SendContactInquirySchema>;
