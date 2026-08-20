import { z } from "zod";

import { getCreateSupportTicketInteractor } from "@/core/di";

import { runInteractor } from "./utils";

export const RequestSupportSchema = z.object({
  subject: z.string().min(1).max(200).describe("Short summary of the problem or question."),
  body: z.string().min(1).max(10000).describe("The full question or problem description, including relevant context."),
});

export const requestSupportTool = {
  name: "request_support",
  title: "Request support",
  description:
    "Email a support request to the Customermates team. " +
    "Use when the user has a question, bug report, or request that needs a human. " +
    "Include all relevant context in the description. The Customermates team replies to the email address " +
    "on the user's account. Returns confirmation only after the email provider accepts the request.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: RequestSupportSchema,
  execute: (params: z.infer<typeof RequestSupportSchema>) =>
    runInteractor(
      getCreateSupportTicketInteractor().invoke(params),
      () =>
        "Support request email accepted for delivery. The Customermates team will reply to the email address on your account.",
    ),
};
