import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  BETTER_AUTH_SECRET: "a-long-test-only-authentication-secret" as string | undefined,
  SECRET_BOX_KEY: undefined as string | undefined,
}));

vi.mock("@/env", () => ({ env: mockEnv }));

import { openSecret, sealSecret, secretLast4, SecretBoxError } from "../secret-box";

const OWNER = ["agent-provider-key", "company-1", "anthropic"] as const;

function sealWithoutOwner(plain: string, secret: string): string {
  const key = new Uint8Array(hkdfSync("sha256", secret, "", "customermates-secret-box-v1", 32));
  const iv = new Uint8Array(randomBytes(12));
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const data = `${cipher.update(plain, "utf8", "base64url")}${cipher.final("base64url")}`;
  const part = (value: Uint8Array) => Buffer.from(value).toString("base64url");
  return ["v1", part(iv), cipher.getAuthTag().toString("base64url"), data].join(".");
}

function failureOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof SecretBoxError ? error.failure : "other";
  }
}

describe("secret box", () => {
  beforeEach(() => {
    mockEnv.BETTER_AUTH_SECRET = "a-long-test-only-authentication-secret";
    mockEnv.SECRET_BOX_KEY = undefined;
  });

  it("seals and opens a value with a fresh nonce each time", () => {
    const first = sealSecret("sk-ant-example-0001", OWNER);
    const second = sealSecret("sk-ant-example-0001", OWNER);

    expect(first).not.toBe(second);
    expect(first.startsWith("v2.")).toBe(true);
    expect(openSecret(first, OWNER)).toBe("sk-ant-example-0001");
    expect(openSecret(second, OWNER)).toBe("sk-ant-example-0001");
  });

  it("opens a value only for the owner it was sealed for", () => {
    const sealed = sealSecret("sk-ant-example-0001", OWNER);

    expect(failureOf(() => openSecret(sealed, ["agent-provider-key", "company-2", "anthropic"]))).toBe("unreadable");
    expect(failureOf(() => openSecret(sealed, ["agent-provider-key", "company-1", "openai"]))).toBe("unreadable");
    expect(failureOf(() => sealSecret("value", []))).toBe("configuration");
    expect(failureOf(() => sealSecret("value", ["agent-provider-key", ""]))).toBe("configuration");
  });

  it("refuses a value that is sealed without an owner, although the key fits", () => {
    const sealed = sealWithoutOwner("sk-ant-example-0001", "a-long-test-only-authentication-secret");

    expect(failureOf(() => openSecret(sealed, OWNER))).toBe("format");
    expect(failureOf(() => openSecret(sealed.replace(/^v1\./, "v2."), OWNER))).toBe("unreadable");
  });

  it("keeps values sealed before SECRET_BOX_KEY was set readable and seals new ones with the configured key", () => {
    const before = sealSecret("old value", OWNER);

    mockEnv.SECRET_BOX_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(openSecret(before, OWNER)).toBe("old value");

    const after = sealSecret("new value", OWNER);
    expect(openSecret(after, OWNER)).toBe("new value");
    mockEnv.SECRET_BOX_KEY = undefined;
    expect(failureOf(() => openSecret(after, OWNER))).toBe("unreadable");
  });

  it("reports a value sealed with another secret as unreadable, not as malformed", () => {
    const sealed = sealSecret("value", OWNER);

    mockEnv.BETTER_AUTH_SECRET = "a-rotated-test-only-authentication-secret";
    expect(failureOf(() => openSecret(sealed, OWNER))).toBe("unreadable");

    mockEnv.SECRET_BOX_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(failureOf(() => openSecret(sealed, OWNER))).toBe("unreadable");
  });

  it("refuses a configured key of another length and a server without any secret", () => {
    mockEnv.SECRET_BOX_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => sealSecret("value", OWNER)).toThrow("32 bytes");
    expect(failureOf(() => sealSecret("value", OWNER))).toBe("configuration");

    mockEnv.SECRET_BOX_KEY = undefined;
    const sealed = sealSecret("value", OWNER);
    mockEnv.BETTER_AUTH_SECRET = undefined;
    expect(failureOf(() => sealSecret("value", OWNER))).toBe("configuration");
    expect(failureOf(() => openSecret(sealed, OWNER))).toBe("configuration");
  });

  it("rejects tampered and malformed values", () => {
    const sealed = sealSecret("value", OWNER);
    const [version, iv, tag, data] = sealed.split(".");
    const flipped = data.startsWith("A") ? `B${data.slice(1)}` : `A${data.slice(1)}`;

    expect(() => openSecret([version, iv, tag, flipped].join("."), OWNER)).toThrow(SecretBoxError);
    expect(() =>
      openSecret(
        [version, iv, Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url"), data].join("."),
        OWNER,
      ),
    ).toThrow(SecretBoxError);
    expect(failureOf(() => openSecret(["v1", iv, tag, data].join("."), OWNER))).toBe("format");
    expect(() => openSecret("v3.a.b.c", OWNER)).toThrow("unknown format");
    expect(() => openSecret("not sealed", OWNER)).toThrow("unknown format");
    expect(failureOf(() => openSecret("not sealed", OWNER))).toBe("format");
  });

  it("keeps only the last four characters for display", () => {
    expect(secretLast4("sk-ant-example-0001")).toBe("0001");
    expect(secretLast4("ab")).toBe("ab");
  });
});
