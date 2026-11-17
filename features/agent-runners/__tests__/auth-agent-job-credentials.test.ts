import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { AuthAgentJobCredentials, agentJobKeyName } from "../auth-agent-job-credentials";

import { COMPANY_ID, JOB_ID, OTHER_COMPANY_ID, OWNER_ID } from "./agent-runner-fixtures";

const EXPIRES_AT = new Date("2026-11-17T09:15:00.000Z");

function setup(
  owner: { email: string; companyId: string } | null = { email: "Owner@Example.test", companyId: COMPANY_ID },
) {
  const auth = {
    createExpiringApiKey: vi.fn().mockResolvedValue({ id: "key-1", key: "secret-key" }),
    revokeApiKeysNamed: vi.fn().mockResolvedValue(1),
  };
  const users = {
    getActiveUserByIdOrThrow: vi.fn((id: string) =>
      owner ? Promise.resolve({ id, ...owner }) : Promise.reject(new Error("user not found")),
    ),
  };
  const credentials = new AuthAgentJobCredentials(auth, users as never, "https://app.example.test");
  return { auth, users, credentials };
}

describe("AuthAgentJobCredentials", () => {
  it("issues an API key for the job owner, bound to the workspace and expiring with the job", async () => {
    const { auth, credentials } = setup();

    const issued = await credentials.issue({
      companyId: COMPANY_ID,
      ownerUserId: OWNER_ID,
      jobId: JOB_ID,
      expiresAt: EXPIRES_AT,
    });

    expect(issued).toEqual({ token: "secret-key", url: `https://app.example.test/api/v1/mcp/w/${COMPANY_ID}` });
    expect(auth.createExpiringApiKey).toHaveBeenCalledWith({
      ownerEmail: "Owner@Example.test",
      companyId: COMPANY_ID,
      name: `Runner job ${JOB_ID}`,
      expiresAt: EXPIRES_AT,
    });
  });

  it("issues nothing when the owner is gone, inactive or from another workspace", async () => {
    const gone = setup(null);
    expect(
      await gone.credentials.issue({
        companyId: COMPANY_ID,
        ownerUserId: OWNER_ID,
        jobId: JOB_ID,
        expiresAt: EXPIRES_AT,
      }),
    ).toBeNull();
    expect(gone.auth.createExpiringApiKey).not.toHaveBeenCalled();

    const foreign = setup({ email: "owner@example.test", companyId: OTHER_COMPANY_ID });
    expect(
      await foreign.credentials.issue({
        companyId: COMPANY_ID,
        ownerUserId: OWNER_ID,
        jobId: JOB_ID,
        expiresAt: EXPIRES_AT,
      }),
    ).toBeNull();
    expect(foreign.auth.createExpiringApiKey).not.toHaveBeenCalled();
  });

  it("issues nothing when the owner has no login", async () => {
    const { auth, credentials } = setup();
    auth.createExpiringApiKey.mockResolvedValue(null);

    expect(
      await credentials.issue({ companyId: COMPANY_ID, ownerUserId: OWNER_ID, jobId: JOB_ID, expiresAt: EXPIRES_AT }),
    ).toBeNull();
  });

  it("revokes the key of exactly this job in this workspace", async () => {
    const { auth, credentials } = setup();

    await credentials.revoke({ companyId: COMPANY_ID, jobId: JOB_ID });

    expect(auth.revokeApiKeysNamed).toHaveBeenCalledWith(COMPANY_ID, agentJobKeyName(JOB_ID));
    expect(agentJobKeyName(JOB_ID)).toBe(`Runner job ${JOB_ID}`);
  });
});
