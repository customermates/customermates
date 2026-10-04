import { describe, expect, it, vi } from "vitest";

import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => createMockUser()));

import { SendEmailSchema } from "../send-email.interactor";
import { SaveDraftSchema, SaveNewThreadDraftSchema, SaveReplyDraftBodySchema } from "../save-draft.interactor";

const connectedAccountId = "00000000-0000-4000-8000-000000000001";
const email = { connectedAccountId, subject: "Private review", body: "Hello" };

describe("email recipient group validation", () => {
  it.each([
    { to: [{ identifier: "to@example.test" }], cc: [], bcc: [] },
    { to: [], cc: ["copy@example.test"], bcc: [] },
    { to: [], cc: [], bcc: ["private@example.test"] },
    { to: [{ identifier: "to@example.test" }], cc: ["copy@example.test"], bcc: ["private@example.test"] },
  ])("accepts one or more recipients across To, Cc and Bcc: %j", (groups) => {
    expect(SendEmailSchema.parse({ ...email, ...groups })).toEqual({ ...email, ...groups });
    const { to, ...secondary } = groups;
    const draft = { ...email, recipients: to.map((person) => person.identifier), ...secondary };
    expect(SaveDraftSchema.parse(draft)).toEqual(draft);
    expect(SaveNewThreadDraftSchema.parse(draft)).toEqual(draft);
    expect(SaveReplyDraftBodySchema.parse({ recipients: draft.recipients, ...secondary, body: email.body })).toEqual({
      recipients: draft.recipients,
      ...secondary,
      body: email.body,
    });
  });

  it("rejects an entirely empty recipient set and still requires an explicit To array", () => {
    expect(SendEmailSchema.safeParse({ ...email, to: [] }).success).toBe(false);
    expect(SendEmailSchema.safeParse({ ...email, bcc: ["private@example.test"] }).success).toBe(false);
    expect(SaveDraftSchema.safeParse({ ...email, recipients: [] }).success).toBe(false);
    expect(SaveNewThreadDraftSchema.safeParse({ ...email, recipients: [] }).success).toBe(false);
    expect(SaveDraftSchema.safeParse({ ...email, bcc: ["private@example.test"] }).success).toBe(false);
  });

  it.each(["cc", "bcc"] as const)("rejects malformed or oversized %s recipient groups", (field) => {
    for (const recipients of [["invalid"], Array(101).fill("valid@example.test")]) {
      expect(SendEmailSchema.safeParse({ ...email, to: [], [field]: recipients }).success).toBe(false);
      expect(SaveNewThreadDraftSchema.safeParse({ ...email, recipients: [], [field]: recipients }).success).toBe(false);
    }
  });
});
