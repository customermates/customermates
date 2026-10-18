import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isCheckoutWorkspaceSignature, signCheckoutWorkspace } from "../checkout-workspace-signature";
import { UNSIGNED_CHECKOUT_CLAIMS_END, acceptsUnsignedCheckoutClaim } from "../unsigned-checkout-claims";

const SECRET = "signature-test-secret";
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";

describe("the workspace signature of a checkout", () => {
  it("signs the workspace id with a key derived from the auth secret under its own label", () => {
    const signature = signCheckoutWorkspace(COMPANY_ID, SECRET);

    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signature).toBe(
      createHmac("sha256", `lemonsqueezy-checkout-workspace:v1:${SECRET}`).update(COMPANY_ID).digest("hex"),
    );
    expect(signature).not.toBe(createHmac("sha256", SECRET).update(COMPANY_ID).digest("hex"));
    expect(signCheckoutWorkspace(COMPANY_ID, ` ${SECRET}\n`)).toBe(signature);
  });

  it("accepts only the signature of the same workspace under the same secret", () => {
    const signature = signCheckoutWorkspace(COMPANY_ID, SECRET);

    expect(isCheckoutWorkspaceSignature(COMPANY_ID, signature, SECRET)).toBe(true);
    expect(isCheckoutWorkspaceSignature("00000000-0000-4000-8000-000000000002", signature, SECRET)).toBe(false);
    expect(isCheckoutWorkspaceSignature(COMPANY_ID, signature, "another-secret")).toBe(false);
    expect(isCheckoutWorkspaceSignature(COMPANY_ID, signature.toUpperCase(), SECRET)).toBe(false);
    expect(isCheckoutWorkspaceSignature(COMPANY_ID, signature.slice(1), SECRET)).toBe(false);
    expect(isCheckoutWorkspaceSignature(COMPANY_ID, "", SECRET)).toBe(false);
  });

  it("refuses to sign or verify without an auth secret", () => {
    expect(() => signCheckoutWorkspace(COMPANY_ID, undefined)).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => signCheckoutWorkspace(COMPANY_ID, "  ")).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => isCheckoutWorkspaceSignature(COMPANY_ID, "a".repeat(64), undefined)).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe("unsigned workspace claims of older checkouts", () => {
  it("ends the transition at a fixed instant", () => {
    expect(UNSIGNED_CHECKOUT_CLAIMS_END.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });

  it("accepts only subscriptions created before the transition ended", () => {
    expect(acceptsUnsignedCheckoutClaim(new Date("2026-11-14T23:59:59.999Z"))).toBe(true);
    expect(acceptsUnsignedCheckoutClaim(new Date("2026-10-25T12:00:00.000Z"))).toBe(true);
    expect(acceptsUnsignedCheckoutClaim(new Date("2026-09-01T00:00:00.000Z"))).toBe(true);
    expect(acceptsUnsignedCheckoutClaim(UNSIGNED_CHECKOUT_CLAIMS_END)).toBe(false);
    expect(acceptsUnsignedCheckoutClaim(new Date("2026-11-16T00:00:00.000Z"))).toBe(false);
    expect(acceptsUnsignedCheckoutClaim(null)).toBe(false);
  });
});
