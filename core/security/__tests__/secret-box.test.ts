import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  BETTER_AUTH_SECRET: "a-long-test-only-authentication-secret",
  SECRET_BOX_KEY: undefined as string | undefined,
}));

vi.mock("@/env", () => ({ env: mockEnv }));

import { openSecret, sealSecret, secretLast4, SecretBoxError } from "../secret-box";

describe("secret box", () => {
  beforeEach(() => {
    mockEnv.BETTER_AUTH_SECRET = "a-long-test-only-authentication-secret";
    mockEnv.SECRET_BOX_KEY = undefined;
  });

  it("seals and opens a value with a fresh nonce each time", () => {
    const first = sealSecret("sk-ant-example-0001");
    const second = sealSecret("sk-ant-example-0001");

    expect(first).not.toBe(second);
    expect(first.startsWith("v1.")).toBe(true);
    expect(openSecret(first)).toBe("sk-ant-example-0001");
    expect(openSecret(second)).toBe("sk-ant-example-0001");
  });

  it("prefers a configured 32 byte key over the derived one and refuses other lengths", () => {
    mockEnv.SECRET_BOX_KEY = Buffer.alloc(32, 7).toString("base64");
    const sealed = sealSecret("value");
    expect(openSecret(sealed)).toBe("value");

    mockEnv.SECRET_BOX_KEY = undefined;
    expect(() => openSecret(sealed)).toThrow(SecretBoxError);

    mockEnv.SECRET_BOX_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => sealSecret("value")).toThrow("32 bytes");
  });

  it("rejects tampered and malformed values", () => {
    const sealed = sealSecret("value");
    const [version, iv, tag, data] = sealed.split(".");
    const flipped = data.startsWith("A") ? `B${data.slice(1)}` : `A${data.slice(1)}`;

    expect(() => openSecret([version, iv, tag, flipped].join("."))).toThrow(SecretBoxError);
    expect(() => openSecret("v2.a.b.c")).toThrow("unknown format");
    expect(() => openSecret("not sealed")).toThrow("unknown format");
  });

  it("keeps only the last four characters for display", () => {
    expect(secretLast4("sk-ant-example-0001")).toBe("0001");
    expect(secretLast4("ab")).toBe("ab");
  });
});
