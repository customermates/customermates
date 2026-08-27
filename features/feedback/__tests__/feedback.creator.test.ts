import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { FeedbackCreator } from "../feedback.creator";

describe("FeedbackCreator", () => {
  it("uses the shared operator email and requires provider acceptance", async () => {
    const emailService = { send: vi.fn().mockResolvedValue(true) };
    const user = createMockUser({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    });

    await new FeedbackCreator(emailService as never).create({
      details: "Please help with an import failure.",
      subject: "Support request: Import failure",
      user,
    });

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: MOCK_ENV_MODULE.env.RESEND_OPERATOR_EMAIL,
        subject: "Support request: Import failure from Ada Lovelace",
        react: expect.objectContaining({
          props: expect.objectContaining({
            feedback: "Please help with an import failure.",
            subject: "Support request: Import failure",
            userEmail: "ada@example.com",
            userName: "Ada Lovelace",
          }),
        }),
      }),
    );
  });

  it("reports a delivery the provider refused, so support requests never fail silently", async () => {
    const emailService = { send: vi.fn().mockResolvedValue(false) };
    const user = createMockUser({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" });

    await expect(
      new FeedbackCreator(emailService as never).create({
        details: "Please help.",
        subject: "Support request",
        user,
      }),
    ).rejects.toThrow(/could not be delivered/);
  });

  it("propagates a rejected email so callers cannot report success", async () => {
    const emailService = {
      send: vi.fn().mockRejectedValue(new Error("Resend rejected the email")),
    };

    await expect(
      new FeedbackCreator(emailService as never).create({
        details: "Please help.",
        subject: "Support request: Need help",
        user: createMockUser(),
      }),
    ).rejects.toThrow("Resend rejected the email");
  });
});
