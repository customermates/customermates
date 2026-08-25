import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactElement } from "react";

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "production" as "production" | "test",
  RESEND_API_KEY: "test-key" as string | undefined,
  RESEND_OPERATOR_EMAIL: "mail@customermates.com",
}));
const resendSend = vi.hoisted(() => vi.fn());
const resendConstructor = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };

    constructor(apiKey: string) {
      resendConstructor(apiKey);
    }
  },
}));

import { EmailService } from "../email.service";

const email: Parameters<EmailService["send"]>[0] = {
  to: "recipient@example.com",
  subject: "Legal update",
  react: createElement("div", null, "Legal update") as unknown as ReactElement<Record<string, unknown>>,
};

describe("EmailService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.NODE_ENV = "production";
    mockEnv.RESEND_API_KEY = "test-key";
  });

  it("returns true when the provider accepts the email without exposing provider metadata", async () => {
    resendSend.mockResolvedValue({ data: { id: "message-123" }, error: null });

    await expect(new EmailService().send(email)).resolves.toBe(true);
    expect(resendConstructor).toHaveBeenCalledWith("test-key");
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Customermates <mail@customermates.com>",
        react: email.react,
        subject: email.subject,
        to: email.to,
      }),
    );
  });

  it("returns false when the provider rejects the email", async () => {
    resendSend.mockResolvedValue({
      data: null,
      error: { message: "provider rejected request" },
    });

    await expect(new EmailService().send(email)).resolves.toBe(false);
  });

  it("does not require a provider message ID", async () => {
    resendSend.mockResolvedValue({ data: {}, error: null });

    await expect(new EmailService().send(email)).resolves.toBe(true);
  });

  it("returns simulated acceptance locally without calling Resend", async () => {
    mockEnv.NODE_ENV = "test";
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(new EmailService().send(email)).resolves.toBe(true);
    expect(resendSend).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("fails closed in production when the Resend API key is absent", async () => {
    mockEnv.RESEND_API_KEY = undefined;

    await expect(new EmailService().send(email)).rejects.toThrow("RESEND_API_KEY is not configured");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("preserves unexpected provider exceptions", async () => {
    const failure = new TypeError("email rendering failed");
    resendSend.mockRejectedValue(failure);

    await expect(new EmailService().send(email)).rejects.toBe(failure);
  });
});
