import { describe, expect, it } from "vitest";

import { routinesRedirectPath } from "../../routines-redirect";

describe("the old Routines address", () => {
  it("opens the Automations page on its routines", () => {
    expect(routinesRedirectPath({})).toBe("/automations?kind=routine");
  });

  it("keeps the query of an old link, so a focused routine still opens", () => {
    expect(routinesRedirectPath({ focus: "routine:8d7a", view: "abc" })).toBe(
      "/automations?kind=routine&focus=routine%3A8d7a&view=abc",
    );
    expect(routinesRedirectPath({ tag: ["a", "b"], empty: undefined })).toBe("/automations?kind=routine&tag=a&tag=b");
  });

  it("does not let a carried kind change where the page now lives", () => {
    expect(routinesRedirectPath({ kind: "rule", page: "2" })).toBe("/automations?kind=routine&page=2");
  });
});
