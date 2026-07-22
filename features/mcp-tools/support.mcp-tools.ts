import { z } from "zod";

import { getCreateSupportTicketInteractor, getListSupportTicketsInteractor } from "@/core/di";

import { encodeToToon, runInteractor } from "./utils";

const RequestSupportSchema = z.object({
  subject: z.string().min(1).max(200).describe("Short summary of the problem or question."),
  body: z.string().min(1).max(10000).describe("The full question or problem description, including relevant context."),
});

export const requestSupportTool = {
  name: "request_support",
  title: "Request support",
  description:
    "Open a support ticket with the Customermates team. " +
    "Use when the user has a question, bug report, or request that needs a human. " +
    "Benjamin follows up by email and in the in-app chat. Returns the ticket number.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: RequestSupportSchema,
  execute: (params: z.infer<typeof RequestSupportSchema>) =>
    runInteractor(
      getCreateSupportTicketInteractor().invoke({ ...params, source: "mcp" }),
      (data) => `Support ticket #${data.number} opened. Benjamin will follow up by email.`,
    ),
};

export const listSupportTicketsTool = {
  name: "list_support_tickets",
  title: "List support tickets",
  description: "List the current user's support tickets with number, subject, status, and dates. Newest first.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: () =>
    runInteractor(getListSupportTicketsInteractor().invoke(), (data) =>
      encodeToToon({
        items: data.map((ticket) => ({
          number: ticket.number,
          subject: ticket.subject,
          status: ticket.status,
          source: ticket.source,
          createdAt: ticket.createdAt.toISOString(),
          resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
        })),
      }),
    ),
};
