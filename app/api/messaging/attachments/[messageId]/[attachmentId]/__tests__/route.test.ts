import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const provider = vi.hoisted(() => ({ download: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("@/core/di", async () => {
  const { GetMessageAttachmentInteractor } = await import("@/ee/messaging/inbox/get-message-attachment.interactor");
  const interactor = new GetMessageAttachmentInteractor(
    {
      findAttachmentForMessageOrThrow: () =>
        Promise.resolve({
          unipileAccountId: "account",
          provider: "GMAIL",
          unipileThreadId: "thread",
          unipileMessageId: "message",
          fileName: "offer.pdf",
          mime: "application/pdf",
          size: 10,
        }),
    } as never,
    { downloadAttachment: provider.download } as never,
    { require: () => Promise.resolve(null) } as never,
  );
  return { getGetMessageAttachmentInteractor: () => interactor };
});

import { runWithTenant } from "@/core/decorators/tenant-context";
import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { UnipileRequestError } from "@/ee/messaging/unipile-request-error";

import { GET } from "../route";

const MESSAGE_ID = "00000000-0000-4000-8000-000000000001";
const request = () => new NextRequest(`http://localhost/api/messaging/attachments/${MESSAGE_ID}/a`);
const params = { params: Promise.resolve({ messageId: MESSAGE_ID, attachmentId: "a" }) };
const get = () => runWithTenant(createMockUser(), () => GET(request(), params));

describe("attachment download provider failures", () => {
  it.each([
    ["a disconnected channel", new UnipileRequestError(401, "provider/invalid_credentials", ""), 409, "conflict"],
    ["a restricted channel", new UnipileRequestError(403, "api/account_restricted", ""), 409, "conflict"],
    ["a timeout", new UnipileRequestError(0, null, ""), 422, "unavailable"],
    ["a provider refusal", new UnipileRequestError(422, "provider/unprocessable_entity", ""), 422, "unavailable"],
    ["a provider outage", new UnipileRequestError(503, null, ""), 422, "unavailable"],
    ["a missing attachment", new UnipileRequestError(404, "errors/resource_not_found", ""), 404, "not_found"],
    ["a rate limit", new UnipileRequestError(429, null, ""), 429, "rate_limit"],
  ])("answers %s with status %s and a structured failure body", async (_label, error, status, kind) => {
    provider.download.mockRejectedValueOnce(error);

    const response = await get();

    expect(response.status).toBe(status);
    expect(StructuredErrorResponseSchema.parse(await response.json()).error.kind).toBe(kind);
    if (status === 429) expect(response.headers.get("retry-after")).toBe("30");
  });

  it("streams the attachment with its stored file name", async () => {
    provider.download.mockResolvedValueOnce({ body: new Blob(["pdf"]).stream(), contentType: null });

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="offer.pdf"');
  });
});
