import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => ({
  env: { ...MOCK_ENV_MODULE.env, UNIPILE_API_KEY: "test-key" },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { MessagingService } from "../../messaging.service";
import { composeEmailBodies } from "../email-signature";
import { defaultEmailSettings } from "../../email-settings";

function stubSuccessfulSend() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          object: "EmailSent",
          id: "email-1",
          message_id: "message-1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ),
  );
}

function firstRequest(): Request {
  const [input, init] = vi.mocked(fetch).mock.calls[0];

  return input instanceof Request ? input : new Request(input, init);
}

afterEach(() => vi.unstubAllGlobals());

describe("HTML-only email body fallbacks", () => {
  it.each(['<img src="https://example.com/logo.png" alt="">', "<span></span>"])(
    "always emits a nonempty plain-text alternative for %s",
    (html) => {
      const bodies = composeEmailBodies(html, null, defaultEmailSettings(), "html");

      expect(bodies.html).toBe(html);
      expect(bodies.plainText.trim().length).toBeGreaterThan(0);
    },
  );

  it("passes the fallback through the MessagingService boundary as plain_text", async () => {
    stubSuccessfulSend();
    const bodies = composeEmailBodies(
      '<img src="https://example.com/logo.png" alt="">',
      null,
      defaultEmailSettings(),
      "html",
    );

    const result = await new MessagingService().sendEmail({
      accountId: "account-1",
      to: [{ email: "recipient@example.com" }],
      subject: "Image only",
      body: bodies.html,
      plainText: bodies.plainText,
    });

    expect(result).toEqual({
      ok: true,
      data: { id: "email-1", messageId: "message-1" },
    });
    const requestBody = (await firstRequest().clone().json()) as Record<string, unknown>;
    expect(requestBody.html).toBe(bodies.html);
    expect(requestBody.plain_text).toBe(bodies.plainText);
    expect(String(requestBody.plain_text).trim().length).toBeGreaterThan(0);
  });
});
