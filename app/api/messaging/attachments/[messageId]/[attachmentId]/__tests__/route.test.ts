import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { UnipileRequestError } from "@/ee/messaging/unipile-request-error";

const attachment = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/core/di", () => ({ getGetMessageAttachmentInteractor: () => attachment }));

import { GET } from "../route";

const request = () => new NextRequest("http://localhost/api/messaging/attachments/m/a");
const params = { params: Promise.resolve({ messageId: "m", attachmentId: "a" }) };

describe("attachment download provider failures", () => {
  it.each([
    ["a disconnected channel", new UnipileRequestError(401, "provider/invalid_credentials", ""), 409],
    ["a restricted channel", new UnipileRequestError(403, "api/account_restricted", ""), 409],
    ["a timeout", new UnipileRequestError(0, null, ""), 504],
    ["a provider refusal", new UnipileRequestError(422, "provider/unprocessable_entity", ""), 422],
    ["a provider outage", new UnipileRequestError(503, null, ""), 502],
    ["a missing attachment", new UnipileRequestError(404, "errors/resource_not_found", ""), 404],
  ])("answers %s with status %s", async (_label, error, status) => {
    attachment.invoke.mockRejectedValueOnce(error);

    const response = await GET(request(), params);

    expect(response.status).toBe(status);
  });
});
