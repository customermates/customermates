import { describe, expect, it } from "vitest";

import { currentErrorContext, runWithErrorContext, withScope } from "../error-context";

describe("error context isolation", () => {
  it("keeps simultaneous tenants isolated and preserves identity after a rejection unwinds", async () => {
    let continueFirst!: () => void;
    const wait = new Promise<void>((resolve) => {
      continueFirst = resolve;
    });
    const firstError = new Error("first");
    const first = runWithErrorContext({ user: { id: "first" }, tags: { companyId: "first-company" } }, async () => {
      await wait;
      expect(currentErrorContext().user?.id).toBe("first");
      throw firstError;
    });
    const caught = first.catch((error: unknown) => error);
    await runWithErrorContext({ user: { id: "second" } }, async () => {
      continueFirst();
      await Promise.resolve();
      expect(currentErrorContext().user?.id).toBe("second");
    });
    expect(await caught).toBe(firstError);
    expect(currentErrorContext(firstError)).toMatchObject({
      user: { id: "first" },
      tags: { companyId: "first-company" },
    });
    expect(currentErrorContext()).toEqual({});
  });

  it("clears inherited identity for bypassed work and restores the parent after a nested scope", async () => {
    await runWithErrorContext({ user: { id: "parent" } }, async () => {
      withScope((scope) => {
        scope.setUser({ id: "nested" });
        expect(currentErrorContext().user?.id).toBe("nested");
      });
      expect(currentErrorContext().user?.id).toBe("parent");
      await runWithErrorContext({}, () => {
        expect(currentErrorContext()).toEqual({});
      });
      expect(currentErrorContext().user?.id).toBe("parent");
    });
  });
});
