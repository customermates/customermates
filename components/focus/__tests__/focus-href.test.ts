import { describe, expect, it } from "vitest";

import { focusHref, focusTargetOfHref, parseFocus } from "../focus-href";

describe("focus links", () => {
  it("reads back the target of every link focusHref builds", () => {
    const list = { kind: "list", id: "4b1d6c1e-0a7e-4a35-9d8e-6f1f0f6b7a10" } as const;
    const field = { kind: "field", id: "f1", typeId: "t1" } as const;

    expect(focusTargetOfHref(focusHref(list))).toEqual(list);
    expect(focusTargetOfHref(focusHref(field))).toEqual({ kind: "field", id: "f1" });
  });

  it("finds no target in a link without a known focus kind", () => {
    expect(focusTargetOfHref("/configure")).toBeNull();
    expect(focusTargetOfHref("/configure?typeId=t1")).toBeNull();
    expect(focusTargetOfHref("/configure?focus=unknown:1")).toBeNull();
    expect(parseFocus("list")).toBeNull();
  });
});
