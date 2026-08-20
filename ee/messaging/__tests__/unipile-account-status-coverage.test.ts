import { describe, it, expect } from "vitest";

import { UnipileAccountSchema } from "../unipile.schema";
import { mapUnipileStatus } from "../unipile.mappers";
import { ConnectedAccountStatus } from "@/generated/prisma";

const LIVE_STATUSES = ["running", "errored", "disconnected", "degraded", "partial"] as const;

function account(status: string) {
  return { object: "Account", id: "acc_1", provider: "google", status };
}

describe("unipile account status coverage", () => {
  it("accepts every status the v2 lifecycle documents", () => {
    for (const status of LIVE_STATUSES) {
      const parsed = UnipileAccountSchema.safeParse(account(status));
      expect(parsed.success, `status ${status} must parse`).toBe(true);
    }
  });

  it("maps each parsed status to a real account state rather than falling back to connecting", () => {
    for (const status of LIVE_STATUSES)
      expect(mapUnipileStatus(status), `status ${status} must map`).not.toBe(ConnectedAccountStatus.connecting);
  });

  it("maps the multi-product statuses by whether authentication is required", () => {
    expect(mapUnipileStatus("partial")).toBe(ConnectedAccountStatus.credentials);
    expect(mapUnipileStatus("degraded")).toBe(ConnectedAccountStatus.error);
  });
});
