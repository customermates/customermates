import { describe, expect, it } from "vitest";

import { scrubPrismaArgumentsFromMessage } from "../scrub-prisma-arguments";

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
});
