import { describe, expect, it } from "vitest";

import { errorDigest } from "../error-digest";

const REDACTED_MESSAGE =
  "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.";

describe("errorDigest", () => {
  it("reads the digest the framework attaches to a redacted render error", () => {
    expect(errorDigest(Object.assign(new Error(REDACTED_MESSAGE), { digest: "301885173" }))).toBe("301885173");
  });

  it("reads a digest from any error shape that carries one", () => {
    expect(errorDigest({ digest: "1745485709" })).toBe("1745485709");
  });

  it("returns null when there is no usable digest", () => {
    expect(errorDigest(new Error(REDACTED_MESSAGE))).toBeNull();
    expect(errorDigest(Object.assign(new Error("boom"), { digest: "" }))).toBeNull();
    expect(errorDigest(Object.assign(new Error("boom"), { digest: 12345 }))).toBeNull();
  });

  it("ignores values that are not error objects", () => {
    expect(errorDigest(null)).toBeNull();
    expect(errorDigest(undefined)).toBeNull();
    expect(errorDigest("301885173")).toBeNull();
  });
});
