import { describe, expect, it } from "vitest";

import { installRandomUuidFallback, uuidFromRandomBytes } from "../random-uuid-fallback";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe("random UUID fallback", () => {
  it("formats 16 random bytes as a version 4 UUID", () => {
    expect(uuidFromRandomBytes(new Uint8Array(16).fill(0xff))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(uuidFromRandomBytes(new Uint8Array(16))).toBe("00000000-0000-4000-8000-000000000000");
    expect(() => uuidFromRandomBytes(new Uint8Array(8))).toThrow();
  });

  it("adds randomUUID where the browser withholds it, as on a page served over plain HTTP", () => {
    const source = {
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => globalThis.crypto.getRandomValues(array),
    };
    installRandomUuidFallback(source);
    const { randomUUID } = source as { randomUUID?: () => string };

    expect(randomUUID?.()).toMatch(UUID_V4);
    expect(randomUUID?.()).not.toBe(randomUUID?.());
  });

  it("leaves an existing randomUUID alone", () => {
    const native = () => "11111111-1111-4111-8111-111111111111" as const;
    const source = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto), randomUUID: native };
    installRandomUuidFallback(source);

    expect(source.randomUUID).toBe(native);
  });
});
