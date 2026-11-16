import { describe, expect, it } from "vitest";

import { navUserTriggerLabel } from "../nav-user-label";

const ada = { name: "Ada Lovelace", email: "ada@example.com", menu: "Account menu", notVerified: "Not verified" };

describe("navUserTriggerLabel", () => {
  it("names the person and the menu", () => {
    const label = navUserTriggerLabel({ ...ada, emailVerified: true });

    expect(label).toBe("Ada Lovelace, Account menu");
  });

  it("falls back to the address when there is no name", () => {
    const label = navUserTriggerLabel({ ...ada, name: "", emailVerified: null });

    expect(label).toBe("ada@example.com, Account menu");
  });

  it("adds the unverified state that the hidden dot shows", () => {
    const label = navUserTriggerLabel({ ...ada, emailVerified: false });

    expect(label).toBe("Ada Lovelace, Account menu, Not verified");
  });
});
