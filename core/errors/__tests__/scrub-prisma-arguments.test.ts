import { describe, expect, it } from "vitest";

import { scrubPrismaArgumentsFromEvent, scrubPrismaArgumentsFromMessage } from "../scrub-prisma-arguments";

const VALIDATION_MESSAGE = `
Invalid \`prisma.messagingThread.upsert()\` invocation in
/app/ee/messaging/ingest/messaging-ingest.repo.ts:120:29

→ 120     await tx.messagingThread.upsert({
          create: {
            name: "SYNTH_CHAT_NAME",
            lastMessagePreview: "SYNTH_PREVIEW",
            lastMessageAt: new Date("Invalid Date")
                           ~~~~~~~~~~~~~~~~~~~~~~~~
          }
        })

Invalid value for argument \`lastMessageAt\`: Provided Date object is invalid. Expected Date.`;

const MINIMAL_MESSAGE = `
Invalid \`prisma.messagingMessage.create()\` invocation:

{
  data: {
    bodyText: "SYNTH_BODY"
  }
}

Argument \`unipileMessageId\` is missing.`;

describe("scrubbing Prisma query arguments from error reports", () => {
  it("keeps the model, operation and argument names and drops every value", () => {
    const scrubbed = scrubPrismaArgumentsFromMessage(VALIDATION_MESSAGE);

    expect(scrubbed).toBe("Invalid prisma.messagingThread.upsert() invocation: arguments lastMessageAt");
    expect(scrubbed).not.toMatch(/SYNTH_/);
  });

  it("scrubs the minimal error format", () => {
    expect(scrubPrismaArgumentsFromMessage(MINIMAL_MESSAGE)).toBe(
      "Invalid prisma.messagingMessage.create() invocation: arguments unipileMessageId",
    );
  });

  it("leaves other messages untouched", () => {
    expect(scrubPrismaArgumentsFromMessage("Unipile request timed out")).toBe("Unipile request timed out");
  });

  it("scrubs every exception and breadcrumb on a reported event", () => {
    const event = {
      exception: { values: [{ type: "PrismaClientValidationError", value: VALIDATION_MESSAGE }, { value: "cause" }] },
      breadcrumbs: [{ message: MINIMAL_MESSAGE }, {}],
    };

    const scrubbed = scrubPrismaArgumentsFromEvent(event);

    expect(JSON.stringify(scrubbed)).not.toMatch(/SYNTH_/);
    expect(scrubbed.exception.values[0].value).toBe(
      "Invalid prisma.messagingThread.upsert() invocation: arguments lastMessageAt",
    );
    expect(scrubbed.exception.values[1].value).toBe("cause");
  });

  it("scrubs logged values, messages and extra data that carry a Prisma error", () => {
    const error = Object.assign(new Error(VALIDATION_MESSAGE), { name: "PrismaClientValidationError" });
    const event = {
      message: VALIDATION_MESSAGE,
      logentry: { message: VALIDATION_MESSAGE, params: [error] },
      breadcrumbs: [
        {
          category: "console",
          data: {
            arguments: ["chat backfill failed", { message: VALIDATION_MESSAGE, stack: VALIDATION_MESSAGE }, error],
          },
        },
      ],
      extra: { error: { message: MINIMAL_MESSAGE } },
      contexts: { cause: { detail: MINIMAL_MESSAGE } },
    };

    const scrubbed = scrubPrismaArgumentsFromEvent(event);

    expect(JSON.stringify(scrubbed)).not.toMatch(/SYNTH_/);
    expect(scrubbed.breadcrumbs[0].data.arguments[0]).toBe("chat backfill failed");
    expect(scrubbed.breadcrumbs[0].data.arguments[2]).toBe(
      "PrismaClientValidationError: Invalid prisma.messagingThread.upsert() invocation: arguments lastMessageAt",
    );
  });
});
