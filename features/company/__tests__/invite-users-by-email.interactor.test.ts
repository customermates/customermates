import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const request = vi.hoisted(() => ({ origin: "https://feat-inbox.customermates.com" }));

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    BASE_URL: "https://customermates-git-feat-inbox-customermates.vercel.app",
    AUTH_ALLOWED_HOSTS: ["customermates-git-feat-inbox-customermates.vercel.app", "*.customermates.com"],
  },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next/headers", () => ({
  headers: () => new Headers({ origin: request.origin }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));

import { InviteUsersByEmailInteractor } from "../invite-users-by-email.interactor";

function makeInteractor() {
  const emailService = { send: vi.fn().mockResolvedValue(undefined) };
  const tokenInteractor = { invoke: vi.fn().mockResolvedValue({ ok: true, data: { token: "invite-token" } }) };

  return {
    emailService,
    interactor: new InviteUsersByEmailInteractor(emailService as never, tokenInteractor as never),
  };
}

describe("InviteUsersByEmailInteractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    request.origin = "https://feat-inbox.customermates.com";
  });

  it("uses the validated vanity origin in invitation emails", async () => {
    const { emailService, interactor } = makeInteractor();

    await interactor.invoke({ emails: ["new.member@example.com"] });

    const message = emailService.send.mock.calls[0][0];
    expect(message.react.props.inviteLink).toBe("https://feat-inbox.customermates.com/invitation/invite-token");
  });

  it("falls back to the stable branch origin for an untrusted request origin", async () => {
    request.origin = "https://attacker.example";
    const { emailService, interactor } = makeInteractor();

    await interactor.invoke({ emails: ["new.member@example.com"] });

    const message = emailService.send.mock.calls[0][0];
    expect(message.react.props.inviteLink).toBe(
      "https://customermates-git-feat-inbox-customermates.vercel.app/invitation/invite-token",
    );
  });
});
