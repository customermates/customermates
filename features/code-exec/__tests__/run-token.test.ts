import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { SANDBOX_TOKEN_SECRET: "test-secret-key" } }));

const { issueRunToken, verifyRunToken } = await import("../run-token");

describe("run-token", () => {
  it("round-trips claims for a valid token", () => {
    const { token, claims } = issueRunToken({ companyId: "co_1", userId: "u_1", ttlMs: 60_000 });
    const verified = verifyRunToken(token);

    expect(verified).not.toBeNull();
    expect(verified?.companyId).toBe("co_1");
    expect(verified?.userId).toBe("u_1");
    expect(verified?.jti).toBe(claims.jti);
  });

  it("rejects a tampered payload (e.g. swapped companyId)", () => {
    const { token } = issueRunToken({ companyId: "co_1", userId: "u_1", ttlMs: 60_000 });
    const [, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ companyId: "co_EVIL", userId: "u_1", jti: "x", exp: Date.now() + 60_000 }),
    ).toString("base64url");

    expect(verifyRunToken(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const { token } = issueRunToken({ companyId: "co_1", userId: "u_1", ttlMs: 60_000 });
    const [payload] = token.split(".");

    expect(verifyRunToken(`${payload}.deadbeef`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const { token } = issueRunToken({ companyId: "co_1", userId: "u_1", ttlMs: -1_000 });

    expect(verifyRunToken(token)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyRunToken("")).toBeNull();
    expect(verifyRunToken("nodot")).toBeNull();
    expect(verifyRunToken(".sig")).toBeNull();
  });
});
