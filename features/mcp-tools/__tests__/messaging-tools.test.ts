import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({
  createAuthLink: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getCreateAuthLinkInteractor: () => ({ invoke: spies.createAuthLink }),
}));

import { connectMessagingAccountTool } from "../messaging.mcp-tools";

function run(args: Record<string, unknown>) {
  return connectMessagingAccountTool.execute(connectMessagingAccountTool.inputSchema.parse(args));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("connect_messaging_account", () => {
  it("returns the hosted-auth url for the requested channel", async () => {
    spies.createAuthLink.mockResolvedValue({ redirect: "https://auth.example.com/link-abc" });
    const result = await run({ channel: "whatsapp" });
    expect(spies.createAuthLink).toHaveBeenCalledWith({ channel: "whatsapp" });
    expect(result).toContain("https://auth.example.com/link-abc");
  });

  it("surfaces an interactor gate failure as a clean validation error", async () => {
    const parsed = z.object({ channel: z.string() }).safeParse({});
    const error = parsed.success ? undefined : parsed.error;
    spies.createAuthLink.mockResolvedValue({ ok: false, error });
    const result = await run({ channel: "google" });
    expect(result).toContain("Validation error:");
  });

  it("rejects an unknown channel at the schema boundary", () => {
    expect(() => connectMessagingAccountTool.inputSchema.parse({ channel: "myspace" })).toThrow();
    expect(spies.createAuthLink).not.toHaveBeenCalled();
  });
});
