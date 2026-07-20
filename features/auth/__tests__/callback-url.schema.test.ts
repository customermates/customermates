import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    AUTH_ALLOWED_HOSTS: [
      "customermates-git-feat-inbox-customermates.vercel.app",
      "customermates-a1b2c3-customermates.vercel.app",
      "*.customermates.com",
    ],
    BASE_URL: "https://customermates-git-feat-inbox-customermates.vercel.app",
  },
}));

import { callbackUrlSchema } from "@/features/auth/callback-url.schema";

describe("callbackUrlSchema", () => {
  it.each([
    "/en/dashboard",
    "https://customermates-git-feat-inbox-customermates.vercel.app/en/dashboard",
    "https://customermates-a1b2c3-customermates.vercel.app/en/dashboard",
    "https://feat-inbox.customermates.com/en/dashboard",
  ])("accepts the configured deployment callback %s", (callback) => {
    expect(callbackUrlSchema.safeParse(callback).success).toBe(true);
  });

  it.each([
    "https://attacker.example/en/dashboard",
    "http://feat-inbox.customermates.com/en/dashboard",
    "javascript:alert(1)",
  ])("rejects the untrusted callback %s", (callback) => {
    expect(callbackUrlSchema.safeParse(callback).success).toBe(false);
  });
});
