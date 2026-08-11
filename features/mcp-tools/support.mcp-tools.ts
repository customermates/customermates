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
    "Open a support ticket with the Customermates team. " +
    "Use when the user has a question, bug report, or request that needs a human. " +
    "The Customermates team follows up by email and in the in-app chat. Returns the ticket number.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: RequestSupportSchema,
  execute: (params: z.infer<typeof RequestSupportSchema>) =>
    runInteractor(
      getCreateSupportTicketInteractor().invoke({ ...params, source: "mcp" }),
      (data) => `Support ticket #${data.number} opened. The Customermates team will follow up by email.`,
    ),
};
