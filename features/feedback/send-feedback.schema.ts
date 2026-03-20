import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export enum FeedbackType {
  general = "general",
}

export const SendFeedbackSchema = z.object({
  feedback: z.string().min(1),
  type: z.enum(FeedbackType),
});

export type SendFeedbackData = Data<typeof SendFeedbackSchema>;
