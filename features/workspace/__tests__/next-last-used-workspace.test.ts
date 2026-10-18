import { describe, expect, it } from "vitest";
import { Status } from "@/generated/prisma";

import { nextLastUsedCompanyId } from "../next-last-used-workspace";

const membership = (companyId: string, status: Status) => ({ companyId, status });

describe("nextLastUsedCompanyId", () => {
  it("prefers an active membership over older pending or inactive ones", () => {
    const memberships = [
      membership("left", Status.active),
      membership("inactive", Status.inactive),
      membership("pending", Status.pendingAuthorization),
      membership("active", Status.active),
    ];

    expect(nextLastUsedCompanyId(memberships, "left")).toBe("active");
  });

  it("falls back to a pending membership, then to an inactive one", () => {
    expect(
      nextLastUsedCompanyId(
        [membership("inactive", Status.inactive), membership("pending", Status.pendingAuthorization)],
        "left",
      ),
    ).toBe("pending");
    expect(nextLastUsedCompanyId([membership("inactive", Status.inactive)], "left")).toBe("inactive");
  });

  it("keeps the listed order among memberships of the same status", () => {
    expect(
      nextLastUsedCompanyId([membership("first", Status.active), membership("second", Status.active)], "left"),
    ).toBe("first");
  });

  it("returns null when the left workspace was the only membership", () => {
    expect(nextLastUsedCompanyId([membership("left", Status.active)], "left")).toBeNull();
  });
});
