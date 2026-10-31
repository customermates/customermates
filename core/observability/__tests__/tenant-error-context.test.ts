import { describe, expect, it } from "vitest";

import type { TenantUser } from "@/features/user/user.schema";

import { runWithTenant, runWithoutTenant } from "@/core/decorators/tenant-context";

import { currentErrorContext } from "../error-context";

describe("tenant identity during error reporting", () => {
  it("preserves each request's identity when a nested bypass rejects and unwinds", async () => {
    const failures = await Promise.all(
      ["first", "second"].map(async (id) => {
        const failure = new Error(id);
        await runWithTenant({ id, companyId: `${id}-company` } as TenantUser, () =>
          runWithoutTenant(async () => {
            await Promise.resolve();
            throw failure;
          }),
        ).catch(() => undefined);
        return currentErrorContext(failure);
      }),
    );
    expect(failures).toEqual([
      { user: { id: "first" }, tags: { companyId: "first-company" } },
      { user: { id: "second" }, tags: { companyId: "second-company" } },
    ]);
    expect(currentErrorContext()).toEqual({});
  });

  it("does not invent identity for a fresh system invocation", async () => {
    const failure = new Error("system");
    await runWithoutTenant(() => {
      throw failure;
    }).catch(() => undefined);
    expect(currentErrorContext(failure)).toEqual({ tags: {} });
  });
});
