import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { Action, Resource } from "@/generated/prisma";

import { AuthAgentJobCredentials } from "../auth-agent-job-credentials";
import { agentJobKeyName, parseAgentJobCredentialMetadata } from "../agent-job-credential-marker";

import { COMPANY_ID, JOB_ID, OTHER_COMPANY_ID, OWNER_ID, RUNNER_ID } from "./agent-runner-fixtures";

const EXPIRES_AT = new Date("2026-11-17T09:15:00.000Z");
const API_ROLE = { isSystemRole: false, permissions: [{ resource: Resource.api, action: Action.readAll }] };
const NO_API_ROLE = { isSystemRole: false, permissions: [] };
const ATTEMPT = { companyId: COMPANY_ID, ownerUserId: OWNER_ID, jobId: JOB_ID, attempt: 1, runnerId: RUNNER_ID };

type Owner = { email: string; companyId: string; role: typeof API_ROLE | null };

function setup(
  owner: Owner | null = { email: "Owner@Example.test", companyId: COMPANY_ID, role: API_ROLE },
  planUsable = true,
) {
  const auth = {
    createExpiringApiKey: vi.fn().mockResolvedValue({ id: "key-1", key: "secret-key" }),
    revokeApiKeysNamed: vi.fn().mockResolvedValue(1),
    apiKeyRequestsNamed: vi.fn().mockResolvedValue(4),
  };
  const users = {
    getActiveUserByIdOrThrow: vi.fn((id: string) =>
      owner ? Promise.resolve({ id, ...owner }) : Promise.reject(new Error("user not found")),
    ),
  };
  const plans = { canUseIntegrations: vi.fn().mockResolvedValue(planUsable) };
  const credentials = new AuthAgentJobCredentials(auth, users as never, plans, "https://app.example.test");
  return { auth, users, plans, credentials };
}

describe("AuthAgentJobCredentials", () => {
  it("issues a key of the job owner that is marked as the credential of this attempt on this runner", async () => {
    const { auth, credentials } = setup();

    const issued = await credentials.issue({ ...ATTEMPT, expiresAt: EXPIRES_AT });

    expect(issued).toEqual({
      ok: true,
      credentials: { token: "secret-key", url: "https://app.example.test/api/v1/mcp" },
    });
    const created = auth.createExpiringApiKey.mock.calls[0][0];
    expect(created).toMatchObject({
      ownerEmail: "Owner@Example.test",
      companyId: COMPANY_ID,
      name: `Runner job ${JOB_ID} #1`,
      expiresAt: EXPIRES_AT,
    });
    expect(parseAgentJobCredentialMetadata(created.metadata)).toEqual({
      jobId: JOB_ID,
      attempt: 1,
      runnerId: RUNNER_ID,
    });
  });

  it("removes the keys of earlier attempts before it issues the key of a later one", async () => {
    const { auth, credentials } = setup();

    await credentials.issue({ ...ATTEMPT, attempt: 2, expiresAt: EXPIRES_AT });

    expect(auth.revokeApiKeysNamed.mock.calls).toEqual([
      [COMPANY_ID, agentJobKeyName(JOB_ID, 1)],
      [COMPANY_ID, agentJobKeyName(JOB_ID, 2)],
    ]);
    expect(auth.createExpiringApiKey.mock.calls[0][0].name).toBe(agentJobKeyName(JOB_ID, 2));
  });

  it("issues nothing when the owner is gone, inactive or from another workspace", async () => {
    const gone = setup(null);
    expect(await gone.credentials.issue({ ...ATTEMPT, expiresAt: EXPIRES_AT })).toEqual({
      ok: false,
      reason: "ownerInactive",
    });
    expect(gone.auth.createExpiringApiKey).not.toHaveBeenCalled();

    const foreign = setup({ email: "owner@example.test", companyId: OTHER_COMPANY_ID, role: API_ROLE });
    expect(await foreign.credentials.issue({ ...ATTEMPT, expiresAt: EXPIRES_AT })).toEqual({
      ok: false,
      reason: "ownerInactive",
    });
    expect(foreign.auth.createExpiringApiKey).not.toHaveBeenCalled();
  });

  it("issues nothing when the owner's role may not use the API, so no job runs with a key the server refuses", async () => {
    for (const role of [NO_API_ROLE, null]) {
      const { auth, credentials } = setup({ email: "owner@example.test", companyId: COMPANY_ID, role });

      expect(await credentials.issue({ ...ATTEMPT, expiresAt: EXPIRES_AT })).toEqual({
        ok: false,
        reason: "ownerApiAccess",
      });
      expect(auth.createExpiringApiKey).not.toHaveBeenCalled();
    }
  });

  it("issues nothing when the workspace plan no longer allows API access", async () => {
    const { auth, credentials } = setup(undefined, false);

    expect(await credentials.issue({ ...ATTEMPT, expiresAt: EXPIRES_AT })).toEqual({
      ok: false,
      reason: "planRequired",
    });
    expect(auth.createExpiringApiKey).not.toHaveBeenCalled();
  });

  it("issues nothing when the owner has no login", async () => {
    const { auth, credentials } = setup();
    auth.createExpiringApiKey.mockResolvedValue(null);

    expect(await credentials.issue({ ...ATTEMPT, expiresAt: EXPIRES_AT })).toEqual({
      ok: false,
      reason: "ownerInactive",
    });
  });

  it("reads the tool calls and revokes the key of exactly this attempt in this workspace", async () => {
    const { auth, credentials } = setup();
    const attempt = { companyId: COMPANY_ID, jobId: JOB_ID, attempt: 2 };

    expect(await credentials.toolCalls(attempt)).toBe(4);
    await credentials.revoke(attempt);

    expect(auth.apiKeyRequestsNamed).toHaveBeenCalledWith(COMPANY_ID, `Runner job ${JOB_ID} #2`);
    expect(auth.revokeApiKeysNamed).toHaveBeenCalledWith(COMPANY_ID, `Runner job ${JOB_ID} #2`);
  });
});

describe("the job credential marker", () => {
  it("is read from the stored text, also when the library hands it back parsed or stringified twice", () => {
    const marker = { jobId: JOB_ID, attempt: 2, runnerId: RUNNER_ID };
    const stored = JSON.stringify({ agentJob: marker });

    expect(parseAgentJobCredentialMetadata(stored)).toEqual(marker);
    expect(parseAgentJobCredentialMetadata({ agentJob: marker })).toEqual(marker);
    expect(parseAgentJobCredentialMetadata(JSON.stringify(stored))).toEqual(marker);
  });

  it("is absent on an ordinary key and on malformed metadata", () => {
    for (const metadata of [null, undefined, "", "{", "{}", '{"agentJob":{"jobId":"x"}}', { agentJob: null }, 7])
      expect(parseAgentJobCredentialMetadata(metadata)).toBeNull();
  });
});
