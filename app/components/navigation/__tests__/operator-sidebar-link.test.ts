import { describe, expect, it } from "vitest";

import { resolveOperatorSidebarLink } from "../operator-sidebar-link";

describe("resolveOperatorSidebarLink", () => {
  it("omits the operator link when console visibility is false", () => {
    expect(resolveOperatorSidebarLink(false, "/operator/users")).toBeNull();
  });

  it("returns an active, non-prefetched Users link throughout the operator route", () => {
    expect(resolveOperatorSidebarLink(true, "/operator/hosted-ai")).toEqual({
      href: "/operator/users",
      isActive: true,
      prefetch: false,
    });
  });

  it("marks the sidebar destination current only on the exact Users route", () => {
    expect(resolveOperatorSidebarLink(true, "/operator/users")).toEqual({
      ariaCurrent: "page",
      href: "/operator/users",
      isActive: true,
      prefetch: false,
    });
    expect(resolveOperatorSidebarLink(true, "/operator/hosted-ai")).not.toHaveProperty("ariaCurrent");
  });

  it("keeps the visible operator link inactive outside the operator route", () => {
    expect(resolveOperatorSidebarLink(true, "/dashboard")).toEqual({
      href: "/operator/users",
      isActive: false,
      prefetch: false,
    });
  });
});
